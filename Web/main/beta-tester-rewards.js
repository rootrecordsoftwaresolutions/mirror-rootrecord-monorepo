(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  /** Same app_id as account.js — summary balance is account-wide. */
  const BETA_EARN_APP_ID = "rootrecord_weather_manager_android";
  /** Must match PRO_REDEMPTION_UNIT_COST + PRO_REDEMPTION_DAYS on the server (earn.ts). */
  const REDEEM_COST = 100000;
  const REDEEM_DAYS = 30;

  function notifyPortalAuthChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-auth-change"));
    } catch {
      /* ignore */
    }
  }

  function el(id) {
    return document.getElementById(id);
  }

  function showPanel(name) {
    const map = { loading: "panel-rewards-loading", guest: "panel-rewards-guest", main: "panel-rewards-main" };
    const target = map[name] || map.loading;
    ["panel-rewards-loading", "panel-rewards-guest", "panel-rewards-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
    const redeem = el("rewards-redeem-card");
    if (redeem) redeem.hidden = name !== "main";
  }

  function formatExpiry(iso) {
    if (!iso) return "";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    try {
      return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  function setRedeemStatus(msg, kind) {
    const n = el("rewards-redeem-status");
    if (!n) return;
    if (!msg) {
      n.textContent = "";
      n.hidden = true;
      n.className = "status";
      return;
    }
    n.textContent = msg;
    n.hidden = false;
    n.className = "status" + (kind ? " status-" + kind : "");
  }

  function applyRedeemAvailability(balance, expiryIso) {
    const btn = el("rewards-redeem-btn");
    const exp = el("rewards-redeem-expiry");
    const n = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
    if (btn) {
      btn.disabled = n < REDEEM_COST;
      btn.textContent =
        n < REDEEM_COST
          ? "Need " + (REDEEM_COST - n).toLocaleString() + " more Root Units"
          : "Redeem 100,000 Root Units for 1 month Pro";
    }
    if (exp) {
      const formatted = formatExpiry(expiryIso);
      if (formatted) {
        exp.textContent = "Pro membership active until " + formatted + ".";
        exp.hidden = false;
      } else {
        exp.textContent = "";
        exp.hidden = true;
      }
    }
  }

  function setStatus(msg, kind) {
    const s = el("rewards-balance-status");
    if (!s) return;
    if (!msg) {
      s.textContent = "";
      s.hidden = true;
      s.className = "status";
      return;
    }
    s.textContent = msg;
    s.hidden = false;
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  async function loadApiBase() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    return typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
  }

  function formatBalance(n) {
    const b = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return String(b.toLocaleString());
  }

  function niceAppName(appId) {
    const s = String(appId || "").trim();
    if (!s) return "Unknown";
    if (s === "rootrecord_weather_manager_android") return "Weather Manager (Android)";
    if (s === "rootrecord_business_manager_android") return "Business Manager (Android)";
    if (s === "rootrecord_account_hub_android") return "Account Hub (Android)";
    if (s === "rootrecord_token_manager_android") return "Token Manager (Android)";
    if (s === "rootrecord_kilauea_alerts_android") return "Kilauea Alerts (Android)";
    return s.replace(/_/g, " ");
  }

  function renderSources(summary) {
    const wrap = el("rewards-sources");
    const list = el("rewards-sources-list");
    if (!wrap || !list) return;

    const arr = summary && typeof summary === "object" ? summary.per_app_total : null;
    if (!Array.isArray(arr) || arr.length === 0) {
      wrap.hidden = true;
      list.innerHTML = "";
      return;
    }
    const rows = arr
      .map(function (r) {
        const app = r && typeof r === "object" ? String(r.app_id || "") : "";
        const total = r && typeof r === "object" ? Number(r.total_units) : NaN;
        const n = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
        return { app_id: app, total_units: n };
      })
      .filter(function (r) {
        return r.app_id && r.total_units > 0;
      })
      .sort(function (a, b) {
        return b.total_units - a.total_units;
      });

    if (rows.length === 0) {
      wrap.hidden = true;
      list.innerHTML = "";
      return;
    }

    list.innerHTML =
      "<div class=account-grid>" +
      rows
        .map(function (r) {
          return (
            "<div class=account-row><span class=account-k>" +
            (niceAppName(r.app_id) + "</span><span class=account-v><strong>" + formatBalance(r.total_units) + "</strong></span></div>")
          );
        })
        .join("") +
      "</div>";
    wrap.hidden = false;
  }

  async function refreshRewardsBalance() {
    showPanel("loading");
    setStatus("");

    let apiBase;
    try {
      apiBase = await loadApiBase();
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    if (!apiBase) {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("Balance is not available on this copy of the site yet.", "warn");
      return;
    }

    const path = "/api/earn/summary?app_id=" + encodeURIComponent(BETA_EARN_APP_ID);
    const headers = new Headers();
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.set("Authorization", "Bearer " + token);
    let res;
    try {
      res = await fetch(apiBase + path, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      notifyPortalAuthChange();
      showPanel("guest");
      setStatus("");
      return;
    }

    if (!res.ok) {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    let j;
    try {
      j = await res.json();
    } catch {
      showPanel("main");
      const bal = el("beta-rewards-balance-val");
      if (bal) bal.textContent = "—";
      setStatus("We could not load your balance. Please try again in a moment.", "warn");
      return;
    }

    const n = j && typeof j === "object" ? Number(j.balance) : NaN;
    const bal = el("beta-rewards-balance-val");
    if (bal) {
      bal.textContent = Number.isFinite(n) ? formatBalance(n) : "—";
    }
    showPanel("main");
    renderSources(j);
    applyRedeemAvailability(Number.isFinite(n) ? n : 0, await fetchExistingProExpiry());
    if (!Number.isFinite(n)) {
      setStatus("Balance could not be read. Please try again in a moment.", "warn");
    }
  }

  async function fetchExistingProExpiry() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    let apiBase;
    try {
      apiBase = await loadApiBase();
    } catch {
      return null;
    }
    if (!apiBase) return null;
    try {
      // `/v1/me` is the license-account "who am I" endpoint (account.js uses the same path)
      // and now includes `pro_redeemed_until` whenever a rewards redemption window is open.
      const res = await fetch(apiBase + "/v1/me", {
        headers: { Authorization: "Bearer " + token },
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = await res.json();
      const iso = j && typeof j === "object" ? String(j.pro_redeemed_until || "") : "";
      if (!iso) return null;
      const ms = Date.parse(iso);
      return Number.isFinite(ms) && ms > Date.now() ? iso : null;
    } catch {
      return null;
    }
  }

  async function redeemProMonth() {
    const btn = el("rewards-redeem-btn");
    if (btn) btn.disabled = true;
    setRedeemStatus("");

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setRedeemStatus("Please sign in first.", "warn");
      if (btn) btn.disabled = false;
      return;
    }

    let apiBase;
    try {
      apiBase = await loadApiBase();
    } catch {
      setRedeemStatus("We could not reach the redemption service. Please try again in a moment.", "warn");
      if (btn) btn.disabled = false;
      return;
    }
    if (!apiBase) {
      setRedeemStatus("Redemption is not available on this copy of the site yet.", "warn");
      if (btn) btn.disabled = false;
      return;
    }

    let res;
    try {
      res = await fetch(apiBase + "/api/earn/redeem-pro-month", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
    } catch {
      setRedeemStatus("Network error. Please try again in a moment.", "warn");
      if (btn) btn.disabled = false;
      return;
    }

    let j;
    try {
      j = await res.json();
    } catch {
      j = null;
    }

    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      notifyPortalAuthChange();
      setRedeemStatus("Your session expired. Please sign in again.", "warn");
      return;
    }

    if (!res.ok) {
      const msg = (j && typeof j.detail === "string" && j.detail) || "Redemption failed. Please try again.";
      setRedeemStatus(msg, "warn");
      // Re-pull balance in case it actually changed before the error.
      refreshRewardsBalance();
      return;
    }

    const newBalance = Number(j && j.balance);
    const expiry = j && j.pro_redeemed_until ? String(j.pro_redeemed_until) : null;
    const bal = el("beta-rewards-balance-val");
    if (bal && Number.isFinite(newBalance)) bal.textContent = formatBalance(newBalance);
    applyRedeemAvailability(Number.isFinite(newBalance) ? newBalance : 0, expiry);
    setRedeemStatus(
      "Pro membership extended by " + REDEEM_DAYS + " days. Active until " + (formatExpiry(expiry) || "—") + ".",
      "ok",
    );
    // Tell the account dropdown / other tabs that Pro state changed.
    notifyPortalAuthChange();
  }

  window.addEventListener("DOMContentLoaded", () => {
    refreshRewardsBalance();
    const btn = el("rewards-redeem-btn");
    if (btn) btn.addEventListener("click", redeemProMonth);
    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) refreshRewardsBalance();
    });
    window.addEventListener("rootrecord-portal-auth-change", refreshRewardsBalance);
  });
})();
