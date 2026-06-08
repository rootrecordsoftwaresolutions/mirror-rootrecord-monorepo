(function () {

  function el(id) {

    return document.getElementById(id);

  }



  function uuidFromLocation() {

    var params = new URLSearchParams(window.location.search);

    var fromQuery = (params.get("uuid") || params.get("minecraft_uuid") || "").trim();

    if (fromQuery && /^[0-9a-f-]{36}$/i.test(fromQuery)) {

      return fromQuery.toLowerCase();

    }



    var pathMatch = window.location.pathname.match(/\/player\/([0-9a-f-]{36})\/?$/i);

    if (pathMatch) {

      return pathMatch[1].toLowerCase();

    }



    var parts = window.location.pathname.split("/").filter(Boolean);

    var idx = parts.indexOf("player");

    if (idx >= 0 && parts[idx + 1] && /^[0-9a-f-]{36}$/i.test(parts[idx + 1])) {

      return parts[idx + 1].toLowerCase();

    }



    return "";

  }



  function setStatus(msg, kind) {

    var s = el("status");

    if (!s) return;

    s.textContent = msg || "";

    s.className = "status" + (kind ? " status-" + kind : "");

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

          '<div class="mcmmo-skill"><span>' +

          titleCaseSkill(row.key) +

          '</span><strong>' +

          row.level +

          "</strong></div>"

        );

      })

      .join("");

  }



  async function loadStats(uuid) {

    setStatus("Loading player stats…", "");

    var res = await fetch("/api/realm/minecraft/stats/" + encodeURIComponent(uuid), { cache: "no-store" });

    var data = await res.json().catch(function () {

      return {};

    });

    if (!res.ok) {

      setStatus(data.detail || "Could not load stats.", "err");

      return;

    }

    var stats = data.stats || {};

    el("panel-loading").hidden = true;

    el("panel-stats").hidden = false;



    var name = stats.minecraft_username || stats.realm_username || "Player";

    el("player-name").textContent = name;

    el("player-uuid").textContent = stats.minecraft_uuid || uuid;

    el("verified-badge").textContent = stats.verified ? "RootRecord verified" : "Not verified";

    el("verified-badge").className = stats.verified ? "badge badge-ok" : "badge badge-warn";

    el("verified-at").textContent = stats.verified ? formatDate(stats.verified_at) : "Run /rootstat link in-game";



    var avatar = el("avatar");

    if (avatar && stats.avatar_url) {

      avatar.src = stats.avatar_url;

      avatar.alt = name;

    }



    if (stats.bio) {

      el("player-bio").textContent = stats.bio;

      el("player-bio").hidden = false;

    }



    renderMcmmo(stats.mcmmo);



    var worlds = Array.isArray(stats.shared_worlds) ? stats.shared_worlds : [];

    var list = el("world-list");

    if (list) {

      if (!worlds.length) {

        list.innerHTML = "<li class=\"note\">No public shared worlds yet.</li>";

      } else {

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



    if (window.history && window.history.replaceState) {

      var pretty = "/realm/player/" + uuid;

      if (window.location.pathname !== pretty) {

        window.history.replaceState(null, "", pretty);

      }

    }



    setStatus("", "");

  }



  var uuid = uuidFromLocation();

  if (!uuid) {

    el("panel-loading").hidden = true;

    el("panel-error").hidden = false;

  } else {

    void loadStats(uuid);

  }

})();

