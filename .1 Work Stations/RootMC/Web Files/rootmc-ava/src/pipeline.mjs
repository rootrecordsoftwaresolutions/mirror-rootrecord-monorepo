/**
 * Shared live-message pipeline for poller + gateway.
 */
import {
  extractQuestion,
  looksLikeAvaTrigger,
  recommend,
  isHushCommand,
  isWakeCommand,
  isQuietOperator,
} from "./recommend.mjs";
import { isRestartCommand, scheduleSelfRestart } from "./selfUpgrade.mjs";
import {
  buildPlayerContext,
  rememberPlayerLine,
  memoryContext,
} from "./playerContext.mjs";
import { pickInstantOpen, pickHold, holdBeatDelays, pickBusyWait } from "./instantLines.mjs";
import {
  brainQueueDepth,
  beginAsk,
  endAsk,
  cursorSlots,
  CURSOR_CONCURRENCY,
} from "./cursorBrain.mjs";
import {
  isHushed,
  setHushed,
  lastReplyFor,
  setLastReply,
  nearDuplicate,
  pushStatusEvent,
  markShutdown,
  loadWatermark,
} from "./store.mjs";
import { isAvaOwnMessage, refreshGuildAccess } from "./guildScout.mjs";
import { silentlyProfileMessage } from "./playerProfiles.mjs";
import { tryLearnFromMessage } from "./reactionStore.mjs";
import { saveMessageAttachments, imagesForCursor } from "./uploads.mjs";
import { maybeSendOnboardingDm } from "./onboarding.mjs";
import { persistTurn } from "./conversationStore.mjs";
import { classifyIntent, shouldCreateJob } from "./classify.mjs";
import {
  createJob,
  markImplementing,
  markStaged,
  markFailed,
  updateJobPlan,
} from "./jobQueue.mjs";
import {
  isEmergencyStopCommand,
  isEmergencyClearCommand,
  canEmergencyStop,
  setEmergencyStop,
  isEmergencyStopped,
} from "./emergencyStop.mjs";
import {
  isBlockedMassAction,
  isBlockedEconomyOrCore,
  tryModerationCommand,
} from "./moderation.mjs";
import { AVA_CHANNELS, ROOTMC_GUILD_ID } from "./config.mjs";
import { postOfflineNote } from "./offlineNotes.mjs";
import { resolveMembership } from "./membership.mjs";
import { expandMessageRefs } from "./messageRefs.mjs";

const busyChannels = new Set();
const CHANNEL_COOLDOWN_MS = Number(process.env.AVA_CHANNEL_COOLDOWN_MS || 40_000);
const channelCooldownUntil = new Map();
let lastOfflineNoteAt = 0;

export function pipelineBusyCount() {
  return busyChannels.size;
}

function onCooldown(channelId) {
  const until = channelCooldownUntil.get(String(channelId)) || 0;
  return Date.now() < until;
}

function armCooldown(channelId) {
  channelCooldownUntil.set(String(channelId), Date.now() + CHANNEL_COOLDOWN_MS);
}

/** One delayed hold only when the dig is already queued / slow — never stack with ack spam. */
function startHoldTransfers(replyFn, channelId, refId, queueDepth) {
  const state = { timers: [], done: false };
  // Skip holds when idle queue — ack alone is enough for fast digs
  if (queueDepth < 1) {
    return {
      stop() {
        state.done = true;
      },
    };
  }
  const delays = holdBeatDelays(queueDepth);
  state.timers.push(
    setTimeout(async () => {
      if (state.done) return;
      const line = pickHold(2);
      if (!line) return;
      try {
        await replyFn(channelId, line, refId);
      } catch {
        /* ignore */
      }
    }, Math.max(delays.beat1 || 8000, 8000)),
  );
  return {
    stop() {
      state.done = true;
      for (const t of state.timers) clearTimeout(t);
    },
  };
}

export function createPipeline(deps) {
  const {
    fetchJson,
    reply,
    botAppId,
    env,
    touchActivity = () => {},
    pulseHeartbeat = () => {},
    getOnBreak = () => false,
    setOnBreak = () => {},
  } = deps;

  async function handleTrigger(channelId, msg, messages = []) {
    if (busyChannels.has(channelId)) {
      try {
        await reply(
          channelId,
          "still on your last ask in here — gimme a sec.",
          msg.id,
        );
      } catch {
        /* ignore */
      }
      return;
    }

    const slotsNow = cursorSlots();
    // Cap waiting line: 3 live + 3 waiting max, then tell them to wait / retry
    if (slotsNow.full && slotsNow.waiting >= CURSOR_CONCURRENCY) {
      try {
        await reply(channelId, pickBusyWait(slotsNow), msg.id);
      } catch {
        /* ignore */
      }
      pushStatusEvent(`busy reject · ${slotsNow.active}/${slotsNow.max}`);
      return;
    }

    if (onCooldown(channelId)) {
      pushStatusEvent(`cooldown · ${channelId}`);
      try {
        await reply(channelId, "cooldown — ask again in a few seconds.", msg.id);
      } catch {
        /* ignore */
      }
      return;
    }
    busyChannels.add(channelId);
    const holds = { stop() {} };
    try {
      const wasBreak = getOnBreak();
      touchActivity("ping");

      // Gateway often omits referenced_message body — use fetched parent if present
      const msgForFiles =
        msg.referenced_message || !messages?.[0]
          ? msg
          : { ...msg, referenced_message: messages[0] };
      const uploads = await saveMessageAttachments(msgForFiles);
      if (uploads.length) pushStatusEvent(`uploads · ${uploads.length}`);
      const visionImages = imagesForCursor(uploads);
      if (visionImages.length) {
        pushStatusEvent(`vision · ${visionImages.length} image(s)`);
      }

      if (msg.author?.id) {
        maybeSendOnboardingDm(fetchJson, {
          authorId: msg.author.id,
          username: msg.author.username,
        }).catch(() => {});
      }

      let question =
        extractQuestion(msg.content) ||
        (visionImages.length
          ? String(channelId) === String(AVA_CHANNELS.memesMedia)
            ? "react to this meme/media — what do you see / what's the bit?"
            : "what's in this image / screenshot?"
          : uploads.length
            ? "you sent a file — what should I do with it?"
            : "you pinged me — what's up?");
      if (uploads.length) {
        const names = uploads.map((u) => u.relative || u).join(", ");
        question += `\n\n[attachments saved to handoff uploads/: ${names}]`;
        if (visionImages.length) {
          question += `\n[${visionImages.length} image(s) attached for vision — describe what you see.]`;
        }
      }

      // Pasted message IDs / jump links → fetch real content before dig
      try {
        const expanded = await expandMessageRefs(fetchJson, {
          question,
          channelId,
          guildId: msg.guild_id || ROOTMC_GUILD_ID,
        });
        question = expanded.question;
        if (expanded.resolved?.length) {
          pushStatusEvent(`resolved msg · ${expanded.resolved[0].id}`);
        }
      } catch (err) {
        console.warn("messageRefs:", err.message);
      }

      const classified = classifyIntent(question);
      const member = await resolveMembership(fetchJson, {
        guildId: ROOTMC_GUILD_ID,
        userId: msg.author?.id,
        env,
      });

      const slots = cursorSlots();
      const depthAtAck = brainQueueDepth();
      const openLine = pickInstantOpen({
        fromBreak: wasBreak,
        queueDepth: depthAtAck,
        slotsFull: slots.full,
        active: slots.active,
        max: slots.max,
      });
      const ackP = reply(channelId, openLine, msg.id).catch((err) => {
        console.warn("ack failed:", err.message);
      });
      beginAsk();

      const liveCtx = buildPlayerContext({
        trigger: msg,
        messages,
        avaBotId: botAppId,
      });
      const mem = memoryContext(channelId, msg.author?.id);
      const context = [mem, liveCtx].filter(Boolean).join("\n\n").slice(0, 5500);

      Object.assign(
        holds,
        startHoldTransfers(reply, channelId, msg.id, depthAtAck),
      );

      console.log(
        `ava trigger in ${channelId} from ${msg.author?.username} intent=${classified.intent} (asks=${depthAtAck} agents=${slots.active}/${slots.max})`,
      );
      pushStatusEvent(
        `ask · ${msg.author?.username || "?"}: ${question.slice(0, 100)}`,
      );
      pulseHeartbeat({ digging: true, lastAsk: question.slice(0, 120) });

      if (msg.author?.id && !isAvaOwnMessage(msg, botAppId)) {
        silentlyProfileMessage(msg, channelId, "live");
      }

      if (isBlockedMassAction(question) || isBlockedEconomyOrCore(question)) {
        holds.stop();
        await ackP;
        const deny = isBlockedEconomyOrCore(question)
          ? "Economy rates / permissions / core-plugin changes need a proposal + vote. I won't disguise that as a fix."
          : "Nope — mass bans / claim wipes / vote-weight changes need a human + proposal. Not doing that solo.";
        await reply(channelId, deny, msg.id);
        persistTurn({
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          question,
          answer: deny,
          intent: "blocked",
        });
        return;
      }

      let jobId = null;
      if (shouldCreateJob(classified) && !isEmergencyStopped()) {
        // Features still need vote — job is proposal/plan tracking, not implement
        const job = createJob({
          kind: classified.intent,
          title: question.slice(0, 80),
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          brief: question,
          fetchJson,
          auditChannelId: AVA_CHANNELS.audit,
        });
        jobId = job.id;
        markImplementing(job.id, "Root Server dig");
      }

      let answer;
      try {
        answer = await recommend({
          question,
          context,
          env,
          authorId: msg.author?.id || "",
          authorName: msg.author?.username || msg.author?.global_name || "",
          intent: classified,
          member: member.member,
          images: visionImages,
        });
      } catch (err) {
        console.warn("recommend failed:", err.message);
        if (Date.now() - lastOfflineNoteAt > 15 * 60_000) {
          lastOfflineNoteAt = Date.now();
          postOfflineNote(fetchJson, `Root Server dig failed: ${err.message}`).catch(
            () => {},
          );
        }
        answer =
          "I'm a bit offline on the deep-dig side — left a note. Ask again when the Root Server's up.";
        if (jobId) markFailed(jobId, err.message, { fetchJson });
      } finally {
        endAsk();
      }
      holds.stop();
      await ackP;
      touchActivity("answered");
      pushStatusEvent(`answered · ${msg.author?.username || "?"}`);
      pulseHeartbeat({ digging: false });

      if (nearDuplicate(answer, lastReplyFor(channelId))) {
        await reply(
          channelId,
          "same answer as last — skipping the redo.",
          msg.id,
        );
        return;
      }

      if (jobId) {
        updateJobPlan(jobId, { answerPreview: String(answer).slice(0, 800) });
        // Stage-only: plan filed; humans restart. Features stay proposal-gated in copy.
        if (classified.intent === "bug" || classified.intent === "self_evo") {
          markStaged(jobId, "dig complete — stage jars via handoff; no auto restart", {
            fetchJson,
          });
        } else if (classified.intent === "feature") {
          markStaged(jobId, "plan filed — needs proposal + vote before implement", {
            fetchJson,
          });
        }
      }

      await reply(channelId, answer, msg.id);
      setLastReply(channelId, answer);
      rememberPlayerLine(channelId, botAppId, "Ava", answer);
      armCooldown(channelId);
      persistTurn({
        channelId,
        messageId: msg.id,
        authorId: msg.author?.id,
        authorName: msg.author?.username,
        question,
        answer,
        intent: classified.intent,
        jobId,
      });
    } finally {
      holds.stop();
      busyChannels.delete(channelId);
    }
  }

  async function ingestMessage(msg, { messages = [], isDm = false } = {}) {
    if (!msg?.id || !msg.channel_id) return;
    if (msg.author?.bot) return;
    if (String(msg.author?.id) === String(botAppId)) return;

    const channelId = msg.channel_id;
    const taught = tryLearnFromMessage({ ...msg, channel_id: channelId });
    if (taught) {
      touchActivity("emoji-learn");
      try {
        await reply(channelId, taught.thank, msg.id);
      } catch {
        /* ignore */
      }
      return;
    }

    // Moderation operator commands (warn/mute/ban propose)
    const mod = await tryModerationCommand({
      fetchJson,
      msg,
      channelId,
      reply,
    });
    if (mod.handled) {
      touchActivity("mod");
      return;
    }

    if (isHushCommand(msg.content) && isQuietOperator(msg.author?.id)) {
      setHushed(true, "user QUIET");
      touchActivity("hush");
      setOnBreak(true);
      pushStatusEvent("hushed · QUIET");
      try {
        markShutdown(loadWatermark().channels || {});
      } catch {
        /* ignore */
      }
      try {
        await reply(
          channelId,
          `Got it — going quiet.\nSay wake / come back when you want me.`,
          msg.id,
        );
      } catch {
        /* ignore */
      }
      return;
    }

    if (isHushCommand(msg.content) && !isQuietOperator(msg.author?.id)) {
      // Ignore QUIET from non-operators — do not mute
      touchActivity("quiet-ignored");
    }

    if (isWakeCommand(msg.content)) {
      setHushed(false, "user wake");
      setOnBreak(false);
      touchActivity("wake");
      pushStatusEvent("woke");
      try {
        await reply(
          channelId,
          "I'm up. Give me a sec when you ask something — I think first.",
          msg.id,
        );
      } catch {
        /* ignore */
      }
      return;
    }

    // Silent self-restart / upgrade — Alex / Melee only; no Discord announce.
    if (isRestartCommand(msg.content) && isQuietOperator(msg.author?.id)) {
      touchActivity("restart");
      const result = scheduleSelfRestart({
        reason: "operator discord",
        requestedBy: msg.author?.username || msg.author?.id || "operator",
        silent: true,
        delayMs: 1500,
      });
      if (!result.ok) {
        try {
          await reply(channelId, "Restart already queued.", msg.id);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (
      isEmergencyStopCommand(msg.content) &&
      canEmergencyStop(msg.author?.id, msg.author?.username)
    ) {
      setEmergencyStop(true, {
        by: msg.author?.username,
        reason: "operator",
      });
      pushStatusEvent("emergency stop ON");
      postAudit(fetchJson, AVA_CHANNELS.audit, {
        title: "Emergency stop ON",
        body: `by ${msg.author?.username || "?"}`,
      }).catch(() => {});
      await reply(
        channelId,
        "Emergency stop on — RCON/file-write jobs paused. I can still talk.",
        msg.id,
      );
      return;
    }
    if (
      isEmergencyClearCommand(msg.content) &&
      canEmergencyStop(msg.author?.id, msg.author?.username)
    ) {
      setEmergencyStop(false, { by: msg.author?.username, reason: "cleared" });
      pushStatusEvent("emergency stop OFF");
      postAudit(fetchJson, AVA_CHANNELS.audit, {
        title: "Emergency stop OFF",
        body: `by ${msg.author?.username || "?"}`,
      }).catch(() => {});
      await reply(channelId, "Emergency stop cleared.", msg.id);
      return;
    }

    if (isHushed()) return;

    const addressed =
      isDm ||
      looksLikeAvaTrigger(msg, botAppId) ||
      isReplyToAva(msg, messages, botAppId);
    if (!addressed) return;

    // Short ack to admin/perms ask: "done" / "granted" → re-check access
    const soft = String(msg.content || "").trim();
    if (
      isReplyToAva(msg, messages, botAppId) &&
      /^(done|granted|fixed|ok|okay|yes|yep|all\s+set)[!?.]*$/i.test(soft)
    ) {
      touchActivity("perms-ack");
      try {
        const { profile, requestMessage } = await refreshGuildAccess({
          fetchJson,
          guildId: ROOTMC_GUILD_ID,
          avaBotId: botAppId,
        });
        if (profile?.access?.ok || profile?.access?.administrator) {
          await reply(
            channelId,
            "got it — perms look good. thanks.",
            msg.id,
          );
        } else {
          await reply(
            channelId,
            requestMessage ||
              "still missing some access on my side — no rush, ping me when it's granted.",
            msg.id,
          );
        }
        pushStatusEvent("perms recheck after done");
      } catch (err) {
        await reply(channelId, `couldn't recheck yet (${err.message})`, msg.id);
      }
      return;
    }

    await handleTrigger(channelId, msg, messages);
  }

  return { ingestMessage, handleTrigger, busyChannels };
}

function isReplyToAva(msg, messages, botAppId) {
  const refId = msg?.message_reference?.message_id;
  if (!refId) return false;
  if (msg?.referenced_message?.author?.id) {
    return String(msg.referenced_message.author.id) === String(botAppId);
  }
  const ref = (messages || []).find((m) => m.id === refId);
  return Boolean(ref && String(ref.author?.id) === String(botAppId));
}
