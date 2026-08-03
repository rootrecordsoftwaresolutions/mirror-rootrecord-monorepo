/** Towny [T] / Claims [C] toggle — mounts after the Economy nav link on economy-related pages. */
(function () {
  var SEGMENTS = {
    economy: true,
    market: true,
    mint: true,
    balances: true,
    resources: true,
    leaderboard: true,
    reserve: true,
    "daily-report": true,
    time: true,
    player: true,
  };

  function normalizePath(pathname) {
    var p = String(pathname || "/").replace(/\/+/g, "/") || "/";
    if (p === "/gen2" || p.indexOf("/gen2/") === 0) {
      p = "/g2" + p.slice("/gen2".length);
      if (!p) p = "/g2/";
    }
    return p;
  }

  function parsePath(pathname) {
    var p = normalizePath(pathname);
    var isClaims =
      p === "/g2" ||
      p.indexOf("/g2/") === 0 ||
      p === "/economy/claims" ||
      p.indexOf("/economy/claims/") === 0;
    var rest = p;
    if (p === "/g2" || p.indexOf("/g2/") === 0) {
      rest = p.slice(3) || "/";
    } else if (p.indexOf("/economy/claims") === 0) {
      rest = "/economy" + p.slice("/economy/claims".length);
      if (rest === "/economy" || rest === "/economy/") rest = "/economy/";
    } else if (p.indexOf("/economy/towny") === 0) {
      rest = "/economy" + p.slice("/economy/towny".length);
      if (rest === "/economy" || rest === "/economy/") rest = "/economy/";
    }
    if (!rest) rest = "/";
    if (rest.charAt(0) !== "/") rest = "/" + rest;
    return { isClaims: isClaims, rest: rest, path: p };
  }

  function firstSegment(rest) {
    return rest.replace(/^\//, "").split("/")[0] || "";
  }

  function isEconomyRelated(rest) {
    return !!SEGMENTS[firstSegment(rest)];
  }

  function ensureSlash(path) {
    if (!path || path === "/") return path || "/";
    if (/\.[a-z0-9]+$/i.test(path)) return path;
    return path.endsWith("/") ? path : path + "/";
  }

  function hrefFor(isClaims, rest) {
    var r = ensureSlash(rest);
    if (r === "/" || r === "/economy/" || r === "/economy") {
      return isClaims ? "/economy/claims/" : "/economy/towny/";
    }
    if (r.indexOf("/economy/") === 0) {
      var after = r.slice("/economy/".length);
      if (after.indexOf("towny/") === 0) after = after.slice("towny/".length);
      if (after.indexOf("claims/") === 0) after = after.slice("claims/".length);
      if (!after || after === "/") {
        return isClaims ? "/economy/claims/" : "/economy/towny/";
      }
      if (after.indexOf("official") === 0 || after.indexOf("all-servers") === 0 || after.indexOf("bonds") === 0) {
        return isClaims ? "/economy/claims/" : "/economy/towny/";
      }
      return (isClaims ? "/economy/claims/" : "/economy/towny/") + after.replace(/^\//, "");
    }
    return isClaims ? ensureSlash("/g2" + r) : r;
  }

  function mountInto(host, parsed) {
    var towny = hrefFor(false, parsed.rest);
    var claims = hrefFor(true, parsed.rest);
    host.className = (host.className || "").replace(/\bgeneration-switch\b/g, "").trim();
    host.classList.add("generation-switch");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Server");
    host.innerHTML =
      '<a class="generation-switch-btn' + (!parsed.isClaims ? " is-active" : "") + '" href="' + towny + '" title="Towny">T</a>' +
      '<a class="generation-switch-btn' + (parsed.isClaims ? " is-active" : "") + '" href="' + claims + '" title="Claims">C</a>';
    host.hidden = false;
  }

  function findEconomyNavLink() {
    var links = document.querySelectorAll(".rmc-nav a[href]");
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (/^\/(g2\/)?economy\/?$/.test(href) || href.indexOf("/economy/") === 0 || href.indexOf("/g2/economy/") === 0) {
        return links[i];
      }
    }
    return null;
  }

  function mount() {
    var parsed = parsePath(window.location.pathname);
    if (!isEconomyRelated(parsed.rest) && parsed.path.indexOf("/economy/") !== 0) return;
    if (parsed.path === "/economy/" || parsed.path === "/economy") return;

    var host = document.querySelector("[data-generation-switch]");
    if (!host) {
      var eco = findEconomyNavLink();
      if (!eco) return;
      host = document.createElement("span");
      host.setAttribute("data-generation-switch", "");
      host.className = "generation-switch generation-switch--nav";
      eco.insertAdjacentElement("afterend", host);
    }
    mountInto(host, parsed);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  document.addEventListener("rootmc:nav-ready", mount);
})();
