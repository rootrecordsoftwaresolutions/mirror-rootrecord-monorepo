"""Backend regression tests for RootRecord Token Manager API.

Covers: health, wallet connect/prefs, contacts CRUD, SOL price proxy+cache,
network endpoints, and invalid-input handling. No auth; pubkey is the identity.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://40b48fc1-bc8d-40bb-a9a3-ba2758566476.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Two valid base58 pubkeys that decode to 32 bytes (from the test context).
PUBKEY_A = "HXk3aFzLwVWqBz2eVrRq3fKoFMq6WjkP8mC9N2abF1Ax"
PUBKEY_B = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
# A third valid pubkey (Solana system program) for contact addresses.
SYSTEM_PROGRAM = "11111111111111111111111111111111"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ----- Health --------------------------------------------------------------

def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("db") is True


# ----- Wallet connect ------------------------------------------------------

def test_connect_wallet_and_defaults(s):
    r = s.post(f"{API}/wallets/connect", json={"pubkey": PUBKEY_A})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["pubkey"] == PUBKEY_A
    prefs = data["preferences"]
    assert prefs["network"] == "mainnet-beta"
    assert prefs["currency"] == "USD"
    assert prefs["show_nfts"] is True
    assert prefs["show_zero_balances"] is False
    assert "created_at" in data
    assert "_id" not in data


def test_connect_wallet_idempotent(s):
    r1 = s.post(f"{API}/wallets/connect", json={"pubkey": PUBKEY_A})
    r2 = s.post(f"{API}/wallets/connect", json={"pubkey": PUBKEY_A})
    assert r1.status_code == 200 and r2.status_code == 200
    # created_at should not change on 2nd call
    assert r1.json()["created_at"] == r2.json()["created_at"]


@pytest.mark.parametrize("bad", [
    "",
    "short",
    "not-a-key-123",          # contains - which is not base58
    "0OIl1",                  # contains forbidden base58 chars (0,O,I,l)
    "1" * 31,                 # too short for regex
    "1" * 45,                 # too long for regex
    # 44-char base58 that likely won't decode to 32 bytes (all z's)
    "z" * 44,
])
def test_connect_wallet_rejects_invalid(s, bad):
    r = s.post(f"{API}/wallets/connect", json={"pubkey": bad})
    assert r.status_code in (400, 422), f"bad={bad!r} got {r.status_code}: {r.text}"


# ----- Preferences ---------------------------------------------------------

def test_get_preferences_seeds_defaults_for_new_wallet(s):
    r = s.get(f"{API}/wallets/{PUBKEY_B}/preferences")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["network"] == "mainnet-beta"
    assert p["currency"] == "USD"
    assert p["show_nfts"] is True
    assert p["show_zero_balances"] is False


def test_patch_preferences_updates(s):
    r = s.patch(f"{API}/wallets/{PUBKEY_A}/preferences", json={"network": "devnet", "show_nfts": False})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["network"] == "devnet"
    assert p["show_nfts"] is False
    # verify persistence
    r2 = s.get(f"{API}/wallets/{PUBKEY_A}/preferences")
    assert r2.status_code == 200
    assert r2.json()["network"] == "devnet"
    assert r2.json()["show_nfts"] is False
    # reset for following tests
    s.patch(f"{API}/wallets/{PUBKEY_A}/preferences", json={"network": "mainnet-beta", "show_nfts": True})


def test_patch_preferences_rejects_invalid_network(s):
    r = s.patch(f"{API}/wallets/{PUBKEY_A}/preferences", json={"network": "invalid-net"})
    assert r.status_code == 400, r.text


def test_patch_preferences_empty_body_returns_current(s):
    r = s.patch(f"{API}/wallets/{PUBKEY_A}/preferences", json={})
    assert r.status_code == 200, r.text
    p = r.json()
    for key in ("network", "currency", "show_nfts", "show_zero_balances"):
        assert key in p


# ----- Contacts ------------------------------------------------------------

def test_contacts_crud_and_isolation(s):
    # Create contact for A
    r = s.post(f"{API}/wallets/{PUBKEY_A}/contacts", json={"label": "TEST_Alice", "address": SYSTEM_PROGRAM, "note": "hi"})
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["label"] == "TEST_Alice"
    assert c["address"] == SYSTEM_PROGRAM
    assert c["note"] == "hi"
    assert "id" in c and isinstance(c["id"], str) and len(c["id"]) > 0
    assert "created_at" in c
    assert "_id" not in c
    contact_id = c["id"]

    # Create second contact for A to test newest-first sort
    time.sleep(1.1)
    r2 = s.post(f"{API}/wallets/{PUBKEY_A}/contacts", json={"label": "TEST_Bob", "address": PUBKEY_B})
    assert r2.status_code == 200
    contact_id2 = r2.json()["id"]

    # List contacts for A
    r3 = s.get(f"{API}/wallets/{PUBKEY_A}/contacts")
    assert r3.status_code == 200
    lst = r3.json()
    assert isinstance(lst, list)
    labels = [x["label"] for x in lst]
    assert "TEST_Alice" in labels
    assert "TEST_Bob" in labels
    # newest first
    assert lst[0]["label"] == "TEST_Bob"
    for item in lst:
        assert "_id" not in item

    # Contacts for B should not include A's contacts
    r4 = s.get(f"{API}/wallets/{PUBKEY_B}/contacts")
    assert r4.status_code == 200
    b_labels = [x["label"] for x in r4.json()]
    assert "TEST_Alice" not in b_labels
    assert "TEST_Bob" not in b_labels

    # Delete one contact, verify removed
    rd = s.delete(f"{API}/wallets/{PUBKEY_A}/contacts/{contact_id}")
    assert rd.status_code == 200
    assert rd.json().get("ok") is True

    r5 = s.get(f"{API}/wallets/{PUBKEY_A}/contacts")
    assert contact_id not in [x["id"] for x in r5.json()]

    # Deleting unknown id -> 404
    rd404 = s.delete(f"{API}/wallets/{PUBKEY_A}/contacts/does-not-exist")
    assert rd404.status_code == 404

    # Cleanup: delete the second
    s.delete(f"{API}/wallets/{PUBKEY_A}/contacts/{contact_id2}")


def test_contact_invalid_address_rejected(s):
    r = s.post(f"{API}/wallets/{PUBKEY_A}/contacts", json={"label": "TEST_Bad", "address": "not-a-key-123"})
    assert r.status_code == 400, r.text


def test_contact_requires_label(s):
    r = s.post(f"{API}/wallets/{PUBKEY_A}/contacts", json={"label": "", "address": SYSTEM_PROGRAM})
    # pydantic validation -> 422
    assert r.status_code in (400, 422)


# ----- Price proxy ---------------------------------------------------------

def test_sol_price_default_vs_usd(s):
    r = s.get(f"{API}/price/sol")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["symbol"] == "SOL"
    assert d["vs"] == "usd"
    assert isinstance(d["price"], (int, float))
    assert "change_24h_pct" in d
    assert "updated_at" in d


def test_sol_price_cache_within_ttl(s):
    # first call may be cached from prev test; call twice back-to-back
    r1 = s.get(f"{API}/price/sol?vs=usd")
    r2 = s.get(f"{API}/price/sol?vs=usd")
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["updated_at"] == r2.json()["updated_at"], "cache should return identical updated_at within 45s"


# ----- Network endpoints ---------------------------------------------------

def test_network_endpoints(s):
    r = s.get(f"{API}/network/endpoints")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "endpoints" in d
    eps = d["endpoints"]
    assert "mainnet-beta" in eps and eps["mainnet-beta"].startswith("https://")
    assert "devnet" in eps and eps["devnet"].startswith("https://")
    assert "testnet" in eps and eps["testnet"].startswith("https://")
    assert d.get("default") in ("mainnet-beta", "devnet", "testnet")
