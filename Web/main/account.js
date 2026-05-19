(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const DEVICE_KEY = "rootrecord_portal_device_id";
  /** Matches Weather Manager Android earn attribution (summary balance is account-wide). */
  const BETA_EARN_APP_ID = "rootrecord_weather_manager_android";
  /** When "1", header nav hides Billing (lifetime members). Cleared on logout / 401. */
  const LIFETIME_NAV_KEY = "rootrecord_portal_lifetime_nav";
  // Lifetime purchase is handled by the Stripe pricing table (which includes monthly + lifetime).

  function notifyPortalAuthChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-auth-change"));
    } catch {
      /* ignore */
    }
  }

  function notifyLifetimeNavChange() {
    try {
      window.dispatchEvent(new CustomEvent("rootrecord-portal-lifetime-nav-change"));
    } catch {
      /* ignore */
    }
  }

  function syncPortalLifetimeNav(data) {
    if (!data || typeof data !== "object") {
      localStorage.removeItem(LIFETIME_NAV_KEY);
    } else if (data.life_member || data.lifeMember) {
      localStorage.setItem(LIFETIME_NAV_KEY, "1");
    } else {
      localStorage.removeItem(LIFETIME_NAV_KEY);
    }
    notifyLifetimeNavChange();
  }

  function el(id) {
    return document.getElementById(id);
  }

  function pageMode() {
    return (document.body && document.body.getAttribute("data-account-page")) || "login";
  }

  function isDiscordVerifyPage() {
    return pageMode() === "discord-verify";
  }

  function discordOAuthFlowParam() {
    return isDiscordVerifyPage() ? "verify" : "account";
  }

  function showVerifyPanel(name) {
    ["panel-loading", "panel-verify-forms", "panel-verify-action", "panel-verify-success"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== name;
    });
  }

  async function startDiscordOAuth(flow) {
    const f = flow === "verify" ? "verify" : "account";
    try {
      const res = await apiFetch(
        "/v1/discord/oauth/start?json=1&flow=" + encodeURIComponent(f),
        { method: "GET" },
      );
      const text = await res.text();
      let j = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch {
        j = {};
      }
      if (res.status === 401) {
        setStatus("Please sign in, then try linking Discord again.", "warn");
        if (isDiscordVerifyPage()) showVerifyPanel("panel-verify-forms");
        else showPanel("panel-forms");
        return;
      }
      if (!res.ok || !j || typeof j.url !== "string") {
        const detail =
          j && typeof j.detail === "string" && j.detail.trim() && !looksTechnicalMessage(j.detail)
            ? j.detail.trim()
            : res.status === 404
              ? "Discord linking is not available on this site copy yet. Please try again later."
              : res.status === 503
                ? "Discord linking is not configured yet. Please try again later."
                : "Could not start Discord linking. Please try again.";
        setStatus(detail, res.status === 503 ? "warn" : "err");
        return;
      }
      window.location.href = j.url;
    } catch {
      setStatus("Could not start Discord linking. Please try again.", "err");
    }
  }

  async function unlinkDiscordAccount() {
    if (
      !window.confirm(
        "Unlink Discord from your RootRecord account? You may lose @Verified in the server until you link again.",
      )
    ) {
      return;
    }
    setStatus("Unlinking Discord…", "");
    try {
      const res = await apiFetch("/v1/discord/link", { method: "DELETE" });
      const { j } = await parseJsonRes(res);
      if (!res.ok) {
        setStatus(friendlyFromApiError(j) || "Could not unlink Discord.", "err");
        return;
      }
      setStatus("Discord unlinked.", "ok");
      if (isDiscordVerifyPage()) await refreshVerify();
      else await refreshMe();
    } catch {
      setStatus("Could not unlink Discord. Please try again.", "err");
    }
  }

  function bindDiscordUi(data) {
    const st = el("discord-link-status");
    const linkBtn = el("btn-discord-link");
    const unlinkBtn = el("btn-discord-unlink");
    const signedInAs = el("verify-signed-in-as");
    if (signedInAs && data && data.email) {
      signedInAs.textContent = "Signed in as " + String(data.email);
    }
    if (st && linkBtn) {
      const linked = Boolean(data && data.discord_linked);
      const label =
        (data && (data.discord_global_name || data.discord_username || data.discord_user_id)) || "";
      if (linked) {
        st.textContent = "Linked: " + String(label || "Discord account");
        linkBtn.textContent = isDiscordVerifyPage() ? "Re-verify with Discord" : "Re-link Discord";
      } else {
        st.textContent = "Not linked.";
        linkBtn.textContent = isDiscordVerifyPage() ? "Verify with Discord" : "Link Discord";
      }
      linkBtn.onclick = function () {
        void startDiscordOAuth(discordOAuthFlowParam());
      };
    }
    if (unlinkBtn) {
      unlinkBtn.hidden = !(data && data.discord_linked);
      if (!unlinkBtn.dataset.bound) {
        unlinkBtn.dataset.bound = "1";
        unlinkBtn.onclick = function () {
          void unlinkDiscordAccount();
        };
      }
    }
  }

  function hexDeviceId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && id.length >= 8 && id.length <= 128) return id;
    id = hexDeviceId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  }

  function setStatus(msg, kind) {
    const s = el("status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  let apiBase = "";
  let stripePricingTableId = "";
  let stripePublishableKey = "";
  let stripeCustomerPortalUrl = "";

  function looksTechnicalMessage(s) {
    return /[`{}[\]]|STRIPE_|WORKER|LICENSE_|\/v1\/|INTERNAL|D1\b|Cloudflare|ROOTRECORD_|Bearer |webhook|price_id|secret_key|operator\b|site-config/i.test(
      s
    );
  }

  function friendlyFromApiError(j) {
    if (!j || typeof j !== "object") return "";
    const detail = typeof j.detail === "string" ? j.detail.trim() : "";
    if (detail && detail.length < 400 && !looksTechnicalMessage(detail)) return detail;
    const topMsg = typeof j.message === "string" ? j.message.trim() : "";
    if (topMsg && topMsg.length < 400 && !looksTechnicalMessage(topMsg)) return topMsg;
    const msg =
      j.error && typeof j.error.message === "string"
        ? j.error.message.trim()
        : typeof j.error === "string"
          ? j.error.trim()
          : "";
    if (msg && msg.length < 400 && !looksTechnicalMessage(msg)) return msg;
    return "";
  }

  function stripDiscordQueryFromUrl() {
    stripDiscordQueryFromUrlFull();
  }

  /** Human text for `/account?discord=…` (OAuth return or unauthenticated /v1/discord/oauth/start redirect). */
  function discordReturnUserMessage(code, roleCode) {
    const c = String(code || "").trim();
    const role = String(roleCode || "").trim();
    if (!c) return "";
    if (c === "signin") {
      return "Sign in with your RootRecord account, then click **Link Discord** (below after you sign in).";
    }
    if (c === "linked") {
      if (role === "role_join") {
        return "Discord is linked to your account, but **@Verified** was not assigned because you are not in the server yet. Join the RootRecord Discord, then click **Re-link Discord**.";
      }
      if (role === "role_forbidden") {
        return "Discord is linked, but the bot could not assign **@Verified** (missing permission). Please contact an admin, then try **Re-link Discord**.";
      }
      if (role === "role_error") {
        return "Discord is linked, but **@Verified** could not be assigned. Try **Re-link Discord** in a moment.";
      }
      if (role === "role_config") {
        return "Discord is linked. **@Verified** is not fully configured on the server yet; an admin may need to fix bot settings.";
      }
      return "Discord linked successfully. You should receive **@Verified** in the server within a few seconds.";
    }
    if (c === "expired") return "That Discord link expired. Click **Link Discord** again.";
    if (c === "error") return "Discord linking did not complete. Click **Link Discord** and try again.";
    if (c === "role_join") {
      return "We could not assign **@Verified** because your Discord account is not in the server yet. Join the RootRecord Discord, then click **Link Discord** again.";
    }
    if (c === "role_forbidden") {
      return "The bot could not assign **@Verified** (missing permission). Please contact an admin.";
    }
    if (c === "role_error") return "The bot could not assign **@Verified**. Please try again in a moment.";
    if (c === "role_config") return "Discord verification is not fully configured on the server yet. Please try again later.";
    return "";
  }

  function discordQueryFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    return { discord: qs.get("discord"), role: qs.get("role") };
  }

  function stripDiscordQueryFromUrlFull() {
    try {
      const u = new URL(window.location.href);
      let changed = false;
      if (u.searchParams.has("discord")) {
        u.searchParams.delete("discord");
        changed = true;
      }
      if (u.searchParams.has("role")) {
        u.searchParams.delete("role");
        changed = true;
      }
      if (!changed) return;
      const q = u.searchParams.toString();
      history.replaceState({}, "", u.pathname + (q ? "?" + q : "") + u.hash);
    } catch {
      /* ignore */
    }
  }

  async function loadConfig() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    apiBase = typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
    stripePricingTableId = typeof j.stripePricingTableId === "string" ? j.stripePricingTableId.trim() : "";
    stripePublishableKey = typeof j.stripePublishableKey === "string" ? j.stripePublishableKey.trim() : "";
    stripeCustomerPortalUrl =
      typeof j.stripeCustomerPortalUrl === "string" ? j.stripeCustomerPortalUrl.trim() : "";
    if (!apiBase) {
      setStatus("Account sign-in is not available on this copy of the site yet. Please try again later.", "warn");
    }
  }

  function apiUrl(path) {
    return apiBase + path;
  }

  async function apiFetch(path, opts) {
    if (!apiBase) {
      return new Response(JSON.stringify({ error: { message: "Service unavailable." } }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    const headers = new Headers(opts?.headers);
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", "Bearer " + token);
    }
    if (!headers.has("Content-Type") && opts?.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(apiUrl(path), { ...opts, headers, credentials: "include" });
  }

  function showPanel(name) {
    ["panel-loading", "panel-forms", "panel-account"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== name;
    });
  }

  function showBillingPanel(name) {
    const map = { loading: "panel-billing-loading", guest: "panel-billing-guest", main: "panel-billing-main" };
    const target = map[name];
    ["panel-billing-loading", "panel-billing-guest", "panel-billing-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function showMyAppsPanel(name) {
    const map = { loading: "panel-myapps-loading", guest: "panel-myapps-guest", main: "panel-myapps-main" };
    const target = map[name];
    ["panel-myapps-loading", "panel-myapps-guest", "panel-myapps-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function showDevNoticePanel(name) {
    const map = { loading: "panel-devnotice-loading", guest: "panel-devnotice-guest", main: "panel-devnotice-main" };
    const target = map[name];
    ["panel-devnotice-loading", "panel-devnotice-guest", "panel-devnotice-main"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== target;
    });
  }

  function planLabelFromMe(data) {
    if (data.life_member || data.lifeMember) return "Lifetime";
    const v = String(data.subscription_status || "").toLowerCase();
    if (v === "active") return "Active";
    if (v === "past_due") return "Past due";
    if (v === "canceled") return "Canceled";
    if (v === "trialing" || v === "trial") return "Trial";
    if (v === "none" || !v) {
      if (data.pro_unlocked || data.proUnlocked) return "Pro";
      return "Free";
    }
    return String(data.subscription_status || "—");
  }

  function subscriptionAccountValueHtml(data) {
    if (data.life_member || data.lifeMember) return escapeHtml(planLabelFromMe(data));
    const v = String(data.subscription_status || "").toLowerCase();
    if (v === "none" || !v) {
      if (data.pro_unlocked || data.proUnlocked) return escapeHtml(planLabelFromMe(data));
      return (
        escapeHtml("Free") +
        ' — <a href="/billing.html" style="color:var(--moss);text-decoration:underline;text-underline-offset:3px">Become a Member</a>'
      );
    }
    return escapeHtml(planLabelFromMe(data));
  }

  function mountBillingPricingTable(data) {
    const wrap = el("billing-pricing-table-wrap");
    if (!wrap) return;
    // Only lifetime members skip the table (no paid upgrade path). Everyone else
    // sees the Stripe embed for compare / change / add products your Dashboard allows.
    if (data.life_member || data.lifeMember) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    if (!stripePricingTableId || !stripePublishableKey) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    const email = String(data.email || "").trim();
    const ref = String(data.account_id || "").trim();
    wrap.hidden = false;
    wrap.innerHTML = "";
    function insert() {
      const pt = document.createElement("stripe-pricing-table");
      pt.setAttribute("pricing-table-id", stripePricingTableId);
      pt.setAttribute("publishable-key", stripePublishableKey);
      if (email) pt.setAttribute("customer-email", email);
      if (ref) pt.setAttribute("client-reference-id", ref);
      wrap.appendChild(pt);
    }
    if (window.customElements && customElements.get("stripe-pricing-table")) {
      insert();
    } else if (window.customElements) {
      customElements.whenDefined("stripe-pricing-table").then(insert).catch(function () {
        wrap.innerHTML =
          "<p class=note>Plan checkout could not load. Refresh the page and try again.</p>";
      });
    } else {
      insert();
    }
  }

  function formatAccountCreatedAt(data) {
    const raw = String(data.account_created_at || data.accountCreatedAt || "").trim();
    if (!raw) return "—";
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return raw;
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return raw;
    }
  }

  async function fetchBetaTesterRewardsSummary() {
    try {
      const res = await apiFetch("/api/earn/summary?app_id=" + encodeURIComponent(BETA_EARN_APP_ID), {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = await res.json();
      if (j && typeof j === "object") {
        const n =
          typeof parseRootUnitsBalanceFromSummary === "function"
            ? parseRootUnitsBalanceFromSummary(j)
            : Number(j.root_units_balance ?? j.ledger_balance ?? j.balance ?? j.root_units);
        if (Number.isFinite(n)) {
          return { ...j, balance: n, ledger_balance: n, root_units_balance: n };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  function betaTesterRewardsValueHtml(earn) {
    const moss = "color:var(--moss);text-decoration:underline;text-underline-offset:3px";
    const program =
      ' <a href="/beta-tester-rewards.html" style="' +
      moss +
      '">Root Units</a>';
    const note =
      '<span class="note" style="display:block;margin-top:0.4rem;font-size:0.875rem;line-height:1.45">Full balance and program details are on the Root Units page. In Discord, use /bal and /send after linking your account.</span>';
    if (!earn) {
      return escapeHtml("—") + program + note;
    }
    const n = Number(earn.balance);
    const b = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return (
      '<strong class="rewards-balance" data-testid="account-rewards-balance">' +
      escapeHtml(String(b.toLocaleString())) +
      "</strong>" +
      program +
      note
    );
  }

  function renderAccount(data, earn) {
    const box = el("account-details");
    if (!box) return;
    const custodial = String(data.custodial_wallet_pubkey || "").trim();
    const custodialShort =
      custodial.length > 12
        ? escapeHtml(custodial.slice(0, 4) + "…" + custodial.slice(-4))
        : escapeHtml(custodial || "—");

    const rows = [
      ["Email", escapeHtml(String(data.email || "—"))],
      ["Your RootRecord ID", escapeHtml(String(data.account_id || "—"))],
      ["Custodial Solana address", custodialShort],
      ["Account created", escapeHtml(formatAccountCreatedAt(data))],
      ["Subscription", subscriptionAccountValueHtml(data)],
      ["Password on file", escapeHtml(data.has_password ? "Yes" : "No")],
      ["Root Units", betaTesterRewardsValueHtml(earn)],
    ];
    box.innerHTML = rows
      .map(
        ([k, v]) =>
          "<div class=account-row><span class=account-k>" +
          escapeHtml(k) +
          "</span><span class=account-v>" +
          v +
          "</span></div>"
      )
      .join("");

    const nameInput = el("public-display-name");
    const nameForm = el("form-public-display-name");
    const nameStatus = el("public-display-name-status");
    if (nameInput) {
      nameInput.value = String(data.public_display_name || "").trim();
    }
    if (nameForm && !nameForm.dataset.bound) {
      nameForm.dataset.bound = "1";
      nameForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (!apiBase) return;
        const raw = nameInput ? nameInput.value : "";
        try {
          const res = await apiFetch("/v1/me/profile", {
            method: "PATCH",
            body: JSON.stringify({ public_display_name: raw.trim() }),
          });
          const { j } = await parseJsonRes(res);
          if (!res.ok) {
            const msg = friendlyFromApiError(j) || "Could not save display name.";
            if (nameStatus) {
              nameStatus.hidden = false;
              nameStatus.textContent = msg;
              nameStatus.className = "note";
              nameStatus.style.color = "var(--amber, #fbbf24)";
            }
            return;
          }
          if (nameInput && j && j.public_display_name != null) {
            nameInput.value = String(j.public_display_name || "");
          } else if (nameInput && raw.trim() === "") {
            nameInput.value = "";
          }
          if (nameStatus) {
            nameStatus.hidden = false;
            nameStatus.textContent = "Display name saved.";
            nameStatus.className = "note";
            nameStatus.style.color = "var(--moss, #6b8f71)";
          }
        } catch {
          if (nameStatus) {
            nameStatus.hidden = false;
            nameStatus.textContent = "Could not save display name. Try again.";
            nameStatus.className = "note";
            nameStatus.style.color = "var(--amber, #fbbf24)";
          }
        }
      });
    }

    bindDiscordUi(data);
  }

  function formatMyAppsLastConnected(iso) {
    if (!iso || typeof iso !== "string") return null;
    const raw = iso.trim();
    if (!raw) return null;
    const ms = Date.parse(raw);
    const label = Number.isFinite(ms)
      ? new Date(ms).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : raw;
    return { iso: raw, label };
  }

  const MY_APPS_CATALOG = {
    rootrecord_business_manager_android: {
      title: "RootRecord Business Manager",
      platform: "Android / web",
      href: "/rootrecord-business-manager.html",
      webAppUrl: "https://business.rootrecord.info/",
      playTestUrl:
        "https://play.google.com/apps/testing/com.rootrecord.businessmanager",
      note: "Cloud business workspace or Root Units activity on this account.",
    },
    rootrecord_weather_manager_windows: {
      title: "Root Record Weather Manager",
      platform: "Windows / web",
      href: "/rootrecord-weather-manager.html",
      webAppUrl: "https://weather.rootrecord.info/",
      note: "Saved locations, synced weather, or earn activity for this account.",
    },
    rootrecord_weather_manager_android: {
      title: "Root Record Weather Manager",
      platform: "Android / web",
      href: "/rootrecord-weather-manager.html",
      webAppUrl: "https://weather.rootrecord.info/",
      playStoreUrl:
        "https://play.google.com/store/apps/details?id=com.rootrecord.weathermanager",
      note: "Mobile notifications, earn activity, or signed-in weather app use.",
    },
    rootrecord_kilauea_alerts_android: {
      title: "Kilauea Alerts",
      platform: "Android / web",
      href: "/kilauea-alerts.html",
      webAppUrl: "https://kilauea.rootrecord.info/",
      playTestUrl: "https://play.google.com/apps/testing/com.rootrecord.kilauea",
      note: "Signed-in Kīlauea dashboard or earn activity on this account.",
    },
    rootrecord_token_manager_android: {
      title: "RootRecord Token Manager",
      platform: "Android / web",
      href: "/products.html",
      webAppUrl: "https://token.rootrecord.info/",
      note: "Signed-in token manager or earn activity on this account.",
    },
    rootrecord_account_hub_android: {
      title: "RootRecord Account Hub",
      platform: "Android",
      href: "/products.html",
      note: "Account Hub app session or earn activity on this account.",
    },
    root_farms: {
      title: "Root Units Idle Farmer",
      platform: "Web",
      href: "https://farms.rootrecord.info/",
      external: true,
      note: "Root Farms progress or earn activity saved for this account.",
    },
  };

  function collectMyAppsRows(appsPayload) {
    const apps = appsPayload || {};
    const sig = apps.signals || {};
    const seen = new Set();
    const rows = [];

    function addRow(appId, lastAt) {
      const id = String(appId || "").trim().toLowerCase();
      if (!id || seen.has(id)) return;
      const cat = MY_APPS_CATALOG[id];
      if (!cat) return;
      seen.add(id);
      rows.push({
        title: cat.title,
        platform: cat.platform,
        href: cat.href,
        external: Boolean(cat.external),
        webAppUrl: cat.webAppUrl || "",
        playTestUrl: cat.playTestUrl || "",
        playStoreUrl: cat.playStoreUrl || "",
        note: cat.note,
        last_connected_at: typeof lastAt === "string" ? lastAt : null,
      });
    }

    const usage = Array.isArray(apps.usage) ? apps.usage : [];
    for (const u of usage) {
      if (u && u.app_id) addRow(u.app_id, u.last_connected_at);
    }

    const bma = apps.rootrecord_business_manager_android || {};
    const wwx = apps.rootrecord_weather_manager_windows || {};
    const wma = apps.rootrecord_weather_manager_android || {};
    if (bma.associated) addRow("rootrecord_business_manager_android", bma.last_connected_at);
    if (wwx.associated) addRow("rootrecord_weather_manager_windows", wwx.last_connected_at);
    if (wma.associated) addRow("rootrecord_weather_manager_android", wma.last_connected_at);

    rows.sort((a, b) => {
      const ta = a.last_connected_at || "";
      const tb = b.last_connected_at || "";
      if (ta === tb) return a.title.localeCompare(b.title);
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.localeCompare(ta);
    });

    const detailParts = [];
    if (bma.associated) detailParts.push("Business Manager cloud workspace");
    if (sig.mobile_push) detailParts.push("mobile notifications");
    if (sig.saved_locations) detailParts.push("saved locations");
    if (sig.weather_cache) detailParts.push("weather cache rows");
    if (usage.length) detailParts.push(usage.length + " app usage record(s)");
    return { rows, detailParts };
  }

  function renderMyApps(data) {
    const box = el("my-apps-list");
    if (!box) return;
    const apps = data.apps || {};
    const sig = apps.signals || {};
    const collected = collectMyAppsRows(apps);
    const rows = collected.rows;
    const detailParts = collected.detailParts;
    const detail =
      detailParts.length > 0
        ? "Server signals: " + detailParts.join(", ") + "."
        : "";
    if (rows.length === 0) {
      box.innerHTML =
        '<p class="note" style="margin:0">No linked apps yet. When you sign in inside a RootRecord app and we see saved data, notifications, or synced weather for this account, it will appear here.</p>' +
        '<p style="margin-top:1rem"><a class="btn btn-secondary" href="/products.html">Browse products</a></p>' +
        '<p class="note" style="margin-top:1rem">Android closed testing: <a href="https://play.google.com/apps/testing/com.rootrecord.businessmanager" target="_blank" rel="noopener">Business Manager</a> &middot; <a href="https://play.google.com/apps/testing/com.rootrecord.weathermanager" target="_blank" rel="noopener">Weather Manager</a></p>';
      return;
    }
    box.innerHTML =
      rows
        .map((r) => {
          const lc = formatMyAppsLastConnected(r.last_connected_at);
          const lastHtml = lc
            ? '<p class="note my-apps-last-connected"><span class="my-apps-last-connected-label">Last connected: </span><time datetime="' +
              escapeHtml(lc.iso) +
              '">' +
              escapeHtml(lc.label) +
              "</time></p>"
            : "";
          const playTestUrl =
            typeof r.playTestUrl === "string" && r.playTestUrl.trim()
              ? r.playTestUrl.trim()
              : "";
          const playStoreUrl =
            typeof r.playStoreUrl === "string" && r.playStoreUrl.trim()
              ? r.playStoreUrl.trim()
              : "";
          const playBtn = playTestUrl
            ? '<a class="btn btn-secondary" href="' +
              escapeHtml(playTestUrl) +
              '" target="_blank" rel="noopener">Google Play testing</a>'
            : playStoreUrl
              ? '<a class="btn btn-secondary" href="' +
                escapeHtml(playStoreUrl) +
                '" target="_blank" rel="noopener">Google Play</a>'
              : "";
          const productTarget = r.external ? ' target="_blank" rel="noopener"' : "";
          return (
            '<article class="my-apps-card" data-testid="my-app-card">' +
            '<div class="my-apps-card-head">' +
            '<h3 class="my-apps-card-title">' +
            escapeHtml(r.title) +
            '</h3><span class="my-apps-platform">' +
            escapeHtml(r.platform) +
            '</span></div><p class="note my-apps-note" style="margin-top:0.35rem">' +
            escapeHtml(r.note) +
            "</p>" +
            lastHtml +
            '<p class="my-apps-card-actions"><a class="btn btn-secondary" href="' +
            escapeHtml(r.href) +
            '"' +
            productTarget +
            '">' +
            (r.external ? "Open app" : "Product page") +
            "</a>" +
            (typeof r.webAppUrl === "string" && r.webAppUrl.trim()
              ? ' <a class="btn btn-secondary" href="' +
                escapeHtml(r.webAppUrl.trim()) +
                '" target="_blank" rel="noopener">Open web app</a>'
              : "") +
            (playBtn ? " " + playBtn : "") +
            "</p></article>"
          );
        })
        .join("") +
      (detail
        ? '<p class="note" style="margin-top:1.25rem">' + escapeHtml(detail) + "</p>"
        : "");
  }

  async function refreshMyApps() {
    if (!apiBase) {
      showMyAppsPanel("guest");
      return;
    }
    showMyAppsPanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {});
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showMyAppsPanel("guest");
      setStatus("Your session ended. Please sign in again.", "warn");
      return;
    }
    if (!res.ok) {
      showMyAppsPanel("guest");
      setStatus("We could not load your apps. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderMyApps(data);
    syncPortalLifetimeNav(data);
    showMyAppsPanel("main");
  }

  function renderDevNoticeSignedIn(data) {
    const p = el("dev-notice-signed-in");
    if (!p) return;
    const em = String(data.email || "").trim();
    if (em) {
      p.hidden = false;
      p.textContent = "Signed in as " + em + ".";
    } else {
      p.hidden = true;
      p.textContent = "";
    }
  }

  async function refreshDevNotice() {
    if (!apiBase) {
      showDevNoticePanel("guest");
      return;
    }
    showDevNoticePanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {});
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showDevNoticePanel("guest");
      setStatus("Your session ended. Please sign in again.", "warn");
      return;
    }
    if (!res.ok) {
      showDevNoticePanel("guest");
      setStatus("We could not verify your session. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderDevNoticeSignedIn(data);
    syncPortalLifetimeNav(data);
    showDevNoticePanel("main");
  }

  function renderBillingSummary(data) {
    const box = el("billing-summary");
    if (!box) return;
    const plan = escapeHtml(planLabelFromMe(data));
    let html = '<p class="note" style="margin-top:0">Current plan: <strong>' + plan + "</strong></p>";
    if (data.life_member || data.lifeMember) {
      html +=
        '<p class="note" style="margin-top:0.75rem">Lifetime access is on this account. Nothing renews; keep using the apps you’ve installed.</p>';
    }
    box.innerHTML = html;

    const portalWrap = el("billing-portal-wrap");
    const portalLink = el("billing-portal-link");
    if (portalWrap && portalLink) {
      portalWrap.hidden = true;
      const isFree = planLabelFromMe(data) === "Free";
      const raw = String(stripeCustomerPortalUrl || "").trim();
      if (!isFree && raw) {
        try {
          const u = new URL(raw);
          if (u.protocol === "https:" && /\.stripe\.com$/i.test(u.hostname)) {
            portalLink.href = u.toString();
            portalWrap.hidden = false;
          }
        } catch {
          /* keep hidden */
        }
      }
    }
    syncBillingLifetimeUpsell(data);
    mountBillingPricingTable(data);
  }

  function syncBillingLifetimeUpsell(data) {
    const wrap = el("billing-lifetime-wrap");
    const link = el("billing-lifetime-link");
    if (!wrap || !link) return;
    // The pricing table contains the lifetime option, so we don't need a separate CTA.
    wrap.hidden = true;
    link.href = "#";
    link.onclick = null;
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function parseJsonRes(res) {
    const text = await res.text();
    let j = {};
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      j = {};
    }
    return { j, text };
  }

  async function refreshMe() {
    if (!apiBase) {
      showPanel("panel-forms");
      return;
    }
    const discordQ = discordQueryFromUrl();
    showPanel("panel-loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {});
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showPanel("panel-forms");
      const dm = discordReturnUserMessage(discordQ.discord, discordQ.role);
      if (dm) {
        setStatus(dm, discordQ.discord === "linked" && !discordQ.role ? "ok" : "warn");
      } else {
        setStatus("Your session ended. Please sign in again.", "warn");
      }
      if (discordQ.discord) stripDiscordQueryFromUrl();
      return;
    }
    if (!res.ok) {
      showPanel("panel-account");
      setStatus("We could not load your account. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    const earn = await fetchBetaTesterRewardsSummary();
    showPanel("panel-account");
    renderAccount(data, earn);
    syncPortalLifetimeNav(data);
    const dm = discordReturnUserMessage(discordQ.discord, discordQ.role);
    if (dm) {
      setStatus(dm, discordQ.discord === "linked" && !discordQ.role ? "ok" : "warn");
      stripDiscordQueryFromUrl();
    }
  }

  async function refreshVerify(autoStartOAuth) {
    if (!apiBase) {
      showVerifyPanel("panel-verify-forms");
      return;
    }
    const discordQ = discordQueryFromUrl();
    showVerifyPanel("panel-loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {});
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showVerifyPanel("panel-verify-forms");
      const dm = discordReturnUserMessage(discordQ.discord, discordQ.role);
      if (dm) {
        setStatus(dm, discordQ.discord === "linked" && !discordQ.role ? "ok" : "warn");
      } else {
        setStatus("Sign in to link Discord.", "warn");
      }
      if (discordQ.discord) stripDiscordQueryFromUrl();
      return;
    }
    if (!res.ok) {
      showVerifyPanel("panel-verify-action");
      setStatus("We could not load your account. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    syncPortalLifetimeNav(data);
    notifyPortalAuthChange();
    showVerifyPanel("panel-verify-action");
    bindDiscordUi(data);
    const dm = discordReturnUserMessage(discordQ.discord, discordQ.role);
    if (dm) {
      setStatus(dm, discordQ.discord === "linked" && !discordQ.role ? "ok" : "warn");
      stripDiscordQueryFromUrl();
    }
    if (autoStartOAuth && !data.discord_linked && !discordQ.discord) {
      await startDiscordOAuth("verify");
    }
  }

  async function refreshBilling() {
    if (!apiBase) {
      showBillingPanel("guest");
      return;
    }
    showBillingPanel("loading");
    setStatus("");
    const res = await apiFetch("/v1/me", {});
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showBillingPanel("guest");
      setStatus("Your session ended. Sign in from Account, then open Billing again.", "warn");
      return;
    }
    if (!res.ok) {
      showBillingPanel("guest");
      setStatus("We could not load billing. Please try again in a moment.", "err");
      return;
    }
    const data = await res.json();
    renderBillingSummary(data);
    syncPortalLifetimeNav(data);
    showBillingPanel("main");
  }

  async function onLogin(ev) {
    ev.preventDefault();
    setStatus("");
    if (!apiBase) {
      setStatus("Sign-in is not available here yet. Please try again later.", "warn");
      return;
    }
    const email = el("login-email").value.trim().toLowerCase();
    const password = el("login-password").value;
    const device_id = getOrCreateDeviceId();
    try {
      const res = await apiFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, device_id }),
      });
      const { j, text } = await parseJsonRes(res);
      if (!res.ok) {
        let human = friendlyFromApiError(j);
        if (!human && text && text.length < 400 && !/<!DOCTYPE/i.test(text) && !looksTechnicalMessage(text)) {
          human = text.trim();
        }
        if (!human && res.status === 401) human = "Incorrect email or password.";
        setStatus(human || "Sign-in did not work. Check your email and password.", "err");
        return;
      }
      if (j.access_token) {
        localStorage.setItem(TOKEN_KEY, j.access_token);
        notifyPortalAuthChange();
      }
      if (isDiscordVerifyPage()) {
        await refreshVerify(true);
      } else {
        await refreshMe();
      }
    } catch (e) {
      const net = e && typeof e.message === "string" ? e.message : "";
      setStatus(
        net && /network|fetch|failed|load/i.test(net)
          ? "Could not reach the sign-in service. Check your connection or try again in a moment."
          : "Something went wrong. Please try again.",
        "err"
      );
    }
  }

  async function onSignup(ev) {
    ev.preventDefault();
    setStatus("");
    if (!apiBase) {
      setStatus("Creating an account is not available here yet. Please try again later.", "warn");
      return;
    }
    const email = el("signup-email").value.trim().toLowerCase();
    const password = el("signup-password").value;
    const device_id = getOrCreateDeviceId();
    try {
      const res = await apiFetch("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, device_id }),
      });
      const { j, text } = await parseJsonRes(res);
      if (!res.ok) {
        let human = friendlyFromApiError(j);
        if (!human && text && text.length < 400 && !/<!DOCTYPE/i.test(text) && !looksTechnicalMessage(text)) {
          human = text.trim();
        }
        setStatus(human || "We could not create an account. Check your details and try again.", "err");
        return;
      }
      if (j.access_token) {
        localStorage.setItem(TOKEN_KEY, j.access_token);
        notifyPortalAuthChange();
      }
      if (document.body && document.body.getAttribute("data-account-page") === "signup") {
        const ret = new URLSearchParams(window.location.search).get("return");
        const dest = ret && String(ret).startsWith("/") ? String(ret) : "/account.html";
        window.location.href = dest;
        return;
      }
      if (isDiscordVerifyPage()) {
        await refreshVerify(true);
      } else {
        await refreshMe();
      }
    } catch (e) {
      const net = e && typeof e.message === "string" ? e.message : "";
      setStatus(
        net && /network|fetch|failed|load/i.test(net)
          ? "Could not reach the account service. Check your connection or try again in a moment."
          : "Something went wrong. Please try again.",
        "err"
      );
    }
  }

  async function onLogout() {
    if (apiBase) {
      try {
        await apiFetch("/v1/auth/logout-all", { method: "POST" });
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    syncPortalLifetimeNav(null);
    notifyPortalAuthChange();
    if (pageMode() === "billing") {
      showBillingPanel("guest");
    } else if (pageMode() === "my-apps") {
      showMyAppsPanel("guest");
    } else if (pageMode() === "development-notice") {
      showDevNoticePanel("guest");
    } else if (isDiscordVerifyPage()) {
      showVerifyPanel("panel-verify-forms");
    } else {
      showPanel("panel-forms");
    }
    setStatus("You are signed out.", "ok");
  }

  async function onDeleteAccount() {
    if (!apiBase) {
      setStatus("Account service is unavailable here. Please try again later.", "warn");
      return;
    }

    const ok1 = window.confirm(
      "Delete your RootRecord account?\n\nThis permanently deletes your portal account and any server-stored data tied to it. This cannot be undone."
    );
    if (!ok1) return;

    const typed = window.prompt('Type DELETE to confirm account deletion.');
    if (String(typed || "").trim().toUpperCase() !== "DELETE") {
      setStatus("Account deletion canceled.", "warn");
      return;
    }

    setStatus("Deleting your account…", "");
    const btn = el("btn-delete-account");
    if (btn) btn.disabled = true;
    try {
      const res = await apiFetch("/v1/me", { method: "DELETE" });
      const { j } = await parseJsonRes(res);
      if (!res.ok) {
        const human = friendlyFromApiError(j) || "Could not delete your account.";
        setStatus(human, "err");
        if (btn) btn.disabled = false;
        return;
      }
      localStorage.removeItem(TOKEN_KEY);
      syncPortalLifetimeNav(null);
      notifyPortalAuthChange();
      showPanel("panel-forms");
      setStatus("Your account was deleted.", "ok");
    } catch {
      setStatus("Network error while deleting your account.", "err");
      if (btn) btn.disabled = false;
    }
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const page = pageMode();
    if (page === "billing") {
      showBillingPanel("loading");
    } else if (page === "my-apps") {
      showMyAppsPanel("loading");
    } else if (page === "development-notice") {
      showDevNoticePanel("loading");
    } else if (page === "discord-verify") {
      return;
    } else {
      showPanel("panel-loading");
    }
    try {
      await loadConfig();
    } catch {
      setStatus("We could not load this page. Please refresh and try again.", "err");
      if (page === "signup") {
        const pf = el("panel-signup");
        if (pf) pf.hidden = false;
        const pl = el("panel-loading");
        if (pl) pl.hidden = true;
      } else if (page === "billing") {
        showBillingPanel("guest");
      } else if (page === "my-apps") {
        showMyAppsPanel("guest");
      } else if (page === "development-notice") {
        showDevNoticePanel("guest");
      } else {
        showPanel("panel-forms");
      }
      return;
    }

    if (page === "billing") {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get("checkout") === "success") {
        setStatus("Checkout completed. Your plan may take a minute to update everywhere.", "ok");
      } else if (qs.get("checkout") === "cancel") {
        setStatus("Checkout was canceled.", "warn");
      }
      el("btn-billing-logout")?.addEventListener("click", onLogout);
      await refreshBilling();
      return;
    }

    if (page === "my-apps") {
      el("btn-myapps-logout")?.addEventListener("click", onLogout);
      await refreshMyApps();
      return;
    }

    if (page === "development-notice") {
      el("btn-devnotice-logout")?.addEventListener("click", onLogout);
      await refreshDevNotice();
      return;
    }

    if (page === "signup") {
      el("form-signup")?.addEventListener("submit", onSignup);
      const ps = el("panel-signup");
      if (ps) ps.hidden = false;
      const pl = el("panel-loading");
      if (pl) pl.hidden = true;
      return;
    }

    el("form-login")?.addEventListener("submit", onLogin);
    el("btn-logout")?.addEventListener("click", onLogout);
    el("btn-delete-account")?.addEventListener("click", onDeleteAccount);

    await refreshMe();
  });
})();
