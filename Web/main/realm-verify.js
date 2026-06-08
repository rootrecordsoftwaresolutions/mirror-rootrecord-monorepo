(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const DEVICE_KEY = "rootrecord_portal_device_id";

  function el(id) {
    return document.getElementById(id);
  }

  function showPanel(name) {
    ["panel-loading", "panel-forms", "panel-verify", "panel-success"].forEach((id) => {
      const n = el(id);
      if (n) n.hidden = id !== name;
    });
  }

  function setStatus(msg, kind) {
    const s = el("status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "status" + (kind ? " status-" + kind : "");
  }

  function codeFromUrl() {
    const qs = new URLSearchParams(window.location.search);
    return (qs.get("code") || "").trim().toUpperCase();
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

  let apiBase = "";

  async function loadConfig() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    if (!res.ok) throw new Error("config");
    const j = await res.json();
    apiBase = typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
  }

  async function apiFetch(path, opts) {
    const headers = Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {});
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(apiBase + path, {
      credentials: "include",
      ...(opts || {}),
      headers,
    });
    return res;
  }

  async function realmFetch(path, opts) {
    return fetch("/api/realm/minecraft" + path, {
      credentials: "include",
      ...(opts || {}),
      headers: Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {}),
    });
  }

  async function fetchMe() {
    const res = await apiFetch("/api/auth/me", { method: "GET" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("me");
    return res.json();
  }

  async function previewCode(code) {
    if (!code) return null;
    const res = await realmFetch("/link/preview?code=" + encodeURIComponent(code), { method: "GET" });
    if (!res.ok) return null;
    return res.json();
  }

  async function completeLink(code) {
    const res = await realmFetch("/link/complete", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || "Link failed.");
    }
    return data;
  }

  async function login(email, password) {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        device_id: getOrCreateDeviceId(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || "Sign in failed.");
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  }

  async function refreshVerifyUi(code) {
    const previewEl = el("code-preview");
    if (!code) {
      if (previewEl) previewEl.textContent = "Enter the 6-character code from /rootstat link in-game.";
      return;
    }
    const preview = await previewCode(code);
    if (!previewEl) return;
    if (preview && preview.valid) {
      previewEl.textContent =
        "Linking Minecraft player: " + preview.minecraft_username + " (expires " + preview.expires_at + ")";
    } else if (preview && preview.reason === "expired") {
      previewEl.textContent = "That code expired. Run /rootstat link in-game again.";
    } else if (preview && preview.reason === "consumed") {
      previewEl.textContent = "That code was already used.";
    } else {
      previewEl.textContent = "Code not found. Check the code from /rootstat link.";
    }
  }

  async function init() {
    showPanel("panel-loading");
    try {
      await loadConfig();
    } catch {
      setStatus("Could not load site config.", "err");
      showPanel("panel-forms");
      return;
    }

    const code = codeFromUrl();
    const input = el("input-code");
    if (input && code) input.value = code;

    let me = null;
    try {
      me = await fetchMe();
    } catch {
      setStatus("Could not reach account API.", "err");
      showPanel("panel-forms");
      return;
    }

    if (!me) {
      setStatus("Sign in to link your Minecraft account.", "warn");
      showPanel("panel-forms");
      return;
    }

    setStatus("Signed in as " + (me.email || me.account_id || "your account") + ".", "ok");
    showPanel("panel-verify");
    await refreshVerifyUi(code || (input && input.value));

    el("form-verify")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const linkCode = String(fd.get("code") || "")
        .trim()
        .toUpperCase();
      if (!linkCode) return;
      setStatus("Linking…", "");
      try {
        const result = await completeLink(linkCode);
        el("success-detail").textContent =
          "Linked " +
          (result.minecraft_username || "player") +
          " to your RootRecord account. Return to the server — sync runs within a minute.";
        showPanel("panel-success");
        setStatus("", "");
      } catch (e) {
        setStatus(String(e.message || e), "err");
      }
    });

    el("input-code")?.addEventListener("change", () => {
      void refreshVerifyUi(el("input-code").value.trim().toUpperCase());
    });
  }

  el("form-login")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    setStatus("Signing in…", "");
    try {
      await login(String(fd.get("email") || ""), String(fd.get("password") || ""));
      window.location.reload();
    } catch (e) {
      setStatus(String(e.message || e), "err");
    }
  });

  el("btn-logout")?.addEventListener("click", logout);

  void init();
})();
