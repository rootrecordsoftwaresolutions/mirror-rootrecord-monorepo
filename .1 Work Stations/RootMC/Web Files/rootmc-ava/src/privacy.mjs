/**
 * Customer / subscriber privacy — detailed PII only in Alex-only DMs.
 */
import { personByAuthorId, personByDiscordId, personByTelegramId } from "./people.mjs";
import { isTelegramChannelId } from "./telegramPoller.mjs";

export function isAlexIdentity(authorId, authorName) {
  const p =
    personByAuthorId(authorId, authorName) ||
    personByDiscordId(authorId) ||
    personByTelegramId(authorId);
  return Boolean(p?.id === "alexrs94" || p?.roles?.includes("owner"));
}

/**
 * True only for private 1:1 with Alex (Discord DM or Telegram private).
 * Never guild channels, Slack rooms, group chats, or other people's DMs.
 */
export function isAlexOnlyPrivateDm({
  isDm = false,
  surface = "",
  authorId = "",
  authorName = "",
  channelId = "",
} = {}) {
  if (!isAlexIdentity(authorId, authorName)) return false;
  const surf = String(surface || "").toLowerCase();
  if (surf === "telegram" || isTelegramChannelId(channelId)) {
    // Operator Telegram is always private with Ava bot
    return true;
  }
  if (surf === "discord-dm" || (surf === "discord" && isDm)) {
    return Boolean(isDm);
  }
  // Slack / public Discord / groups — never
  return false;
}

/** May include Stripe customer names, emails, payment identities, etc. */
export function allowCustomerDetails(opts = {}) {
  return isAlexOnlyPrivateDm(opts);
}

export const CUSTOMER_PRIVACY_BRIEF = `### Customer privacy (LOCKED)
- **Never** mention customer details in any public channel (Discord guild, Slack rooms, group chats, in-game public).
- No names, emails, addresses, phone numbers, Stripe customer ids, last4, invoices tied to a person, or "who bought Pro" lists — except aggregates ("we had N Pro checkouts").
- **Only** in **Alex-only DMs** (his Discord DM with you, or his private Telegram with you) may you reveal detailed customer / subscriber / payer info when he asks.
- Melee and other staff do **not** get customer dumps in public or shared channels. Redirect: "I'll take that to Alex's DMs."
- Player opt-in finance ledgers stay with that player only — never cross-share.`;
