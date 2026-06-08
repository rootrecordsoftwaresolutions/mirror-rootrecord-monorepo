(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text || "—";
  }

  function show(id, visible) {
    var node = el(id);
    if (node) node.hidden = !visible;
  }

  async function loadFeaturedServer() {
    try {
      var res = await fetch("/api/blocknotes/server/config", { cache: "no-store" });
      var data = await res.json().catch(function () {
        return {};
      });
      var s = data.featured_server || {};
      setText("server-name", s.name || "RootRecord SMP");
      setText("server-address", s.address || "15.204.13.9:25565");
      setText("server-world", s.default_world_name || "RootRecord SMP");
      setText("server-version", s.game_version || "—");
      var status = el("server-status");
      if (status) {
        if (s.blocknotes_plugin_installed) {
          status.textContent = "Online — BlockNotes heartbeat active";
          status.className = "badge badge-ok";
        } else {
          status.textContent = "Registered — awaiting plugin heartbeat";
          status.className = "badge badge-warn";
        }
      }
      setText("server-last-seen", s.blocknotes_last_seen_at ? formatDate(s.blocknotes_last_seen_at) : "—");
      var join = el("server-join");
      if (join && s.address) {
        join.textContent = s.address;
      }
    } catch (e) {
      setText("server-status", "Could not load server status");
    }
  }

  async function loadPlugins() {
    try {
      var res = await fetch("/realm/plugins/manifest.json", { cache: "no-store" });
      var manifest = await res.json().catch(function () {
        return {};
      });
      var list = el("plugin-list");
      if (!list) return;
      var items = [];
      ["rootstat", "blocknotes"].forEach(function (key) {
        var p = manifest[key];
        if (!p) return;
        items.push(
          "<li><strong>" +
            key +
            "</strong> · v" +
            (p.version || "?") +
            ' · <a href="' +
            (p.url || "#") +
            '">Download jar</a></li>'
        );
      });
      list.innerHTML = items.length ? items.join("") : "<li class=\"note\">Plugin manifest unavailable.</li>";
    } catch (e) {
      var list = el("plugin-list");
      if (list) list.innerHTML = "<li class=\"note\">Plugin manifest unavailable.</li>";
    }
  }

  void loadFeaturedServer();
  void loadPlugins();
})();
