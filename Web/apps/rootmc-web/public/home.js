(function () {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scoreLine(p) {
    var votePts = (Number(p.voteCount) || 0) * 5;
    return (
      esc(p.activityScore) +
      " pts (" +
      esc(p.messageCount) +
      " blocks · " +
      esc(p.voteCount) +
      " votes = " +
      esc(votePts) +
      " pts · " +
      esc(p.reactionCount) +
      " reactions)"
    );
  }

  async function loadWeeklyLeaders() {
    var section = document.getElementById("weekly-leaders");
    if (!section) return;

    try {
      var res = await fetch("/api/rootmc/weekly-activity/highlights", { credentials: "same-origin" });
      if (!res.ok) return;
      var data = await res.json();
      if (!data) return;
      var hasCurrentRoleData =
        (Array.isArray(data.currentTopParticipatorRole) && data.currentTopParticipatorRole.length) ||
        (Array.isArray(data.currentTopActivePlayerRole) && data.currentTopActivePlayerRole.length);
      if (!data.posted && !hasCurrentRoleData) return;

      section.hidden = false;

      var weekEl = document.getElementById("weekly-leaders-week");
      if (weekEl && data.weekLabel) {
        weekEl.textContent = "Week of " + data.weekLabel;
      } else if (weekEl && hasCurrentRoleData) {
        weekEl.textContent = "Current Discord role holders";
      }

      var partList = document.getElementById("weekly-participators");
      if (partList && Array.isArray(data.participators) && data.participators.length) {
        partList.innerHTML = data.participators
          .map(function (p) {
            return (
              '<li class="rmc-leader-row">' +
              '<span class="rmc-leader-rank">' +
              esc(p.rank) +
              "</span>" +
              '<span class="rmc-leader-name">' +
              esc(p.displayName) +
              "</span>" +
              '<span class="rmc-leader-meta">' +
              scoreLine(p) +
              "</span>" +
              "</li>"
            );
          })
          .join("");
      } else if (
        partList &&
        Array.isArray(data.currentTopParticipatorRole) &&
        data.currentTopParticipatorRole.length
      ) {
        partList.innerHTML = data.currentTopParticipatorRole
          .map(function (name, idx) {
            return (
              '<li class="rmc-leader-row">' +
              '<span class="rmc-leader-rank">' +
              esc(idx + 1) +
              "</span>" +
              '<span class="rmc-leader-name">' +
              esc(name) +
              "</span>" +
              '<span class="rmc-leader-meta">Current Top Participator role</span>' +
              "</li>"
            );
          })
          .join("");
      } else if (partList) {
        partList.innerHTML = '<li class="rmc-leader-empty">No Top Participator winners this week.</li>';
      }

      var playerBlock = document.getElementById("weekly-top-player");
      if (playerBlock) {
        var topPlayers =
          Array.isArray(data.topActivePlayers) && data.topActivePlayers.length
            ? data.topActivePlayers
            : data.topActivePlayer
              ? [data.topActivePlayer]
              : [];
        if (topPlayers.length) {
          playerBlock.hidden = false;
          playerBlock.innerHTML = topPlayers
            .map(function (tp) {
              var pro = tp.proGranted ? " · Pro member this week" : "";
              return (
                '<p class="rmc-leader-player-name">#' +
                esc(tp.rank || 1) +
                " " +
                esc(tp.minecraftUsername) +
                "</p>" +
                '<p class="rmc-muted">' +
                esc(tp.displayName) +
                " · " +
                esc(tp.weeklyPlaytimeLabel) +
                " in-game" +
                esc(pro) +
                "</p>"
              );
            })
            .join("");
        } else if (Array.isArray(data.currentTopActivePlayerRole) && data.currentTopActivePlayerRole.length) {
          playerBlock.hidden = false;
          playerBlock.innerHTML =
            '<p class="rmc-leader-player-name">' +
            esc(data.currentTopActivePlayerRole[0]) +
            "</p>" +
            '<p class="rmc-muted">Current Top Active Player role holder</p>';
        } else {
          playerBlock.hidden = true;
        }
      }
    } catch (_e) {
      /* keep section hidden until awards exist */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadWeeklyLeaders);
  } else {
    loadWeeklyLeaders();
  }
})();
