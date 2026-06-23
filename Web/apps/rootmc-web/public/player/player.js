(function () {
  var searchTimer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function uuidFromLocation() {
    var fromQuery = (params().get("uuid") || params().get("minecraft_uuid") || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(fromQuery)) return fromQuery.toLowerCase();

    var pathMatch = window.location.pathname.match(/\/player\/([0-9a-f-]{36})\/?$/i);
    if (pathMatch) return pathMatch[1].toLowerCase();

    var parts = window.location.pathname.split("/").filter(Boolean);
    var idx = parts.indexOf("player");
    if (idx >= 0 && parts[idx + 1] && /^[0-9a-f-]{36}$/i.test(parts[idx + 1])) {
      return parts[idx + 1].toLowerCase();
    }
    return "";
  }

  function setPageStatus(msg, kind) {
    var s = el("page-status");
    if (!s) return;
    s.textContent = msg || "";
    s.className = "player-page-status" + (kind ? " player-page-status-" + kind : "");
    s.hidden = !msg;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  function titleCaseSkill(key) {
    if (!key) return "";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function formatPlaytime(totalSeconds) {
    var seconds = Number(totalSeconds) || 0;
    if (seconds <= 0) return "0m";
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? hours + "h " + minutes + "m" : minutes + "m";
  }

  function formatCurrency(value) {
    var n = Number(value) || 0;
    if (n <= 0) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(Math.round(n));
  }

  function avatarUrl(uuid) {
    return "https://crafatar.com/avatars/" + uuid.replace(/-/g, "") + "?overlay&size=128";
  }

  function navigateToPlayer(uuid, q) {
    var next = new URLSearchParams();
    if (uuid) next.set("uuid", uuid);
    if (q) next.set("q", q);
    var qs = next.toString();
    history.pushState(null, "", "/player/" + (qs ? "?" + qs : ""));
  }

  function renderMcmmo(mcmmo) {
    var empty = el("mcmmo-empty");
    var panel = el("mcmmo-panel");
    var skillsEl = el("mcmmo-skills");
    if (!empty || !panel || !skillsEl) return;

    if (!mcmmo || !mcmmo.skills || !Object.keys(mcmmo.skills).length) {
      empty.hidden = false;
      panel.hidden = true;
      return;
    }

    empty.hidden = true;
    panel.hidden = false;
    el("mcmmo-power").textContent = mcmmo.power_level != null ? String(mcmmo.power_level) : "—";
    el("mcmmo-synced").textContent = formatDate(mcmmo.synced_at);

    var entries = Object.keys(mcmmo.skills)
      .map(function (key) {
        return { key: key, level: mcmmo.skills[key] };
      })
      .sort(function (a, b) {
        return b.level - a.level;
      });

    skillsEl.innerHTML = entries
      .map(function (row) {
        return (
          '<div class="player-mcmmo-skill"><span>' +
          titleCaseSkill(row.key) +
          '</span><strong>' +
          row.level +
          "</strong></div>"
        );
      })
      .join("");
  }

  function renderPlaytime(playtime) {
    var empty = el("playtime-empty");
    var panel = el("playtime-panel");
    if (!empty || !panel) return;
    if (!playtime || !playtime.total_playtime_seconds) {
      empty.hidden = false;
      panel.hidden = true;
      return;
    }
    empty.hidden = true;
    panel.hidden = false;
    el("playtime-total").textContent = formatPlaytime(playtime.total_playtime_seconds);
    el("playtime-first").textContent = formatDate(playtime.first_join_at);
    el("playtime-last").textContent = formatDate(playtime.last_login_at);
  }

  function renderNetWorth(netWorth) {
    var empty = el("networth-empty");
    var panel = el("networth-panel");
    if (!empty || !panel) return;
    if (!netWorth || !netWorth.total_value) {
      empty.hidden = false;
      panel.hidden = true;
      return;
    }
    empty.hidden = true;
    panel.hidden = false;
    el("networth-total").textContent = formatCurrency(netWorth.total_value);
    el("networth-balance").textContent = formatCurrency(netWorth.balance_value);
    el("networth-inventory").textContent = formatCurrency(netWorth.inventory_value);
    el("networth-shop-stock").textContent = formatCurrency(netWorth.shop_stock_value || 0);
    el("networth-synced").textContent = formatDate(netWorth.synced_at);
  }

  async function loadStats(uuid) {
    setPageStatus("", "");
    el("panel-loading").hidden = false;
    el("panel-profile").hidden = true;

    try {
      var res = await fetch("/api/realm/minecraft/stats/" + encodeURIComponent(uuid), { cache: "no-store" });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.detail || "Could not load stats.");

      var stats = data.stats || {};
      el("panel-loading").hidden = true;
      el("panel-profile").hidden = false;

      var name = stats.minecraft_username || stats.realm_username || "Player";
      el("player-name").textContent = name;
      el("player-uuid").textContent = stats.minecraft_uuid || uuid;

      var badge = el("verified-badge");
      badge.textContent = stats.verified ? "Linked account" : "Not linked";
      badge.className = stats.verified ? "player-badge player-badge-ok" : "player-badge";

      var avatar = el("avatar");
      if (avatar) {
        avatar.src = stats.avatar_url || avatarUrl(uuid);
        avatar.alt = name;
      }

      var bio = el("player-bio");
      if (stats.bio) {
        bio.textContent = stats.bio;
        bio.hidden = false;
      } else if (bio) {
        bio.hidden = true;
      }

      renderMcmmo(stats.mcmmo);
      renderPlaytime(stats.playtime);
      renderNetWorth(stats.net_worth);

      var worlds = Array.isArray(stats.shared_worlds) ? stats.shared_worlds : [];
      var worldsBlock = el("worlds-block");
      var list = el("world-list");
      if (worldsBlock && list) {
        if (!worlds.length) {
          worldsBlock.hidden = true;
        } else {
          worldsBlock.hidden = false;
          list.innerHTML = worlds
            .map(function (w) {
              var notes = w.note_count != null ? w.note_count + " notes" : "";
              var ver = w.game_version ? " · " + w.game_version : "";
              return (
                "<li><strong>" +
                (w.world_name || "World") +
                "</strong>" +
                (w.seed ? " · seed " + w.seed : "") +
                ver +
                (notes ? " · " + notes : "") +
                "</li>"
              );
            })
            .join("");
        }
      }

      navigateToPlayer(uuid, params().get("q") || "");
    } catch (e) {
      el("panel-loading").hidden = true;
      setPageStatus(String(e.message || e), "err");
    }
  }

  function renderSearchResults(players) {
    var list = el("search-results");
    var hint = el("search-status");
    if (!list || !hint) return;

    if (!players.length) {
      list.hidden = true;
      hint.hidden = false;
      hint.textContent = "No players found. Try another name.";
      return;
    }

    hint.hidden = false;
    hint.textContent = players.length + " player" + (players.length === 1 ? "" : "s") + " found";
    list.hidden = false;
    list.innerHTML = players
      .map(function (p) {
        var name = p.minecraft_username || "Unknown";
        var verified = p.verified ? '<span class="player-result-verified">linked</span>' : "";
        return (
          '<li><button type="button" class="player-result" data-uuid="' +
          p.minecraft_uuid +
          '">' +
          '<img src="' +
          avatarUrl(p.minecraft_uuid) +
          '" alt="" width="40" height="40">' +
          "<span><strong>" +
          name +
          "</strong>" +
          verified +
          "</span></button></li>"
        );
      })
      .join("");

    list.querySelectorAll(".player-result").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var uuid = btn.getAttribute("data-uuid");
        if (uuid) void loadStats(uuid);
      });
    });
  }

  async function runSearch(q) {
    var query = String(q || "").trim();
    var hint = el("search-status");
    var list = el("search-results");
    if (query.length < 2) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = "Type at least 2 characters to search.";
      }
      if (list) list.hidden = true;
      return;
    }

    if (hint) {
      hint.hidden = false;
      hint.textContent = "Searching…";
    }
    if (list) list.hidden = true;

    try {
      var res = await fetch(
        "/api/realm/minecraft/players/search?q=" + encodeURIComponent(query) + "&limit=20",
        { cache: "no-store" },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.detail || "Search failed.");
      renderSearchResults(Array.isArray(data.players) ? data.players : []);

      var next = new URLSearchParams(window.location.search);
      next.set("q", query);
      next.delete("uuid");
      history.replaceState(null, "", "/player/?" + next.toString());
      el("panel-profile").hidden = true;
    } catch (e) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = String(e.message || e);
      }
    }
  }

  el("search-form")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    void runSearch(el("search-q")?.value || "");
  });

  el("search-q")?.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      void runSearch(el("search-q")?.value || "");
    }, 320);
  });

  window.addEventListener("popstate", function () {
    var uuid = uuidFromLocation();
    if (uuid) void loadStats(uuid);
    else {
      el("panel-profile").hidden = true;
      el("panel-loading").hidden = true;
      var q = params().get("q");
      if (q) {
        if (el("search-q")) el("search-q").value = q;
        void runSearch(q);
      }
    }
  });

  (function init() {
    var q = params().get("q") || "";
    if (el("search-q") && q) el("search-q").value = q;

    var uuid = uuidFromLocation();
    if (uuid) {
      void loadStats(uuid);
      if (q) void runSearch(q);
      return;
    }
    if (q) {
      void runSearch(q);
      return;
    }
  })();
})();
