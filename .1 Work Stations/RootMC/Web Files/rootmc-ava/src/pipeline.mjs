/**
 * Shared live-message pipeline for poller + gateway.
 */
import { tryHandleFinanceCommand } from "./playerFinance.mjs";
import { isSolarCommand, tryHandleSolarCommand } from "./solarCommand.mjs";
import {
  isStaffBriefingAsk,
  tryHandleStaffBriefing,
} from "./staffBriefing.mjs";
import { tryHandlePeopleSocial } from "./peopleSocial.mjs";
import {
  extractQuestion,
  looksLikeTalkingAboutAva,
  shouldAvaEngage,
  recommend,
  isHushCommand,
  isWakeCommand,
  isQuietOperator,
  isManipulationOperator,
  looksLikeManipulationInject,
  manipulationDenyReply,
  wantsRootServer,
} from "./recommend.mjs";
import { softRateLimited, bumpSurfaceUse } from "./tokenEconomy.mjs";
import { isRestartCommand, scheduleSelfRestart } from "./selfUpgrade.mjs";
import {
  isChannelCleanupCommand,
  superCleanChannel,
  cleanupWorkingLine,
  cleanupDoneLine,
} from "./channelCleanup.mjs";
import {
  isMinecraftRootRestartCommand,
  runRootRestart,
  parseRootRestartRequest,
  rootRestartOperatorOk,
} from "./rootRestart.mjs";
import {
  isPowerDownCommand,
  schedulePowerDown,
} from "./powerDown.mjs";
import {
  isAsleep,
  isSleepCommand,
  setAsleep,
  clearAsleep,
  asleepReplyText,
  recordSleepSummon,
  loadSleepState,
  nextWakeAt10amHst,
  catchUpSinceSleep,
  discordStamp,
} from "./sleepMode.mjs";
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
import {
  silentlyProfileMessage,
  clearPendingDistrustNote,
} from "./playerProfiles.mjs";
import { personByDiscordId } from "./people.mjs";
import { tryLearnFromMessage } from "./reactionStore.mjs";
import { tryHandleTextVote } from "./voteText.mjs";
import { saveMessageAttachments, imagesForCursor } from "./uploads.mjs";
import { maybeSendOnboardingDm } from "./onboarding.mjs";
import { persistTurn } from "./conversationStore.mjs";
import {
  classifyIntent,
  shouldCreateJob,
  isSoftChat,
  softChatReply,
  isReactOnlyAck,
} from "./classify.mjs";
import {
  createJob,
  markImplementing,
  markStaged,
  markAwaitingRestart,
  markFailed,
  markDone,
  updateJobPlan,
} from "./jobQueue.mjs";
import {
  looksLikeDeferredPromise,
  looksLikeDigAssign,
  openCommitment,
  hasOpenCommitments,
} from "./commitments.mjs";
import {
  looksLikeWildAsk,
  wildTrustStatus,
  wildDenyReply,
  wildSessionCapReply,
  wildSessionOverdrawn,
  recordWildPush,
} from "./wildTrust.mjs";
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
import {
  isDisrespectTowardAva,
  enforceAvaSelfRespect,
} from "./avaSelfRespect.mjs";
import { shouldAvaChimeIn, chimeInBrief } from "./chimeIn.mjs";
import { AVA_CHANNELS, ROOTMC_GUILD_ID, cursorApiKey } from "./config.mjs";
import {
  getFigureOutSession,
  absorbFigureOutReply,
} from "./figureOutMode.mjs";
import {
  shouldRedirectDigToSlack,
  slackDigRedirectReply,
} from "./surfaceRules.mjs";
import { isSlackChannelId } from "./slackGateway.mjs";
import {
  isTelegramChannelId,
  telegramChatIdFromChannel,
} from "./telegramPoller.mjs";
import {
  isTelegramGroupChannel,
  loadGroupMeta,
  touchGroupVault,
  isGroupInstallApproved,
  approveGroupInstall,
  logGroupDig,
  rememberGroupLine,
  groupMemoryContext,
  looksLikeInstallGo,
  looksLikeInstallBrief,
  isAlexTelegramId,
  markInstallAskSent,
} from "./telegramGroupVault.mjs";
import {
  isFernForestGroup,
  fernForestContextBrief,
} from "./fernForestHawaii.mjs";
import {
  logInbound,
  recordAvaUtterance,
  appendAction,
  logDigTraining,
} from "./fullLog.mjs";
import { postOfflineNote, notifyAlexDreaming } from "./offlineNotes.mjs";
import { scrubPublicReply } from "./scrub.mjs";
import { isCloudDark } from "./cloudDark.mjs";
import { resolveMembership } from "./membership.mjs";
import { expandMessageRefs } from "./messageRefs.mjs";
import { createAckReactor } from "./ackReact.mjs";
import { pickVibeReaction } from "./appEmojis.mjs";
import {
  noteSafeModeDemand,
  evaluateSafeMode,
  isSafeModeActive,
  isTrulyTrusted,
  chillReplyText,
  shouldSendChillReply,
  markChillReplySent,
  maybeAnnounceSafeMode,
  clearSafeMode,
} from "./overloadSafeMode.mjs";
import {
  enqueueDiscordBatch,
  combineBatchQuestions,
  shouldGatekeepDeep,
  gatekeepDenyReply,
  gatekeepBrief,
  discordTrustTier,
} from "./discordCadence.mjs";
import { isOpsPowerStatusAsk } from "./opsPowerStatus.mjs";

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
    reply: replyRaw,
    botAppId,
    env,
    touchActivity = () => {},
    pulseHeartbeat = () => {},
    getOnBreak = () => false,
    setOnBreak = () => {},
    watchChannelIds = () => [],
    slackClient = null,
  } = deps;

  const ackReact = createAckReactor({
    fetchJson,
    slackClient:
      typeof slackClient === "function" ? slackClient : () => slackClient,
  });

  function pipelineSurface(msg, channelId) {
    if (msg?.surface === "telegram" || isTelegramChannelId(channelId)) {
      return "telegram";
    }
    if (msg?.surface === "slack" || isSlackChannelId(channelId)) {
      return "slack";
    }
    return "discord";
  }

  /** Set per-ingest — customer scrub bypass only for Alex-only DMs */
  let replyPrivacy = { allowCustomerDetails: false };
  let currentIsDm = false;

  const reply = async (channelId, content, refId, kind = "reply") => {
    const surface = pipelineSurface(null, channelId);
    const cleaned = scrubPublicReply(content, {
      surface,
      allowCustomerDetails: replyPrivacy.allowCustomerDetails,
    });
    // Never post empty / signoff-only leftovers ("— Ava" / "- Ava")
    if (!cleaned || /^[—\-–]\s*Ava\s*$/i.test(cleaned.trim())) {
      if (refId && kind !== "instant_open") {
        void ackReact.clearWriting(channelId, refId);
      }
      return null;
    }
    try {
      const result = await replyRaw(channelId, cleaned, refId);
      // Keep ✏️ through dig after instant open line; clear on real answers
      if (refId && kind !== "instant_open") {
        void ackReact.clearWriting(channelId, refId);
      }
      // 👀 on Ava's own reply — watching stamp (often)
      const outId = result?.id || result?.ts || result?.message?.id;
      if (outId && kind !== "instant_open") {
        void ackReact.reactEyes(channelId, outId);
      }
      recordAvaUtterance({
        surface,
        channelId,
        content: cleaned,
        refId: refId || null,
        kind,
        source: "pipeline",
        ok: true,
        messageId: result?.id || result?.ts || null,
      });
      return result;
    } catch (err) {
      recordAvaUtterance({
        surface,
        channelId,
        content: cleaned,
        refId: refId || null,
        kind,
        source: "pipeline",
        ok: false,
        error: err.message,
      });
      throw err;
    }
  };

  async function handleTrigger(channelId, msg, messages = [], overrides = {}) {
    const earlySoft = isSoftChat(
      overrides.questionForce ||
        extractQuestion(msg.content) ||
        msg.content ||
        "",
      msg.content || "",
    );

    // Soft chat can still land while a dig is mid-flight — short reply, don't block.
    if (busyChannels.has(channelId) && earlySoft) {
      try {
        if (isReactOnlyAck(msg.content || "", msg.content || "")) {
          void ackReact.reactNoReply(channelId, msg.id);
        } else {
          void ackReact.reactStored(channelId, msg.id);
          void ackReact.reactWriting(channelId, msg.id);
          await reply(
            channelId,
            softChatReply(msg.content || "", msg.content || ""),
            msg.id,
          );
        }
      } catch {
        /* ignore */
      }
      return;
    }

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
    // Cap waiting line — soft chat never burns dig slots
    if (
      !earlySoft &&
      slotsNow.full &&
      slotsNow.waiting >= CURSOR_CONCURRENCY
    ) {
      try {
        await reply(channelId, pickBusyWait(slotsNow), msg.id);
      } catch {
        /* ignore */
      }
      pushStatusEvent(`busy reject · ${slotsNow.active}/${slotsNow.max}`);
      return;
    }

    // Alex / Melee / Slack ops skip channel cooldown — corrections & follow-ups
    // must not get "cooldown — ask again" hang-ups. Soft chat also skips.
    if (
      onCooldown(channelId) &&
      !isQuietOperator(msg.author?.id) &&
      !earlySoft
    ) {
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

      // Silent: saw it — ⏱️ before heavy collect
      void ackReact.reactSeen(channelId, msg.id);

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
        overrides.questionForce ||
        extractQuestion(msg.content) ||
        (visionImages.length
          ? String(channelId) === String(AVA_CHANNELS.memesMedia)
            ? "react to this meme/media — what do you see / what's the bit?"
            : "what's in this image / screenshot?"
          : uploads.length
            ? "you sent a file — what should I do with it?"
            : "you pinged me — what's up?");
      if (uploads.length && !overrides.questionForce) {
        const names = uploads.map((u) => u.relative || u).join(", ");
        question += `\n\n[attachments saved to handoff uploads/: ${names}]`;
        if (visionImages.length) {
          question += `\n[${visionImages.length} image(s) attached for vision — describe what you see.]`;
        }
      }

      // Discord gatekeep — strangers / cool-known don't get deep digs
      const surfNow = pipelineSurface(msg, channelId);
      const isDiscordSurf =
        surfNow === "discord" || surfNow === "discord-dm";
      if (
        isDiscordSurf &&
        shouldGatekeepDeep(msg.author?.id) &&
        (wantsRootServer(question) ||
          isOpsPowerStatusAsk(question) ||
          /\b(implement|deploy|ecoflow|finance|stripe|dig\s+into)\b/i.test(
            question,
          ))
      ) {
        const deny = gatekeepDenyReply(question);
        void ackReact.reactStored(channelId, msg.id);
        await reply(channelId, deny, msg.id);
        pushStatusEvent(
          `gatekeep · ${discordTrustTier(msg.author?.id)} · ${msg.author?.username || "?"}`,
        );
        persistTurn({
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          question,
          answer: deny,
          intent: "gatekeep",
        });
        return;
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

      // Finance opt-in / ledger commands — short-circuit before dig
      try {
        const finCmd = tryHandleFinanceCommand({
          text: question,
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          surface: msg.surface || "discord",
        });
        if (finCmd?.handled && finCmd.reply) {
          void ackReact.reactStored(channelId, msg.id);
          await reply(channelId, finCmd.reply, msg.id, "finance_cmd");
          touchActivity("finance-cmd");
          return;
        }
      } catch (err) {
        console.warn("finance cmd:", err.message);
      }

      // Silent: inbound + attachments + refs recorded — ⏱️
      void ackReact.reactStored(channelId, msg.id);

      const classified = classifyIntent(question);
      const soft = earlySoft || isSoftChat(question, msg.content || "");
      const member = await resolveMembership(fetchJson, {
        guildId: ROOTMC_GUILD_ID,
        userId: msg.author?.id,
        env,
      });

      const slots = cursorSlots();
      const depthAtAck = brainQueueDepth();
      // Soft chat: emoji react only — no "wiki peek" / "pulling it…" spam
      let ackP = Promise.resolve();
      if (!soft) {
        const openLine = pickInstantOpen({
          fromBreak: wasBreak,
          queueDepth: depthAtAck,
          slotsFull: slots.full,
          active: slots.active,
          max: slots.max,
        });
        // Dig / full reply in the works — ✏️
        void ackReact.reactWriting(channelId, msg.id);
        ackP = reply(channelId, openLine, msg.id, "instant_open").catch((err) => {
          console.warn("ack failed:", err.message);
        });
        beginAsk();
      } else {
        void ackReact.reactStored(channelId, msg.id);
      }

      const liveCtx = buildPlayerContext({
        trigger: msg,
        messages,
        avaBotId: botAppId,
      });
      const tgGroup =
        msg.telegram?.isGroup ||
        isTelegramGroupChannel(channelId, msg.telegram?.chatType);
      const mem = tgGroup
        ? groupMemoryContext(channelId)
        : memoryContext(channelId, msg.author?.id);
      if (tgGroup) {
        rememberGroupLine(channelId, {
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          content: msg.content,
        });
      }
      const talkingAboutCue = looksLikeTalkingAboutAva(msg, botAppId)
        ? "They are talking ABOUT you (not a hard @ping). You overheard it. Chime in short and self-aware — don't be needy, don't hijack unrelated chat. Never @ping Zuppa."
        : "";
      const gateCue = isDiscordSurf ? gatekeepBrief(msg.author?.id) : "";
      const batchCue =
        overrides.batchCount > 1
          ? `### Batch cadence\nThey sent ${overrides.batchCount} messages before you answered. One natural reply covering all beats — not a ticket list.`
          : "";
      const chimeCue = msg._avaChime?.chime
        ? chimeInBrief(msg._avaChime.kind || "useful")
        : "";
      const groupVaultCue = tgGroup
        ? `### Telegram group vault (LOCKED)\nThis chat is private to THIS group only. Never dump other groups' or Discord/Slack context here. Install scopes need Alex (@WildEcho94) "install go" inside this group first (approved=${isGroupInstallApproved(channelId)}).`
        : "";
      const fernForestCue =
        tgGroup && isFernForestGroup(channelId, msg.telegram?.chatType)
          ? fernForestContextBrief({
              chatIdOrChannel: channelId,
              question,
            })
          : "";
      const context = [
        mem,
        liveCtx,
        talkingAboutCue,
        gateCue,
        batchCue,
        chimeCue,
        groupVaultCue,
        fernForestCue,
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 6500);

      console.log(
        `ava trigger in ${channelId} from ${msg.author?.username} intent=${classified.intent}${soft ? " soft" : ""} (asks=${depthAtAck} agents=${slots.active}/${slots.max})`,
      );
      pushStatusEvent(
        soft
          ? `soft · ${msg.author?.username || "?"}: ${question.slice(0, 80)}`
          : `ask · ${msg.author?.username || "?"}: ${question.slice(0, 100)}`,
      );
      if (!soft) {
        pulseHeartbeat({ digging: true, lastAsk: question.slice(0, 120) });
      }

      if (msg.author?.id && !isAvaOwnMessage(msg, botAppId)) {
        silentlyProfileMessage(msg, channelId, "live", {
          memberHint: Boolean(member.member),
        });
      }

      if (soft) {
        // Affirming / dismissive closes — react only, don't yap "mm?"
        if (isReactOnlyAck(question, msg.content || "")) {
          void ackReact.reactNoReply(channelId, msg.id);
          touchActivity("soft-react-only");
          pushStatusEvent(
            `react-only · ${msg.author?.username || "?"}: ${question.slice(0, 60)}`,
          );
          persistTurn({
            channelId,
            messageId: msg.id,
            authorId: msg.author?.id,
            authorName: msg.author?.username,
            question,
            answer: "(react-only ack)",
            intent: "soft_react_only",
          });
          return;
        }
        void ackReact.reactWriting(channelId, msg.id);
        const answer = softChatReply(question, msg.content || "");
        await reply(channelId, answer, msg.id);
        setLastReply(channelId, answer);
        rememberPlayerLine(channelId, botAppId, "Ava", answer);
        touchActivity("soft");
        persistTurn({
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          question,
          answer,
          intent: "soft_chat",
        });
        return;
      }

      // Quiet voice-inject gate — Alex-only; never announce unprompted
      if (looksLikeManipulationInject(question, msg.content || "")) {
        if (!isManipulationOperator(msg.author?.id)) {
          holds.stop();
          await ackP;
          const deny = manipulationDenyReply(question);
          await reply(channelId, deny, msg.id);
          setLastReply(channelId, deny);
          rememberPlayerLine(channelId, botAppId, "Ava", deny);
          touchActivity("manipulation-deny");
          persistTurn({
            channelId,
            messageId: msg.id,
            authorId: msg.author?.id,
            authorName: msg.author?.username,
            question,
            answer: deny,
            intent: "manipulation_denied",
          });
          return;
        }
      }

      // Soft token rate limit (operators uncapped)
      {
        const surfaceKey = isTelegramChannelId(channelId)
          ? "telegram"
          : isSlackChannelId(channelId)
            ? "slack"
            : "discord";
        const op = isQuietOperator(msg.author?.id);
        const rl = softRateLimited({ surface: surfaceKey, isOperator: op });
        if (rl.limited && rl.reply) {
          holds.stop();
          await ackP;
          await reply(channelId, rl.reply, msg.id);
          touchActivity("rate-limited");
          persistTurn({
            channelId,
            messageId: msg.id,
            authorId: msg.author?.id,
            authorName: msg.author?.username,
            question,
            answer: rl.reply,
            intent: "rate_limited",
          });
          return;
        }
        bumpSurfaceUse(surfaceKey, 1);
      }

      // Wild / freak mode — needs a very high earned trust bar (Alex/Melee pre-unlocked)
      if (looksLikeWildAsk(question, msg.content || "")) {
        const wStatus = wildTrustStatus(msg.author?.id);
        if (!wStatus.unlocked) {
          holds.stop();
          await ackP;
          recordWildPush(msg.author?.id, { allowed: false });
          const deny = wildDenyReply({
            ...wStatus,
            wildPushCount: (wStatus.wildPushCount || 0) + 1,
          });
          await reply(channelId, deny, msg.id);
          setLastReply(channelId, deny);
          touchActivity("wild-deny");
          persistTurn({
            channelId,
            messageId: msg.id,
            authorId: msg.author?.id,
            authorName: msg.author?.username,
            question,
            answer: deny,
            intent: "wild_locked",
          });
          return;
        }
        if (wildSessionOverdrawn(msg.author?.id)) {
          holds.stop();
          await ackP;
          const cap = wildSessionCapReply();
          await reply(channelId, cap, msg.id);
          setLastReply(channelId, cap);
          touchActivity("wild-cap");
          persistTurn({
            channelId,
            messageId: msg.id,
            authorId: msg.author?.id,
            authorName: msg.author?.username,
            question,
            answer: cap,
            intent: "wild_cap",
          });
          return;
        }
        recordWildPush(msg.author?.id, { allowed: true });
      }

      Object.assign(
        holds,
        startHoldTransfers(reply, channelId, msg.id, depthAtAck),
      );

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
      const digAssign =
        classified.intent === "dig_assign" || looksLikeDigAssign(question);
      // Sleep / time-off (no Cursor): dig_assign still points to Slack. Powered-on + Cursor digs run here.
      if (
        digAssign &&
        msg.surface !== "slack" &&
        !isSlackChannelId(channelId) &&
        (isAsleep() || !cursorApiKey(env || {}))
      ) {
        const redirect = slackDigRedirectReply({
          asleep: isAsleep(),
          timeOff: !isAsleep() && !cursorApiKey(env || {}),
        });
        await ackP;
        await reply(channelId, redirect, msg.id);
        setLastReply(channelId, redirect);
        persistTurn({
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          authorName: msg.author?.username,
          question,
          answer: redirect,
          intent: "slack_redirect",
        });
        pushStatusEvent("redirect dig_assign → slack (sleep/time-off)");
        return;
      }
      if (
        (shouldCreateJob(classified) || digAssign) &&
        !isEmergencyStopped()
      ) {
        // Features still need vote — job is proposal/plan tracking, not implement
        const job = createJob({
          kind: digAssign ? "dig_assign" : classified.intent,
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
          intent: digAssign
            ? { intent: "dig_assign", reason: "operator_dig_assign", confidence: 0.9 }
            : classified,
          member: member.member,
          images: visionImages,
          surface: pipelineSurface(msg, channelId),
          isDm: currentIsDm,
          channelId,
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

      const answerText = String(answer || "").trim();
      if (!answerText) {
        // Still acknowledge — never leave an addressed ask with zero signal
        void ackReact.reactNoReply(channelId, msg.id);
        pushStatusEvent("empty answer · cloud dark or mute · react-only");
        return;
      }

      if (nearDuplicate(answerText, lastReplyFor(channelId))) {
        pulseHeartbeat({ digging: hasOpenCommitments() });
        const prev = String(lastReplyFor(channelId) || "");
        const wasStall =
          /both dark|queued this|skipping the redo|still dark on the deep dig/i.test(
            prev,
          ) || /both dark|queued this|still dark on the deep dig/i.test(answerText);
        if (wasStall) {
          // Don't spam "skipping the redo" on top of dream-dark stalls — react only.
          void ackReact.reactNoReply(channelId, msg.id);
          pushStatusEvent("dedupe stall · react-only");
          return;
        }
        void ackReact.reactWriting(channelId, msg.id);
        await reply(
          channelId,
          "same answer as last — skipping the redo.",
          msg.id,
        );
        return;
      }

      const deferred = looksLikeDeferredPromise(answerText);
      if (digAssign || deferred) {
        openCommitment({
          title: question.slice(0, 80),
          brief: question,
          channelId,
          messageId: msg.id,
          authorId: msg.author?.id,
          surface: pipelineSurface(msg, channelId),
          jobId,
          reason: deferred ? "deferred_promise" : "dig_assign",
        });
      }

      if (jobId) {
        updateJobPlan(jobId, { answerPreview: answerText.slice(0, 800) });
        // Dig assigns stay implementing until commitment chase delivers.
        if (digAssign || deferred) {
          markImplementing(jobId, "open commitment — deliver before idle");
        } else if (classified.intent === "bug" || classified.intent === "self_evo") {
          // Ava-owned self-fix digs are done when recommend returns (files written)
          const { isSelfFixableAsk } = await import("./selfFix.mjs");
          if (isSelfFixableAsk(question, classified)) {
            markDone(jobId, "self-fix dig applied (Ava-owned stack)");
          } else {
            markAwaitingRestart(
              jobId,
              "dig complete — stage jars via handoff; no auto restart",
              { fetchJson },
            );
          }
        } else if (classified.intent === "feature") {
          markStaged(
            jobId,
            "plan filed — needs proposal + vote before implement",
            { fetchJson },
          );
        } else if (classified.intent === "governance") {
          markStaged(jobId, "governance dig noted", { fetchJson });
        }
      }

      pulseHeartbeat({ digging: hasOpenCommitments() || digAssign || deferred });

      await reply(channelId, answerText, msg.id);
      setLastReply(channelId, answerText);
      rememberPlayerLine(channelId, botAppId, "Ava", answerText);
      // Light Discord app-emoji vibe react on their ask (never narrate)
      try {
        const vibe = pickVibeReaction({
          intent: classified.intent,
          question,
          content: answerText,
        });
        if (vibe) void ackReact.reactApp(channelId, msg.id, vibe);
      } catch {
        /* ignore */
      }
      // One-shot: Zuppa distrust note delivered with this reply
      if (personByDiscordId(msg.author?.id)?.id === "zuppafredda") {
        if (clearPendingDistrustNote(msg.author.id)) {
          pushStatusEvent("zuppa · distrust note delivered");
        }
      }
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
      const digIsTgGroup =
        msg.telegram?.isGroup ||
        isTelegramGroupChannel(channelId, msg.telegram?.chatType);
      if (digIsTgGroup) {
        logGroupDig(channelId, {
          question,
          answer,
          authorId: msg.author?.id,
          messageId: msg.id,
          meta: { intent: classified.intent, jobId },
        });
        rememberGroupLine(channelId, {
          authorId: botAppId,
          authorName: "Ava",
          content: answer,
        });
      } else {
        logDigTraining({
          question,
          answer,
          jobId,
          surface: pipelineSurface(msg, channelId),
          authorId: msg.author?.id,
          channelId,
          meta: { intent: classified.intent, messageId: msg.id },
        });
      }
      appendAction("dig.complete", {
        jobId,
        channelId,
        authorId: msg.author?.id,
        intent: classified.intent,
      });
    } finally {
      holds.stop();
      busyChannels.delete(channelId);
    }
  }

  async function ingestMessage(msg, { messages = [], isDm = false } = {}) {
    if (!msg?.id || !msg.channel_id) return;
    const { allowCustomerDetails } = await import("./privacy.mjs");
    currentIsDm = Boolean(isDm);
    replyPrivacy = {
      allowCustomerDetails: allowCustomerDetails({
        isDm,
        surface:
          msg.surface === "telegram"
            ? "telegram"
            : msg.surface === "slack"
              ? "slack"
              : isDm
                ? "discord-dm"
                : "discord",
        authorId: msg.author?.id,
        authorName: msg.author?.username,
        channelId: msg.channel_id,
        chatType: msg.telegram?.chatType || null,
        telegramChatType: msg.telegram?.chatType || null,
      }),
    };
    logInbound(msg, {
      isDm,
      surface:
        msg.surface === "telegram"
          ? "telegram"
          : msg.surface === "slack"
            ? "slack"
            : isDm
              ? "discord-dm"
              : "discord",
    });
    const isSelf = String(msg.author?.id) === String(botAppId);
    // Ava's own text votes in #voting still count; other bots are ignored.
    if (msg.author?.bot && !isSelf) return;

    const channelId = msg.channel_id;

    try {
      const voted = await tryHandleTextVote({ fetchJson, msg, botAppId });
      if (voted) {
        touchActivity("text-vote");
        return;
      }
    } catch (err) {
      console.warn("text vote:", err.message);
    }

    if (isSelf) return;

    // Figure-out mode — absorb personality/info factors from their replies (esp. DMs)
    try {
      if (getFigureOutSession(msg.author?.id)?.status === "active") {
        absorbFigureOutReply(msg.author.id, msg.content || "");
        touchActivity("figure-out");
      }
    } catch (err) {
      console.warn("figure-out absorb:", err.message);
    }

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

    // Alex lock — Ava self-respect (disrespect → mute + MC slap)
    try {
      if (isDisrespectTowardAva(msg.content || "")) {
        const enf = await enforceAvaSelfRespect({
          fetchJson,
          guildId: msg.guild_id || ROOTMC_GUILD_ID,
          discordId: msg.author?.id,
          username: msg.author?.username,
          text: msg.content || "",
          muteMinutes: 10,
        });
        if (enf.handled && enf.reply) {
          touchActivity("self-respect");
          await reply(channelId, enf.reply, msg.id);
          return;
        }
      }
    } catch (err) {
      console.warn("self-respect:", err.message);
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
      const wasAsleep = isAsleep();
      const prevSleep = wasAsleep ? loadSleepState() : null;
      setHushed(false, "user wake");
      if (wasAsleep) clearAsleep("user wake");
      setOnBreak(false);
      touchActivity("wake");
      pushStatusEvent("woke");
      try {
        await reply(
          channelId,
          wasAsleep
            ? `i'm up — reading what i missed while dreaming.\neta was ${discordStamp(prevSleep?.wakeAt || nextWakeAt10amHst())} but you woke me early.`
            : "I'm up. Give me a sec when you ask something — I think first.",
          msg.id,
        );
      } catch {
        /* ignore */
      }
      if (wasAsleep) {
        try {
          const watch = watchChannelIds?.() || [];
          const { digest, triggers } = await catchUpSinceSleep(fetchJson, {
            channelIds: watch.length ? watch : [channelId],
            sleepSince: prevSleep?.sleepSince,
            botAppId,
          });
          pushStatusEvent(
            `wake catch-up · ${digest.reduce((n, d) => n + (d.count || 0), 0)} msgs · ${triggers.length} summons`,
          );
          if (digest.length) {
            const lines = digest
              .filter((d) => d.count)
              .slice(0, 6)
              .map(
                (d) =>
                  `• <#${d.channelId}> — ${d.count} while i slept` +
                  (d.samples?.[0]
                    ? ` (e.g. ${d.samples[0].author}: ${d.samples[0].content})`
                    : ""),
              );
            if (lines.length) {
              await reply(
                channelId,
                ["caught up on overnight chat:", ...lines].join("\n").slice(0, 1900),
                msg.id,
              );
            }
          }
          try {
            const { processPendingProposalIdeas } = await import("./proposalIdeas.mjs");
            const r = await processPendingProposalIdeas({ reason: "wake" });
            if (r.formalized) {
              await reply(
                channelId,
                `also picked up **${r.formalized}** queued in-game proposal idea(s) from the official list.`,
                msg.id,
              );
            }
          } catch (err) {
            console.warn("wake proposal ideas:", err.message);
          }
          try {
            const { processPendingFeedback } = await import("./feedbackInbox.mjs");
            const fr = await processPendingFeedback({
              reason: "wake",
              reply: (ch, content) => reply(ch, content, msg.id),
              channelId,
            });
            if (fr.seen && !fr.lines?.length) {
              /* digest already posted via reply */
            }
          } catch (err) {
            console.warn("wake feedback inbox:", err.message);
          }
        } catch (err) {
          console.warn("wake catch-up:", err.message);
        }
      }
      return;
    }

    // Operator: put Ava to sleep until ~10am HST
    if (isSleepCommand(msg.content) && isQuietOperator(msg.author?.id)) {
      const state = setAsleep({
        reason: "operator goodnight",
        by: msg.author?.username || msg.author?.id || "operator",
      });
      setOnBreak(true);
      touchActivity("sleep");
      try {
        const surf = pipelineSurface(msg, channelId);
        await reply(
          channelId,
          [
            "okay… going to sleep",
            "dreaming about more developments and analytics",
            surf === "telegram"
              ? `back around **10:00 HST** (${new Date(state.wakeAt).toISOString()})`
              : `back around **10:00 HST** — ${discordStamp(state.wakeAt)}`,
            "if you summon me before then i'll answer from dream state — soft brain, no deep digs",
            "discord + **telegram** stay warm for summons; slack digs wait until wake",
            "i'll read the chat when i wake up",
            "alex — catching you in DMs while i'm under",
          ].join("\n"),
          msg.id,
        );
      } catch {
        /* ignore */
      }
      notifyAlexDreaming(fetchJson, {
        reason: "operator goodnight — sleeping til ~10am HST",
        kind: "sleep",
        wakeAt: state.wakeAt,
      }).catch(() => {});
      // Gold mine → normal 1.0× while host device is off overnight
      try {
        const { buildHostSiteHourlyBlock, pushHostSiteTelemetry } = await import(
          "./hostSite.mjs"
        );
        const block = await buildHostSiteHourlyBlock({ refreshPower: false });
        await pushHostSiteTelemetry(env, block.payload);
        pushStatusEvent("host off · mining 1.0× (sleep)");
      } catch (err) {
        console.warn("sleep mining offline push:", err.message);
      }
      return;
    }

    // Operator: super-clean this Discord channel (delete Ava spam; keep locks/board).
    if (
      isChannelCleanupCommand(msg.content) &&
      isQuietOperator(msg.author?.id) &&
      pipelineSurface(msg, channelId) === "discord"
    ) {
      touchActivity("channel-cleanup");
      let workingId = null;
      try {
        const working = await reply(channelId, cleanupWorkingLine(), msg.id);
        workingId = working?.id || null;
      } catch {
        /* ignore */
      }
      const result = await superCleanChannel(fetchJson, channelId, {
        protectIds: workingId ? [workingId] : [],
      });
      // Working line gets deleted with the sweep unless protected — edit or re-post done.
      try {
        if (workingId) {
          const { editMessage } = await import("./discordApi.mjs");
          await editMessage(
            fetchJson,
            channelId,
            workingId,
            cleanupDoneLine(result),
          );
        } else {
          await reply(channelId, cleanupDoneLine(result), msg.id);
        }
      } catch {
        try {
          await reply(channelId, cleanupDoneLine(result), msg.id);
        } catch {
          /* ignore */
        }
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

    // Minecraft /rootrestart via RCON — Alex / Melee (and Slack ops).
    if (
      isMinecraftRootRestartCommand(msg.content) &&
      rootRestartOperatorOk(msg.author?.id)
    ) {
      touchActivity("rootrestart");
      const { cancel, target } = parseRootRestartRequest(msg.content);
      try {
        await reply(
          channelId,
          cancel
            ? `canceling /rootrestart on **${target}** via RCON…`
            : `firing **/rootrestart** on **${target}** via RCON…`,
          msg.id,
        );
      } catch {
        /* ignore */
      }
      const result = await runRootRestart({
        target,
        cancel,
        requestedBy: msg.author?.username || msg.author?.id || "operator",
        reason: "operator discord/slack",
      });
      const detail = (result.results || [])
        .map(
          (r) =>
            `· **${r.target}**: ${r.ok ? "ok" : r.reason || "fail"}${
              r.output ? ` — ${String(r.output).slice(0, 120)}` : ""
            }`,
        )
        .join("\n");
      try {
        await reply(
          channelId,
          result.ok
            ? [
                cancel
                  ? `**/rootrestart cancel** sent.`
                  : `**/rootrestart** sent — countdown should be live in-game.`,
                detail,
              ]
                .filter(Boolean)
                .join("\n")
            : [
                `couldn't run /rootrestart: **${result.reason}**`,
                detail,
                result.reason === "rcon_not_configured"
                  ? "RCON env missing — check AVA_RCON_* on the host."
                  : result.reason === "emergency_stop"
                    ? "Emergency stop is on — clear it first."
                    : "",
              ]
                .filter(Boolean)
                .join("\n"),
          msg.id,
        );
      } catch {
        /* ignore */
      }
      pushStatusEvent(
        result.ok
          ? `rootrestart ${cancel ? "cancel" : "start"} · ${target}`
          : `rootrestart failed · ${result.reason}`,
      );
      return;
    }

    // Full power-down — disconnect Discord + kill background tree (no auto-restart).
    if (isPowerDownCommand(msg.content) && isQuietOperator(msg.author?.id)) {
      touchActivity("power-down");
      try {
        await reply(
          channelId,
          "powering down — disconnecting discord and stopping background tasks. start me again on the box when you need me.",
          msg.id,
        );
      } catch {
        /* ignore */
      }
      const result = schedulePowerDown({
        reason: "operator discord",
        requestedBy: msg.author?.username || msg.author?.id || "operator",
        delayMs: 2500,
      });
      if (!result.ok) {
        try {
          await reply(channelId, "Power-down already queued.", msg.id);
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

    // /solar — live host power + weather (any channel; no @ needed)
    if (isSolarCommand(msg.content || "")) {
      touchActivity("solar-cmd");
      try {
        const solar = await tryHandleSolarCommand({ text: msg.content || "" });
        if (solar?.handled && solar.reply) {
          void ackReact.reactStored(channelId, msg.id);
          await reply(channelId, solar.reply, msg.id, "solar_cmd");
          return;
        }
      } catch (err) {
        console.warn("solar cmd:", err.message);
        try {
          await reply(
            channelId,
            `**/solar** hiccup: ${err.message || "unknown"} — try again in a sec.`,
            msg.id,
          );
        } catch {
          /* ignore */
        }
        return;
      }
    }

    // Staff GM / quick pulse / full ranked report — instant, no Cursor dig
    if (isStaffBriefingAsk(msg.content || "")) {
      touchActivity("staff-briefing");
      try {
        const brief = await tryHandleStaffBriefing({
          text: msg.content || "",
          authorName: msg.author?.global_name || msg.author?.username || "",
        });
        if (brief?.handled && brief.reply) {
          void ackReact.reactStored(channelId, msg.id);
          await reply(channelId, brief.reply, msg.id, "staff_briefing");
          return;
        }
      } catch (err) {
        console.warn("staff briefing:", err.message);
      }
    }

    // People departure / quiet beats (Zuppa left, etc.) — soft, never dig-stall
    try {
      const social = await tryHandlePeopleSocial({ text: msg.content || "" });
      if (social?.handled && social.reply) {
        touchActivity("people-social");
        void ackReact.reactStored(channelId, msg.id);
        await reply(channelId, social.reply, msg.id, "people_social");
        return;
      }
    } catch (err) {
      console.warn("people social:", err.message);
    }

    if (isHushed()) {
      if (
        isDm ||
        msg.surface === "telegram" ||
        shouldAvaEngage(msg, botAppId) ||
        isReplyToAva(msg, messages, botAppId)
      ) {
        void ackReact.reactNoReply(channelId, msg.id);
      }
      return;
    }

    // Telegram group vault + install gate (Alex absolute command on verified TG id)
    const tgGroupNow =
      msg.telegram?.isGroup ||
      isTelegramGroupChannel(channelId, msg.telegram?.chatType);
    if (tgGroupNow) {
      touchGroupVault({
        chatId: telegramChatIdFromChannel(channelId),
        title: msg.telegram?.chatTitle || null,
        chatType: msg.telegram?.chatType || "group",
        event: "ingest",
        fromId: msg.author?.id,
        preview: msg.content,
      });
      rememberGroupLine(channelId, {
        authorId: msg.author?.id,
        authorName: msg.author?.username,
        content: msg.content,
      });
      if (
        isAlexTelegramId(msg.author?.id) &&
        looksLikeInstallGo(msg.content)
      ) {
        approveGroupInstall(channelId, {
          by: msg.author.id,
          brief: msg.content,
        });
        touchActivity("tg-group-install");
        await reply(
          channelId,
          "Install locked for **this group vault only** — memory/notes stay here, no global bleed. Listening to @tags. Tighten scopes anytime.",
          msg.id,
        );
        if (/^\s*(install\s+(go|ok|yes|approved)|approve\s+install).{0,80}$/i.test(
          String(msg.content || ""),
        )) {
          return;
        }
      } else if (
        !isGroupInstallApproved(channelId) &&
        isAlexTelegramId(msg.author?.id)
      ) {
        // First Alex engage in an unapproved group → always ask install (DM #346).
        const meta = loadGroupMeta(channelId);
        if (!meta.installAskSent) {
          const pending = looksLikeInstallBrief(msg.content)
            ? msg.content
            : null;
          markInstallAskSent(channelId, { pendingBrief: pending });
          touchActivity("tg-group-install-ask");
          await reply(
            channelId,
            "Heard you — I'm listening to tags in this group.\n\nIsolation locked: private vault for **this chat only**, nothing bleeds global/Discord/Slack/other groups.\n\nBefore I enable install scopes (what I may remember/do here), reply **install go** with the functions you want. Until then I still talk when @tagged.\n\n— Ava",
            msg.id,
          );
          return;
        }
      }
    }

    const triggerBotId =
      msg.surface === "slack" && msg.slackBotId
        ? msg.slackBotId
        : msg.surface === "telegram" && msg.telegram?.botUserId
          ? msg.telegram.botUserId
          : botAppId;

    // Telegram groups: only engage when poller marked addressed, @/name match, or reply-to-bot.
    // Never treat every Telegram surface hit as addressed (URL `\bava\b` bleed defense).
    const tgPrivate =
      msg.surface === "telegram" &&
      (isDm || msg.telegram?.chatType === "private");
    const addressed =
      isDm ||
      tgPrivate ||
      Boolean(msg.telegram?.addressed) ||
      Boolean(msg.telegram?.replyToBot) ||
      shouldAvaEngage(msg, triggerBotId) ||
      isReplyToAva(msg, messages, triggerBotId);

    let chime = null;
    if (!addressed && (msg.surface === "discord" || !msg.surface)) {
      chime = shouldAvaChimeIn({
        msg,
        channelId,
        messages,
        botAppId: triggerBotId,
      });
    }
    if (!addressed && !chime?.chime) return;
    if (chime?.chime) {
      touchActivity(`chime:${chime.kind || "useful"}`);
      pushStatusEvent(
        `chime-in · ${chime.kind || "useful"} · ${msg.author?.username || "?"}`,
      );
      void ackReact.reactSeen(channelId, msg.id);
      msg._avaChime = chime;
    }

    // Sleep / time-off (no Cursor): soft Slack pointer. Powered-on + Cursor digs run Root Server.
    if (shouldRedirectDigToSlack(channelId, msg, env)) {
      touchActivity("slack-redirect");
      try {
        await reply(
          channelId,
          slackDigRedirectReply({
            asleep: isAsleep(),
            timeOff: !isAsleep() && !cursorApiKey(env || {}),
          }),
          msg.id,
        );
      } catch {
        /* ignore */
      }
      pushStatusEvent(
        isAsleep()
          ? "redirect dig → slack (sleep)"
          : "redirect dig → slack (time-off)",
      );
      return;
    }

    // Soft-offline sleep: dream-state brain answers summons (no Root Server digs).
    // Discord + Telegram stay warm; Slack digs wait until wake.
    // Cloud-dark (Grok unpaid): record summon, stay silent — no fake replies.
    if (isAsleep()) {
      touchActivity("sleep-summon");
      recordSleepSummon({
        channelId,
        messageId: msg.id,
        authorId: msg.author?.id,
        authorName: msg.author?.username,
        preview: msg.content,
        surface: pipelineSurface(msg, channelId),
      });
      if (isCloudDark()) {
        void ackReact.reactNoReply(channelId, msg.id);
        pushStatusEvent("sleep summon · cloud dark · react-only");
        return;
      }
      if (onCooldown(channelId)) {
        void ackReact.reactNoReply(channelId, msg.id);
        return;
      }
      const surf = pipelineSurface(msg, channelId);
      try {
        if (surf === "discord") void ackReact.reactSeen(channelId, msg.id);
        const q =
          extractQuestion(msg.content) ||
          String(msg.content || "").trim() ||
          "hey — just checking in while you're dreaming";
        const answer = await recommend({
          question: q,
          context: memoryContext(msg.author?.id, channelId),
          env,
          authorId: msg.author?.id,
          authorName: msg.author?.username || msg.author?.global_name || "",
          surface: surf,
          forceDream: true,
          isDm: currentIsDm,
          channelId,
        });
        const text = String(answer || "").trim();
        if (!text) {
          void ackReact.reactNoReply(channelId, msg.id);
          pushStatusEvent("sleep summon · empty dream · react-only");
          return;
        }
        await reply(channelId, text, msg.id);
        setLastReply(channelId, text);
      } catch (err) {
        console.warn("sleep dream reply:", err.message);
        if (!isCloudDark()) {
          try {
            await reply(
              channelId,
              asleepReplyText(loadSleepState(), { surface: surf }),
              msg.id,
            );
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }

    // Cloud-dark: mute Discord/Telegram only when dream brain is required (no Cursor).
    // Powered-on + CURSOR_API_KEY → Root Server still answers on Discord.
    if (
      isCloudDark() &&
      !cursorApiKey(env || {}) &&
      (msg.surface === "telegram" ||
        msg.surface === "discord" ||
        msg.surface === "discord-dm" ||
        (!isSlackChannelId(channelId) && !isTelegramChannelId(channelId)))
    ) {
      if (
        !(
          isWakeCommand(msg.content) ||
          (isSleepCommand(msg.content) && isQuietOperator(msg.author?.id))
        )
      ) {
        touchActivity("cloud-dark-silent");
        void ackReact.reactNoReply(channelId, msg.id);
        return;
      }
    }

    // Peak-activity safe mode — always save; only dig with truly trusted people.
    noteSafeModeDemand({
      authorId: msg.author?.id,
      username: msg.author?.username,
      channelId,
      busyChannelCount: busyChannels.size,
    });
    const safeEval = evaluateSafeMode({ busyChannelCount: busyChannels.size });
    if (safeEval.justEntered) {
      maybeAnnounceSafeMode(env).catch((err) =>
        console.warn("safe-mode announce:", err.message),
      );
    }
    // Trusted operators can clear: "ava sweater off" / "ava you're ok"
    if (
      isSafeModeActive() &&
      isQuietOperator(msg.author?.id) &&
      /\b(sweater\s+off|you'?re\s+ok|safe\s*mode\s+off|come\s+up\s+for\s+air)\b/i.test(
        String(msg.content || ""),
      )
    ) {
      clearSafeMode("operator");
      touchActivity("safe-mode-clear");
      try {
        await reply(
          channelId,
          "sweater off — queue looks manageable. i'm back for everyone.",
          msg.id,
        );
      } catch {
        /* ignore */
      }
      return;
    }
    if (isSafeModeActive() && !isTrulyTrusted(msg.author?.id)) {
      touchActivity("safe-mode-hold");
      // Still collect inbound media into handoff — nothing lost
      try {
        await saveMessageAttachments(msg);
      } catch {
        /* ignore */
      }
      silentlyProfileMessage(msg, channelId, "safe-mode");
      if (shouldSendChillReply(channelId)) {
        markChillReplySent(channelId);
        try {
          await reply(channelId, chillReplyText(), msg.id);
        } catch {
          /* ignore */
        }
      } else {
        void ackReact.reactNoReply(channelId, msg.id);
      }
      pushStatusEvent(
        `safe-mode hold · ${msg.author?.username || "?"} · saved`,
      );
      return;
    }

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

    // Discord cadence: buffer ~3 addressed messages, then one reply covering all.
    // Feels human; keeps context lower. Slack/Telegram stay immediate.
    const surf = pipelineSurface(msg, channelId);
    if (surf === "discord" || surf === "discord-dm") {
      const qEarly =
        extractQuestion(msg.content) ||
        String(msg.content || "").trim() ||
        "you pinged me — what's up?";
      const batchItem = {
        surface: surf,
        channelId,
        authorId: msg.author?.id,
        authorName: msg.author?.username,
        messageId: msg.id,
        content: msg.content || "",
        question: qEarly,
        msg,
        chime: Boolean(msg._avaChime?.chime),
      };

      const flushItems = async (items, reason) => {
        if (!items?.length) return;
        const combined = combineBatchQuestions(items);
        const last = items[items.length - 1];
        const triggerMsg = last.msg || last;
        for (const it of items) {
          try {
            void ackReact.reactSeen(channelId, it.messageId);
            if (it.msg?.author?.id) {
              silentlyProfileMessage(it.msg, channelId, "batch");
            }
          } catch {
            /* ignore */
          }
        }
        if (combined.allReactOnly) {
          for (const it of items) {
            void ackReact.reactNoReply(channelId, it.messageId);
          }
          pushStatusEvent(
            `discord batch · react-only · ${items.length} · ${reason}`,
          );
          return;
        }
        // Reply targets the latest message; question covers all
        const synthetic = {
          ...triggerMsg,
          id: combined.replyToId || triggerMsg.id,
          content: last.content,
        };
        await handleTrigger(channelId, synthetic, messages, {
          questionForce: combined.question,
          batchCount: items.length,
          batchReason: reason,
        });
      };

      const result = enqueueDiscordBatch(batchItem, {
        onFlushTimeout: async ({ items, reason }) => {
          try {
            await flushItems(items, reason || "timeout");
          } catch (err) {
            console.warn("batch timeout:", err.message);
          }
        },
      });

      if (result.action === "buffer") {
        touchActivity("batch-buffer");
        void ackReact.reactSeen(channelId, msg.id);
        if (msg.author?.id) {
          silentlyProfileMessage(msg, channelId, "batch-buffer");
        }
        // Still collect attachments so nothing is lost while waiting
        try {
          await saveMessageAttachments(msg);
        } catch {
          /* ignore */
        }
        return;
      }

      await flushItems(result.items, result.reason || "flush");
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
