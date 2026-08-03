/**
 * Telegram long-poll transport — maps updates into Discord-shaped pipeline msgs.
 * Private chats: always engage.
 * Groups/supergroups: @bot /ava /start, name mention, entity mention, or reply-to-bot.
 * Privacy mode (can_read_all_group_messages=false): Telegram only delivers those
 * addressed updates — bare "Ava" without @username never arrives.
 */
import {
  telegramBotToken,
  telegramEnabled,
} from "./config.mjs";
import {
  telegramDeleteWebhook,
  telegramGetMe,
  telegramGetUpdates,
  telegramSendMessage,
  toTelegramChannelId,
  isTelegramChannelId,
  telegramChatIdFromChannel,
} from "./telegramApi.mjs";
import {
  looksLikeTalkingAboutAva,
  stripUrlsForNameMatch,
} from "./recommend.mjs";
import {
  touchGroupVault,
  isTelegramGroupChannel,
} from "./telegramGroupVault.mjs";

export { isTelegramChannelId, telegramChatIdFromChannel, toTelegramChannelId };

function entityMentionsBot(m, botUsername, botUserId) {
  const ents = [...(m.entities || []), ...(m.caption_entities || [])];
  const text = String(m.text || m.caption || "");
  for (const e of ents) {
    if (e.type === "mention" && botUsername) {
      const slice = text.slice(e.offset, e.offset + e.length).toLowerCase();
      if (slice === `@${botUsername.toLowerCase()}`) return true;
    }
    if (
      e.type === "text_mention" &&
      botUserId &&
      String(e.user?.id) === String(botUserId)
    ) {
      return true;
    }
    if (e.type === "bot_command" && botUsername) {
      const slice = text.slice(e.offset, e.offset + e.length).toLowerCase();
      if (slice.includes(`@${botUsername.toLowerCase()}`)) return true;
    }
  }
  return false;
}

function isReplyToBot(m, botUserId) {
  if (!botUserId || !m.reply_to_message?.from) return false;
  return String(m.reply_to_message.from.id) === String(botUserId);
}

function addressesAva(m, botUsername, botUserId) {
  const t = String(m.text || m.caption || "");
  if (/^\/start(@\w+)?\b/i.test(t)) return true;
  if (/^\/ava(@\w+)?\b/i.test(t)) return true;
  if (botUsername && t.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
    return true;
  }
  if (entityMentionsBot(m, botUsername, botUserId)) return true;
  if (isReplyToBot(m, botUserId)) return true;
  if (!t.trim()) return false;
  // Strip URLs first — \bava\b matches inside https://ava.rootmc.net (bleed bug).
  const forName = stripUrlsForNameMatch(t);
  return (
    looksLikeTalkingAboutAva(forName, null) || /\bava(\s+ivy)?\b/i.test(forName)
  );
}

/**
 * @param {{
 *   onMessage: (msg: object) => void | Promise<void>,
 *   onReady?: (info: object) => void,
 *   seenHas?: (key: string) => boolean,
 *   env?: object,
 * }} opts
 */
export function startTelegramPoller(opts = {}) {
  const env = opts.env || {};
  if (!telegramEnabled(env)) {
    return {
      stop() {},
      ready: false,
      botUserId: null,
      username: null,
      postMessage: async () => {
        throw new Error("telegram_disabled");
      },
    };
  }
  const token = telegramBotToken(env);
  if (!token) {
    console.warn("Ava Telegram: AVA_TELEGRAM_BOT_TOKEN missing");
    return {
      stop() {},
      ready: false,
      botUserId: null,
      username: null,
      postMessage: async () => {
        throw new Error("telegram_not_configured");
      },
    };
  }

  let offset = 0;
  let stopped = false;
  let botUserId = null;
  let username = null;
  let loopPromise = null;

  async function postMessage(channelId, text, refId = null) {
    const chatId = telegramChatIdFromChannel(channelId);
    const parts = String(text || "").match(/[\s\S]{1,4000}/g) || [""];
    let first = null;
    for (let i = 0; i < parts.length; i++) {
      const sent = await telegramSendMessage(chatId, parts[i], {
        replyToMessageId: i === 0 ? refId : null,
        env,
      });
      if (!first) first = sent;
    }
    return { id: String(first?.message_id || ""), ts: first?.message_id };
  }

  function registerGroup(chat, event, fromId = null, preview = null) {
    if (!chat || chat.type === "private") return;
    try {
      touchGroupVault({
        chatId: chat.id,
        title: chat.title || null,
        chatType: chat.type,
        event,
        fromId,
        preview,
      });
    } catch (err) {
      console.warn("telegram group vault:", err.message);
    }
  }

  async function handleMyChatMember(u) {
    const mm = u.my_chat_member;
    if (!mm?.chat) return;
    const chat = mm.chat;
    if (chat.type === "private") return;
    const status = mm.new_chat_member?.status;
    registerGroup(
      chat,
      `my_chat_member:${status || "unknown"}`,
      mm.from?.id,
      `status=${status}`,
    );
    console.log(
      `telegram group member · ${chat.title || chat.id} · ${status} · ${chat.id}`,
    );
  }

  async function handleUpdate(u) {
    if (u.my_chat_member) {
      await handleMyChatMember(u);
    }

    const m = u.message || u.edited_message;
    if (!m || !m.chat) return;

    // Join / add-bot service messages (often empty text)
    const newMembers = m.new_chat_members || [];
    if (
      botUserId &&
      newMembers.some((x) => String(x.id) === String(botUserId))
    ) {
      registerGroup(m.chat, "added_to_group", m.from?.id, "bot added");
      console.log(
        `telegram added to group · ${m.chat.title || m.chat.id} · ${m.chat.id}`,
      );
    }

    if (!m.from) return;
    if (m.from.is_bot) return;
    if (botUserId && String(m.from.id) === String(botUserId)) return;

    const chatId = m.chat.id;
    const isPrivate = m.chat.type === "private";
    const text = String(m.text || m.caption || "");

    if (!isPrivate) {
      registerGroup(m.chat, "group_update", m.from.id, text || "(no text)");
    }

    // Groups: only engage when addressed (privacy mode already limits delivery)
    if (!isPrivate && !addressesAva(m, username, botUserId)) {
      // Still keep empty service msgs from creating false engages
      return;
    }

    // Private empty text — ignore; groups may engage on reply-to-bot with media caption
    if (!text.trim() && isPrivate) return;
    if (!text.trim() && !isReplyToBot(m, botUserId) && !entityMentionsBot(m, username, botUserId)) {
      return;
    }

    const channelId = toTelegramChannelId(chatId);
    const msgId = String(m.message_id);
    const key = `tg:${chatId}:${msgId}`;
    if (opts.seenHas?.(key)) return;

    if (!isPrivate) {
      registerGroup(
        m.chat,
        "addressed",
        m.from.id,
        text || "(reply/mention)",
      );
    }

    const msg = {
      id: msgId,
      channel_id: channelId,
      content: text.replace(/^\/ava(@\w+)?\s*/i, "").trim() || text || "(ping)",
      author: {
        id: String(m.from.id),
        username:
          m.from.username ||
          [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") ||
          String(m.from.id),
        bot: false,
      },
      surface: "telegram",
      timestamp: (m.date || 0) * 1000,
      referenced_message: m.reply_to_message
        ? { id: String(m.reply_to_message.message_id) }
        : null,
      message_reference: m.reply_to_message
        ? { message_id: String(m.reply_to_message.message_id) }
        : null,
      telegram: {
        chatType: m.chat.type,
        chatTitle: m.chat.title || null,
        username,
        botUserId,
        isGroup: isTelegramGroupChannel(channelId, m.chat.type),
        replyToBot: isReplyToBot(m, botUserId),
        addressed: true,
      },
    };

    await opts.onMessage?.(msg);
  }

  async function loop() {
    try {
      await telegramDeleteWebhook(env);
      const me = await telegramGetMe(env);
      botUserId = String(me.id);
      username = me.username || null;
      if (me.can_read_all_group_messages === false) {
        console.log(
          "telegram · privacy mode ON · groups need @mention / reply / command",
        );
      }
      opts.onReady?.({
        botUserId,
        username,
        name: me.first_name,
        canReadAllGroupMessages: Boolean(me.can_read_all_group_messages),
      });
    } catch (err) {
      console.warn("Ava Telegram boot:", err.message);
      return;
    }

    while (!stopped) {
      try {
        const updates = await telegramGetUpdates({
          offset,
          timeout: 25,
          env,
        });
        for (const u of updates || []) {
          if (u.update_id >= offset) offset = u.update_id + 1;
          try {
            await handleUpdate(u);
          } catch (err) {
            console.warn("telegram update:", err.message);
          }
        }
      } catch (err) {
        if (stopped) break;
        console.warn("telegram poll:", err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  loopPromise = loop();

  return {
    stop() {
      stopped = true;
    },
    ready: true,
    get botUserId() {
      return botUserId;
    },
    get username() {
      return username;
    },
    postMessage,
    async waitBoot() {
      for (let i = 0; i < 40 && !botUserId && !stopped; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { botUserId, username };
    },
  };
}
