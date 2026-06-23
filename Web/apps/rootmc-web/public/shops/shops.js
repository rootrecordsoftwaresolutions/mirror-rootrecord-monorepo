(function () {
  var API = "/api/rootmc/server/";
  var FEATURED_FALLBACK_ID = "rootmc";

  function el(id) {
    return document.getElementById(id);
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function serverIdFromQuery() {
    return (params().get("server") || params().get("server_id") || "").trim();
  }

  function playerUuid() {
    var raw = (params().get("player") || params().get("uuid") || "").trim().toLowerCase();
    return /^[0-9a-f-]{36}$/.test(raw) ? raw : "";
  }

  async function resolveServerId() {
    var sid = serverIdFromQuery();
    if (sid) {
      return { serverId: sid, serverName: null };
    }
    try {
      var res = await fetch("/api/rootmc/server/config", { cache: "no-store" });
      var data = await res.json().catch(function () { return {}; });
      var featured = data.featured_server || {};
      sid = String(featured.server_id || "").trim();
      if (sid) {
        return { serverId: sid, serverName: featured.name || null };
      }
    } catch (e) {
      /* fall through */
    }
    return { serverId: FEATURED_FALLBACK_ID, serverName: "RootMC" };
  }

  function fmtMoney(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function titleCase(key) {
    return String(key || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  async function load() {
    var resolved = await resolveServerId();
    var sid = resolved.serverId;
    if (!sid) {
      el("shops-subtitle").textContent = "No featured server configured yet.";
      return;
    }

    if (!serverIdFromQuery()) {
      var next = new URLSearchParams(window.location.search);
      next.set("server", sid);
      var qs = next.toString();
      history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
    }

    var player = playerUuid();
    var path = player
      ? API + encodeURIComponent(sid) + "/shops/player/" + encodeURIComponent(player)
      : API + encodeURIComponent(sid) + "/shops?limit=120";

    var label = resolved.serverName || sid;
    el("shops-subtitle").textContent = label + (player ? " · player " + player : "");

    try {
      var res = await fetch(path, { cache: "no-store" });
      var data = await res.json();
      if (!res.ok) throw new Error(data.detail || ("HTTP " + res.status));

      if (data.share_url) {
        el("shops-subtitle").textContent += " · Share: " + data.share_url;
      }

      var priceList = el("price-list");
      priceList.innerHTML = "";
      (data.prices || []).forEach(function (row) {
        var div = document.createElement("div");
        div.className = "price-row";
        div.innerHTML = "<strong>" + titleCase(row.item_key) + "</strong>"
          + "<span class='muted-small'>Avg " + fmtMoney(row.avg_price)
          + " · " + (row.sample_count || 0) + " samples</span>";
        priceList.appendChild(div);
      });
      if (!data.prices || !data.prices.length) {
        priceList.innerHTML = "<p class='muted-small'>No average prices yet.</p>";
      }

      var listingList = el("listing-list");
      listingList.innerHTML = "";
      (data.listings || []).forEach(function (row) {
        var div = document.createElement("div");
        div.className = "shop-row";
        var owner = row.owner_username || row.owner_uuid || "Unknown";
        div.innerHTML = "<strong>" + titleCase(row.item_key) + " — " + fmtMoney(row.price) + "</strong>"
          + "<span class='muted-small'>" + owner + " · " + row.world
          + " @ " + row.x + "," + row.y + "," + row.z + " · "
          + (((row.listing_type || "sell") === "buy") ? "BUY shop" : "SELL shop")
          + (row.stock_quantity != null ? " · " + (((row.listing_type || "sell") === "buy") ? "wants " : "stock ") + row.stock_quantity : "")
          + "</span>";
        listingList.appendChild(div);
      });
      if (!data.listings || !data.listings.length) {
        listingList.innerHTML = "<p class='muted-small'>No player shops synced yet. In-game: hold an item, left-click or shift+right-click a chest/barrel, type price in chat, then stock it. Listings update when someone is online (~5 min).</p>";
      }

      var board = el("leaderboard");
      board.innerHTML = "";
      (data.net_worth_leaderboard || []).forEach(function (row) {
        var div = document.createElement("div");
        div.className = "leader-row";
        div.innerHTML = "<span>#" + row.rank + " " + (row.minecraft_username || row.minecraft_uuid || "?") + "</span>"
          + "<span>" + fmtMoney(row.total_value) + "</span>";
        board.appendChild(div);
      });
      if (!data.net_worth_leaderboard || !data.net_worth_leaderboard.length) {
        board.innerHTML = "<p class='muted-small'>Leaderboard fills after update.</p>";
      }
    } catch (err) {
      el("shops-error").hidden = false;
      el("shops-error").textContent = err.message || String(err);
    }
  }

  load();
})();
