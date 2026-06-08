(function () {
  const TOKEN_KEY = "rootrecord_portal_token";
  const DEVICE_KEY = "rootrecord_portal_device_id";

  function el(id) {
    return document.getElementById(id);
  }

  function showPanel(name) {
    ["panel-loading", "panel-login", "panel-main"].forEach((id) => {
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

  function hexDeviceId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function getOrCreateDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id && id.length >= 8) return id;
    id = hexDeviceId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  }

  let apiBase = "";

  async function loadConfig() {
    const res = await fetch("/api/site-config", { cache: "no-store" });
    const j = await res.json();
    apiBase = typeof j.apiBase === "string" ? j.apiBase.replace(/\/+$/, "") : "";
  }

  async function apiFetch(path, opts) {
    const headers = Object.assign({ "Content-Type": "application/json" }, (opts && opts.headers) || {});
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(apiBase + path, { credentials: "include", ...(opts || {}), headers });
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

  async function loadServers() {
    const res = await realmFetch("/server/mine", { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.servers) ? data.servers : [];
  }

  function renderServers(servers) {
    const list = el("server-list");
    if (!list) return;
    if (!servers.length) {
      list.innerHTML = "<li>No servers registered yet.</li>";
      return;
    }
    list.innerHTML = servers
      .map(
        (s) =>
          "<li><strong>" +
          (s.server_name || s.server_id) +
          "</strong> — <code>" +
          s.server_id +
          "</code></li>",
      )
      .join("");
  }

  async function init() {
    showPanel("panel-loading");
    await loadConfig();
    const me = await fetchMe();
    if (!me) {
      setStatus("Sign in to register a server.", "warn");
      showPanel("panel-login");
      return;
    }
    setStatus("Signed in as " + (me.email || "your account") + ".", "ok");
    showPanel("panel-main");
    renderServers(await loadServers());
  }

  el("form-login")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
        device_id: getOrCreateDeviceId(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.detail || "Sign in failed.", "err");
      return;
    }
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    window.location.reload();
  });

  el("form-register")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    setStatus("Creating credentials…", "");
    const res = await realmFetch("/server/register", {
      method: "POST",
      body: JSON.stringify({ server_name: fd.get("server_name") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.detail || "Registration failed.", "err");
      return;
    }
    setStatus("Server registered.", "ok");
    const block = el("credentials-block");
    const panel = el("panel-credentials");
    if (block && panel) {
      block.textContent =
        "cloud:\n  server-id: " +
        data.server_id +
        "\n  server-secret: " +
        data.server_secret +
        "\n\n# Paste into plugins/RootRecord/cloud.yml under cloud:";
      panel.hidden = false;
    }
    renderServers(await loadServers());
  });

  el("btn-logout")?.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
  });

  void init();
})();
