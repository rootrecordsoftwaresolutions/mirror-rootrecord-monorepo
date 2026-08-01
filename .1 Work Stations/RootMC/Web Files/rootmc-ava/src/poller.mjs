/**
 * REST poller — boot handshake, reaction harvest, emergency transport.
 * Live replies prefer Discord Gateway when AVA_TRANSPORT includes gateway.
 */
import {
  loadEnv,
  botToken,
  avaBotAppId,
  watchChannels,
  ROOTMC_GUILD_ID,
  AVA_TRANSPORT,
  AVA_CHANNELS,
} from "./config.mjs";
import { looksLikeAvaTrigger } from "./recommend.mjs";
import { brainQueueDepth, cursorSlots, CURSOR_CONCURRENCY } from "./cursorBrain.mjs";
import { rememberPlayerLine } from "./playerContext.mjs";
import {
  loadSeen,
  saveSeen,
  loadWatermark,
  saveWatermark,
  markShutdown,
  isHushed,
  storePaths,
  writeHeartbeat,
  pushStatusEvent,
} from "./store.mjs";
import {
  needsGuildIntro,
  scoutGuild,
  buildGuildIntroMessage,
  loadGuildProfile,
  saveGuildProfile,
  isAvaOwnMessage,
  avaHomeChannelId,
  refreshGuildAccess,
  buildAdminRequestMessage,
  ensureAvaHomeChannel,
  FIRST_JOIN_PROTOCOL,
} from "./guildScout.mjs";
import {
  harvestReactionsFromMessages,
  loadReactionSummary,
  buildEmojiAskLine,
  markEmojiAsked,
  shouldAskAboutEmoji,
} from "./reactionStore.mjs";
import { makeFetchJson, postMessage } from "./discordApi.mjs";
import { createPipeline, pipelineBusyCount } from "./pipeline.mjs";
import { startGateway } from "./gateway.mjs";
import { runPollWatcher } from "./pollWatcher.mjs";
import { refreshEcoFlow } from "./ecoflow.mjs";
import { startHostMetricsSampler, refreshHostMetrics } from "./hostMetrics.mjs";
import {
  runPendingTasksCheck,
  pendingCheckIntervalMs,
  pendingCheckBootDelayMs,
} from "./pendingTasks.mjs";
import { postOfflineNote } from "./offlineNotes.mjs";
import { cursorApiKey } from "./config.mjs";
import { welcomeNewMember } from "./onboarding.mjs";

const env = await loadEnv();
const token = botToken(env);
const botAppId = avaBotAppId(env);
if (token.length < 40) {
  console.error("AVA_DISCORD_BOT_TOKEN missing — poller idle");
  process.exit(1);
}
if (!botAppId) {
  console.error("AVA_DISCORD_APPLICATION_ID missing — poller idle");
  process.exit(1);
}

const fetchJson = makeFetchJson(token);
const reply = (channelId, content, refId) =>
  postMessage(fetchJson, channelId, content, refId);

const seen = loadSeen();
const watch = watchChannels(env);
const homeCh = avaHomeChannelId();
if (homeCh && !watch.includes(homeCh)) watch.push(homeCh);
if (AVA_CHANNELS.avaHome && !watch.includes(AVA_CHANNELS.avaHome)) {
  watch.push(AVA_CHANNELS.avaHome);
}

const ANNOUNCE_CHANNEL =
  process.env.AVA_ANNOUNCE_CHANNEL ||
  env.AVA_ANNOUNCE_CHANNEL ||
  homeCh ||
  AVA_CHANNELS.general;

const HOT_POLL_MS = Number(process.env.AVA_HOT_POLL_MS || process.env.SEXI_POLL_MS || 4_000);
const BREAK_POLL_MS = Number(process.env.AVA_BREAK_POLL_MS || 60_000);
const BREAK_AFTER_MS = Number(process.env.AVA_BREAK_AFTER_MS || 10 * 60_000);
const FETCH_LIMIT = Number(process.env.AVA_FETCH_LIMIT || 40);
const useGateway = AVA_TRANSPORT === "gateway" || AVA_TRANSPORT === "both";
/** REST live answers only when poller-only (gateway owns live traffic in "both"). */
const usePollerLive = AVA_TRANSPORT === "poller";

let live = false;
let tickRunning = false;
let onBreak = false;
let lastAsk = "";
let lastAskAt = 0;
let lastActivityAt = Date.now();
let pollTimer = null;
let heartbeatTimer = null;
let lastPollWatch = 0;
let lastPendingCheck = 0;
let gatewayHandle = null;
/** Keep status page fresh even when hush/break slows the Discord tick. */
const HEARTBEAT_MS = 15_000;
const PENDING_CHECK_MS = pendingCheckIntervalMs();
const PENDING_BOOT_MS = pendingCheckBootDelayMs();
const pendingBootAt = Date.now() + PENDING_BOOT_MS;

function currentPollMs() {
  if (isHushed() || onBreak) return BREAK_POLL_MS;
  return HOT_POLL_MS;
}

function pulseHeartbeat(extra = {}) {
  writeHeartbeat({
    live,
    onBreak,
    hushed: isHushed(),
    mode: isHushed() ? "hush" : onBreak ? "break" : live ? "hot" : "boot",
    transport: AVA_TRANSPORT,
    pollMs: currentPollMs(),
    hotPollMs: HOT_POLL_MS,
    breakPollMs: BREAK_POLL_MS,
    lastActivityAt,
    queueDepth: brainQueueDepth(),
    cursorAgents: cursorSlots().active,
    cursorMax: CURSOR_CONCURRENCY,
    cursorWaiting: cursorSlots().waiting,
    watchCount: watch.length,
    busyChannels: pipelineBusyCount(),
    lastAsk,
    lastAskAt,
    botAppId,
    gateway: Boolean(gatewayHandle),
    gatewayStats: gatewayHandle?.stats?.() || null,
    // Don't let a prior dig leave sticky true across heartbeats
    digging: Boolean(extra.digging) || brainQueueDepth() > 0,
    reactions: (() => {
      const s = loadReactionSummary();
      return {
        total: s.totalReactions || 0,
        good: s.good || 0,
        bad: s.bad || 0,
        neutral: s.neutral || 0,
        messages: s.messagesTracked || 0,
      };
    })(),
    ...extra,
    // re-assert after extra so callers can't accidentally omit and sticky-merge
    digging:
      extra.digging != null
        ? Boolean(extra.digging)
        : brainQueueDepth() > 0,
  });
}

function discordStamp(ms = Date.now()) {
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:F> · <t:${unix}:R>`;
}

function touchActivity(reason = "") {
  lastActivityAt = Date.now();
  // hush/break transitions own onBreak — don't clear mid-hush
  if (onBreak && reason !== "break" && reason !== "hush") {
    onBreak = false;
    pushStatusEvent(`wake from break · ${reason || "activity"}`);
  }
}

async function maybeEnterBreak() {
  if (!live || isHushed() || onBreak) return;
  if (Date.now() - lastActivityAt < BREAK_AFTER_MS) return;
  // Keep hot while work is open — idle break must not look like death.
  try {
    const { listJobs } = await import("./jobQueue.mjs");
    const open = listJobs(50).filter((j) =>
      ["pending", "implementing", "staged", "waiting_restart", "blocked"].includes(
        String(j.status || ""),
      ),
    );
    if (open.length) return;
  } catch {
    /* ignore */
  }
  if (brainQueueDepth() > 0) return;
  onBreak = true;
  pushStatusEvent("break · quiet");
  pulseHeartbeat();
}

function warmMemory(channelId, messages) {
  for (const m of [...(messages || [])].reverse()) {
    if (!m?.author || m.author.bot) continue;
    if (m.author.id === botAppId) continue;
    if (!m.content?.trim()) continue;
    rememberPlayerLine(channelId, m.author.id, m.author.username, m.content);
  }
}

function markSeen(id) {
  if (!id) return;
  seen.add(id);
  if (seen.size > 8000) {
    const drop = [...seen].slice(0, 2000);
    for (const x of drop) seen.delete(x);
  }
}

function snowflakeTime(id) {
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}

async function channelTargets() {
  const out = new Set(watch);
  if (watch.includes(AVA_CHANNELS.proposals)) {
    try {
      const active = await fetchJson(`/guilds/${ROOTMC_GUILD_ID}/threads/active`);
      for (const t of active?.threads || []) {
        if (t.parent_id === AVA_CHANNELS.proposals) out.add(t.id);
      }
    } catch (err) {
      console.warn("active threads:", err.message);
    }
  }
  return [...out];
}

async function askAboutUnknownEmojis(unknowns) {
  if (!unknowns?.length) return;
  const item = unknowns.find((u) => shouldAskAboutEmoji(u.key));
  if (!item?.apiParam || !item.channelId || !item.messageId) return;

  let users = [];
  try {
    const enc = encodeURIComponent(item.apiParam);
    users = await fetchJson(
      `/channels/${item.channelId}/messages/${item.messageId}/reactions/${enc}?limit=10`,
    );
  } catch (err) {
    console.warn("reaction users:", err.message);
    markEmojiAsked(item.key, null);
    return;
  }

  const person = (users || []).find(
    (u) => u?.id && !u.bot && String(u.id) !== String(botAppId),
  );
  if (!person) return;

  const line = buildEmojiAskLine({
    display: item.display,
    username: person.username,
  });
  try {
    const askMsg = await reply(item.channelId, line, item.messageId);
    markEmojiAsked(item.key, {
      key: item.key,
      display: item.display,
      apiParam: item.apiParam,
      channelId: item.channelId,
      messageId: item.messageId,
      askMessageId: askMsg?.id || null,
      askedUserId: person.id,
      askedUserName: person.username,
      askedAt: Date.now(),
    });
    pushStatusEvent(`emoji ask · ${item.display}`);
    touchActivity("emoji-ask");
  } catch (err) {
    console.warn("emoji ask failed:", err.message);
  }
}

const pipeline = createPipeline({
  fetchJson,
  reply,
  botAppId,
  env,
  touchActivity,
  pulseHeartbeat: (extra) => {
    if (extra?.lastAsk) {
      lastAsk = extra.lastAsk;
      lastAskAt = Date.now();
    }
    pulseHeartbeat(extra);
  },
  getOnBreak: () => onBreak,
  setOnBreak: (v) => {
    onBreak = Boolean(v);
  },
});

async function bootHandshake() {
  storePaths();

  const guildId = ROOTMC_GUILD_ID;
  if (needsGuildIntro(guildId)) {
    pushStatusEvent("first join — scouting guild");
    pulseHeartbeat({ mode: "scout" });
    try {
      const profile = await scoutGuild({
        fetchJson,
        guildId,
        avaBotId: botAppId,
        announceFallback: ANNOUNCE_CHANNEL,
      });
      const intro = buildGuildIntroMessage(profile);
      const channelId = profile.introChannelId || ANNOUNCE_CHANNEL;
      await reply(channelId, intro);
      profile.introducedAt = Date.now();
      profile.firstJoinProtocol = FIRST_JOIN_PROTOCOL;

      if (profile.access && !profile.access.ok) {
        const ask = buildAdminRequestMessage(
          {
            summary: {
              ok: profile.access.ok,
              administrator: profile.access.administrator,
              missing: profile.access.missing,
            },
          },
          { clientId: botAppId },
        );
        if (ask) {
          try {
            await reply(channelId, ask);
            profile.access.requestedAt = Date.now();
          } catch (err) {
            console.warn("admin request post failed:", err.message);
          }
        }
      }

      saveGuildProfile(guildId, profile);
      if (profile.avaChannelId && !watch.includes(profile.avaChannelId)) {
        watch.push(profile.avaChannelId);
        gatewayHandle?.addWatch?.(profile.avaChannelId);
      }
      pushStatusEvent(
        profile.avaChannelCreated
          ? `created #${profile.avaChannelName} + intro`
          : `guild intro · home #${profile.avaChannelName || "chat"}`,
      );
      console.log("Ava first-join intro posted to", channelId);
    } catch (err) {
      console.warn("guild scout/intro failed:", err.message);
      pushStatusEvent(`guild scout failed · ${err.message}`);
    }
  } else {
    try {
      const { profile, requestMessage } = await refreshGuildAccess({
        fetchJson,
        guildId,
        avaBotId: botAppId,
      });
      const lastAskPerms = profile.access?.requestedAt || 0;
      const week = 7 * 24 * 60 * 60 * 1000;
      if (requestMessage && Date.now() - lastAskPerms > week) {
        const ch = profile.avaChannelId || ANNOUNCE_CHANNEL;
        await reply(ch, requestMessage);
        profile.access = { ...profile.access, requestedAt: Date.now() };
        saveGuildProfile(guildId, profile);
        pushStatusEvent("perms still short · reminded admins");
      } else if (profile.access?.ok || profile.access?.administrator) {
        pushStatusEvent("perms ok · administrator");
      }

      // Create #ava-ivy now that Manage Channels / Admin is available
      if (!profile.avaChannelId && (profile.access?.ok || profile.access?.administrator)) {
        try {
          const allCh = await fetchJson(`/guilds/${guildId}/channels`);
          const home = await ensureAvaHomeChannel({
            fetchJson,
            guildId,
            channels: allCh,
            existingHomeId: null,
          });
          if (home.id) {
            profile.avaChannelId = home.id;
            profile.avaChannelName = home.name || "ava-ivy";
            profile.avaChannelCreated = Boolean(home.created);
            saveGuildProfile(guildId, profile);
            if (!watch.includes(home.id)) watch.push(home.id);
            const note = home.created
              ? `grabbed **#${home.name}** as my corner — rename anytime.`
              : `hanging in **#${home.name}**.`;
            await reply(home.id, `perms look good — ${note}`);
            pushStatusEvent(`home #${home.name} ready`);
            console.log("Ava home channel ready", home.id);
          } else if (home.error) {
            console.warn("home channel:", home.error);
          }
        } catch (err) {
          console.warn("ensure home:", err.message);
        }
      }
    } catch (err) {
      console.warn("guild access refresh:", err.message);
    }
  }

  const wm = loadWatermark();
  const channels = await channelTargets();
  const bullets = [];
  const latestMap = {};

  for (const channelId of channels) {
    let messages;
    try {
      messages = await fetchJson(`/channels/${channelId}/messages?limit=${FETCH_LIMIT}`);
    } catch {
      continue;
    }
    if (!Array.isArray(messages) || !messages.length) continue;
    latestMap[channelId] = messages[0].id;
    const floorId = wm.channels?.[channelId];
    const floorTs = wm.shutdownAt || 0;

    for (const m of messages) {
      markSeen(m.id);
      if (isAvaOwnMessage(m, botAppId)) continue;
      if (m.author?.bot) continue;
      const ts = snowflakeTime(m.id);
      const isNew = floorId
        ? BigInt(m.id) > BigInt(floorId)
        : floorTs
          ? ts > floorTs
          : false;
      if (!isNew) continue;
      const text = String(m.content || "").trim();
      if (!text) continue;
      const hit = looksLikeAvaTrigger(m, botAppId);
      if (hit) {
        const atts = Array.isArray(m.attachments)
          ? m.attachments.map((a) => a.filename || a.id).filter(Boolean)
          : [];
        bullets.push(
          `• **${m.author.username}**: ${text.slice(0, 160)}${
            atts.length ? ` _[+${atts.length} file(s): ${atts.slice(0, 3).join(", ")}]_` : ""
          }`,
        );
      }
    }
    warmMemory(channelId, messages);
    harvestReactionsFromMessages(channelId, messages, botAppId);
  }

  saveSeen(seen);
  saveWatermark({ channels: latestMap, shutdownAt: Date.now() });

  const alreadyIntroduced = Boolean(loadGuildProfile(guildId)?.introducedAt);
  const isFreshIntro =
    alreadyIntroduced &&
    Date.now() - (loadGuildProfile(guildId)?.introducedAt || 0) < 120_000;

  if (!isFreshIntro && bullets.length > 0) {
    // Skip noisy "was asleep" on quick restarts (<10m since last shutdown)
    const lastDown = Number(wm.shutdownAt || 0);
    const quickRestart = lastDown && Date.now() - lastDown < 10 * 60_000;
    if (!quickRestart) {
      const summary = [
        "**While I was out — stuff aimed at me:**",
        ...bullets.slice(0, 8),
        bullets.length > 8 ? `_…+${bullets.length - 8} more_` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const active = `sorry I was asleep — ${discordStamp()}\nI'm active now — ping me if you still need something.`;
      try {
        await reply(ANNOUNCE_CHANNEL, summary);
        await reply(ANNOUNCE_CHANNEL, active);
      } catch (err) {
        console.warn("boot announce failed:", err.message);
      }
    } else {
      pushStatusEvent(`boot quiet restart · ${bullets.length} missed ping(s) skipped announce`);
    }
  } else if (!isFreshIntro) {
    pushStatusEvent("boot quiet — nothing aimed at Ava");
  }

  if (!cursorApiKey(env)) {
    await postOfflineNote(fetchJson, "Root Server key missing at boot");
  }

  await refreshEcoFlow().catch(() => {});
  startHostMetricsSampler();

  live = true;
  touchActivity("boot");
  pushStatusEvent("boot handshake done — live");
  pulseHeartbeat();
  console.log("Ava boot handshake done — live");
}

async function tick() {
  if (!live || tickRunning) return;
  tickRunning = true;
  try {
    await maybeEnterBreak();

    const channels = await channelTargets();
    const latestMap = {};

    for (const channelId of channels) {
      let messages;
      try {
        messages = await fetchJson(`/channels/${channelId}/messages?limit=${FETCH_LIMIT}`);
      } catch {
        continue;
      }
      if (Array.isArray(messages) && messages[0]?.id) {
        latestMap[channelId] = messages[0].id;
      }

      warmMemory(channelId, messages);
      const harvested = harvestReactionsFromMessages(channelId, messages, botAppId);
      await askAboutUnknownEmojis(harvested.unknowns || []);

      // Live message answering via REST only when poller transport enabled
      // (gateway handles live when useGateway; "both" uses gateway primarily —
      // poller still catches anything missed via seen set)
      if (usePollerLive) {
        const batch = [...(messages || [])].reverse();
        for (const msg of batch) {
          if (!msg?.id || seen.has(msg.id)) continue;
          markSeen(msg.id);
          if (msg.author?.bot) continue;
          if (msg.author?.id === botAppId) continue;
          try {
            await pipeline.ingestMessage(msg, { messages, isDm: false });
          } catch (err) {
            console.warn("ingest:", err.message);
          }
        }
      }
      // When gateway owns live traffic, do NOT markSeen here — gateway marks on deliver.
      // Watermark still advances via latestMap so boot catch-up stays correct.
    }

    if (Object.keys(latestMap).length) {
      const wm = loadWatermark();
      saveWatermark({ ...wm, channels: { ...(wm.channels || {}), ...latestMap } });
    }

    // Periodic poll watcher (~10 min)
    if (Date.now() - lastPollWatch > 10 * 60_000) {
      lastPollWatch = Date.now();
      try {
        const r = await runPollWatcher({
          fetchJson,
          channelId: AVA_CHANNELS.governance,
        });
        if (r.posts) pushStatusEvent(`poll watcher · ${r.posts} post(s)`);
      } catch (err) {
        console.warn("poll watcher:", err.message);
      }
      await refreshEcoFlow().catch(() => {});
      await refreshHostMetrics().catch(() => {});
    }

    // Ava-initiated pending tasks check (first ~90s after boot, then interval)
    const dueBoot = Date.now() >= pendingBootAt && lastPendingCheck === 0;
    const dueInterval =
      lastPendingCheck > 0 && Date.now() - lastPendingCheck >= PENDING_CHECK_MS;
    if (live && !isHushed() && (dueBoot || dueInterval)) {
      lastPendingCheck = Date.now();
      try {
        await runPendingTasksCheck(fetchJson, { force: dueBoot });
      } catch (err) {
        console.warn("pending tasks:", err.message);
      }
    }

    saveSeen(seen);
  } finally {
    tickRunning = false;
    pulseHeartbeat();
  }
}

function scheduleNextTick() {
  if (pollTimer) clearTimeout(pollTimer);
  const ms = currentPollMs();
  pulseHeartbeat();
  pollTimer = setTimeout(() => {
    tick()
      .catch((err) => console.warn("tick:", err.message))
      .finally(() => scheduleNextTick());
  }, ms);
}

function startHeartbeatPulse() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  pulseHeartbeat();
  heartbeatTimer = setInterval(() => {
    pulseHeartbeat();
  }, HEARTBEAT_MS);
}

function shutdown() {
  console.log("Ava shutting down — watermark");
  if (pollTimer) clearTimeout(pollTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  gatewayHandle?.stop?.();
  pushStatusEvent("shutdown");
  writeHeartbeat({ live: false, mode: "off" });
  markShutdown(loadWatermark().channels || {});
  saveSeen(seen);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Ava Ivy as app ${botAppId}, watching ${watch.length} channel(s)`);
console.log(`transport: ${AVA_TRANSPORT} · hot ${HOT_POLL_MS}ms · break ${BREAK_POLL_MS}ms`);
console.log(`handoff data: ${storePaths().dir}`);

await bootHandshake();

if (useGateway) {
  gatewayHandle = startGateway({
    token,
    watchIds: watch,
    onReady: () => {
      pushStatusEvent("gateway ready");
      pulseHeartbeat({ gateway: true });
    },
    onMemberJoin: async (member) => {
      if (!live) return;
      try {
        const r = await welcomeNewMember(fetchJson, member);
        if (r.ok) {
          pushStatusEvent(
            `join welcome · ${member?.user?.username || member?.user?.id}`,
          );
          touchActivity("join-welcome");
          console.log("join welcome sent to", member?.user?.username);
        } else if (r.reason && r.reason !== "already_welcomed" && r.reason !== "skip") {
          console.warn("join welcome:", r.reason);
        }
      } catch (err) {
        console.warn("join welcome failed:", err.message);
      }
    },
    onMessage: async (msg, meta) => {
      if (!live) return;
      if (seen.has(msg.id)) return;
      markSeen(msg.id);
      touchActivity("gateway");
      try {
        // Gateway often omits referenced_message — fetch parent so reply-to-Ava works
        let messages = msg.referenced_message ? [msg.referenced_message] : [];
        const refId = msg.message_reference?.message_id;
        if (refId && !messages.length) {
          try {
            const parent = await fetchJson(
              `/channels/${msg.channel_id}/messages/${refId}`,
            );
            if (parent) messages = [parent];
          } catch (err) {
            console.warn("ref fetch:", err.message);
          }
        }
        await pipeline.ingestMessage(msg, {
          messages,
          isDm: Boolean(meta?.isDm),
        });
      } catch (err) {
        console.warn("gateway ingest:", err.message);
      }
      saveSeen(seen);
    },
  });
}

scheduleNextTick();
startHeartbeatPulse();

// Ava initiates her own pending-tasks audit shortly after boot, then on interval via tick
setTimeout(() => {
  if (!live || isHushed()) return;
  lastPendingCheck = Date.now();
  runPendingTasksCheck(fetchJson, { force: true }).catch((err) =>
    console.warn("pending tasks boot:", err.message),
  );
}, PENDING_BOOT_MS);
console.log(
  `pending tasks check · first in ~${Math.round(PENDING_BOOT_MS / 1000)}s · then every ${Math.round(PENDING_CHECK_MS / 60000)}m`,
);
