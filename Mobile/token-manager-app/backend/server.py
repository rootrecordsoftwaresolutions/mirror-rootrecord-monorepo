"""RootRecord Token Manager — Mobile API.

Non-custodial Solana companion backend: stores per-wallet preferences and an
address book keyed by the wallet public key. Also offers a CoinGecko SOL price
proxy so the mobile client doesn't hit rate limits from each install.

We deliberately do NOT hold private keys, seed phrases, or signed transactions.
"""

from dotenv import load_dotenv
load_dotenv()

import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import httpx
import base58
from fastapi import FastAPI, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config + DB
# ---------------------------------------------------------------------------

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
SOLANA_DEFAULT_NETWORK = os.environ.get("SOLANA_DEFAULT_NETWORK", "mainnet-beta")
COINGECKO_BASE = os.environ.get("COINGECKO_BASE", "https://api.coingecko.com/api/v3").rstrip("/")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="RootRecord Token Manager — Mobile API", version="0.1.0")

_cors_origins = [o.strip() for o in CORS_ORIGINS.split(",")] if CORS_ORIGINS != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=CORS_ORIGINS != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")

VALID_NETWORKS = {"mainnet-beta", "devnet", "testnet"}

# simple in-memory cache for SOL price (ttl)
_PRICE_CACHE: dict = {}
_PRICE_TTL_SEC = 45


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id() -> str:
    return uuid.uuid4().hex


_PUBKEY_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


def _validate_pubkey(pubkey: str) -> str:
    """Validate a Solana base58 pubkey (32-byte ed25519 public key)."""
    pk = (pubkey or "").strip()
    if not _PUBKEY_RE.match(pk):
        raise HTTPException(status_code=400, detail="Invalid Solana public key format.")
    try:
        raw = base58.b58decode(pk)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base58 Solana public key.")
    if len(raw) != 32:
        raise HTTPException(status_code=400, detail="Solana public key must decode to 32 bytes.")
    return pk


def _strip(d: dict) -> dict:
    if d and "_id" in d:
        d.pop("_id", None)
    return d


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ConnectIn(BaseModel):
    pubkey: str
    device_id: Optional[str] = None


class Preferences(BaseModel):
    network: str = SOLANA_DEFAULT_NETWORK  # mainnet-beta | devnet | testnet
    currency: str = "USD"
    show_nfts: bool = True
    show_zero_balances: bool = False


class PreferencesPatch(BaseModel):
    network: Optional[str] = None
    currency: Optional[str] = None
    show_nfts: Optional[bool] = None
    show_zero_balances: Optional[bool] = None


class ContactIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    address: str
    note: Optional[str] = Field(default="", max_length=280)


class ContactOut(BaseModel):
    id: str
    label: str
    address: str
    note: str = ""
    created_at: str


# ---------------------------------------------------------------------------
# Wallet / preferences
# ---------------------------------------------------------------------------

async def _ensure_wallet(pubkey: str) -> dict:
    existing = await db.wallets.find_one({"pubkey": pubkey}, {"_id": 0})
    if existing:
        await db.wallets.update_one(
            {"pubkey": pubkey}, {"$set": {"last_seen": now_iso()}}
        )
        return existing
    doc = {
        "pubkey": pubkey,
        "preferences": Preferences().model_dump(),
        "created_at": now_iso(),
        "last_seen": now_iso(),
    }
    await db.wallets.insert_one(dict(doc))
    return doc


@api.post("/wallets/connect")
async def connect_wallet(body: ConnectIn):
    """Register/refresh a wallet by public key. No signing required.

    The server only stores the pubkey + preferences; it never holds secrets.
    """
    pk = _validate_pubkey(body.pubkey)
    w = await _ensure_wallet(pk)
    return {
        "pubkey": pk,
        "preferences": w.get("preferences", Preferences().model_dump()),
        "created_at": w.get("created_at", now_iso()),
    }


@api.get("/wallets/{pubkey}/preferences")
async def get_preferences(pubkey: str):
    pk = _validate_pubkey(pubkey)
    w = await _ensure_wallet(pk)
    return w.get("preferences", Preferences().model_dump())


@api.patch("/wallets/{pubkey}/preferences")
async def patch_preferences(pubkey: str, body: PreferencesPatch):
    pk = _validate_pubkey(pubkey)
    await _ensure_wallet(pk)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "network" in data and data["network"] not in VALID_NETWORKS:
        raise HTTPException(status_code=400, detail=f"network must be one of {sorted(VALID_NETWORKS)}")
    if not data:
        w = await db.wallets.find_one({"pubkey": pk}, {"_id": 0})
        return w.get("preferences", Preferences().model_dump())
    update = {f"preferences.{k}": v for k, v in data.items()}
    update["last_seen"] = now_iso()
    await db.wallets.update_one({"pubkey": pk}, {"$set": update})
    w = await db.wallets.find_one({"pubkey": pk}, {"_id": 0})
    return w.get("preferences", Preferences().model_dump())


# ---------------------------------------------------------------------------
# Address book
# ---------------------------------------------------------------------------

@api.get("/wallets/{pubkey}/contacts")
async def list_contacts(pubkey: str):
    pk = _validate_pubkey(pubkey)
    await _ensure_wallet(pk)
    cursor = db.contacts.find({"owner": pk}, {"_id": 0}).sort("created_at", -1)
    return [c async for c in cursor]


@api.post("/wallets/{pubkey}/contacts")
async def create_contact(pubkey: str, body: ContactIn):
    pk = _validate_pubkey(pubkey)
    addr = _validate_pubkey(body.address)
    await _ensure_wallet(pk)
    doc = {
        "id": new_id(),
        "owner": pk,
        "label": body.label.strip(),
        "address": addr,
        "note": (body.note or "").strip(),
        "created_at": now_iso(),
    }
    await db.contacts.insert_one(dict(doc))
    return _strip(dict(doc))


@api.delete("/wallets/{pubkey}/contacts/{contact_id}")
async def delete_contact(pubkey: str, contact_id: str):
    pk = _validate_pubkey(pubkey)
    res = await db.contacts.delete_one({"id": contact_id, "owner": pk})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Price proxy (CoinGecko)
# ---------------------------------------------------------------------------

@api.get("/price/sol")
async def sol_price(vs: str = "usd"):
    """Return current SOL price via CoinGecko, with a short in-process cache."""
    vs = (vs or "usd").lower()
    key = f"sol:{vs}"
    cached = _PRICE_CACHE.get(key)
    if cached and cached[1] > time.time():
        return cached[0]
    url = f"{COINGECKO_BASE}/simple/price"
    try:
        async with httpx.AsyncClient(timeout=12.0) as cx:
            r = await cx.get(url, params={"ids": "solana", "vs_currencies": vs, "include_24hr_change": "true"})
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Price service unreachable: {e}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Price service returned HTTP {r.status_code}")
    try:
        body = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Price service returned non-JSON.")
    sol = body.get("solana") or {}
    price = sol.get(vs)
    change = sol.get(f"{vs}_24h_change")
    if price is None:
        raise HTTPException(status_code=502, detail="Price service did not return SOL price.")
    out = {"symbol": "SOL", "vs": vs, "price": float(price), "change_24h_pct": change, "updated_at": now_iso()}
    _PRICE_CACHE[key] = (out, time.time() + _PRICE_TTL_SEC)
    return out


# ---------------------------------------------------------------------------
# Network status + RPC endpoints
# ---------------------------------------------------------------------------

RPC_ENDPOINTS = {
    "mainnet-beta": "https://api.mainnet-beta.solana.com",
    "devnet": "https://api.devnet.solana.com",
    "testnet": "https://api.testnet.solana.com",
}


@api.get("/network/endpoints")
async def network_endpoints():
    """Public Solana RPC endpoints the frontend can use directly (CORS-enabled)."""
    return {
        "default": SOLANA_DEFAULT_NETWORK,
        "endpoints": RPC_ENDPOINTS,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"ok": True, "db": True, "service": "rootrecord-token-manager"}
    except Exception as e:
        return {"ok": False, "db": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def on_startup():
    await db.wallets.create_index("pubkey", unique=True)
    await db.contacts.create_index([("owner", 1), ("created_at", -1)])
    await db.contacts.create_index("id", unique=True)


app.include_router(api)
