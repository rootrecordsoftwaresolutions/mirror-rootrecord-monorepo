# Telegram groups — isolation design (Alex, 2026-08-03)

Operator DM (`@WildEcho94` / `6644482344`) — msg 346:

> added Ava to a group; fully design groups; sensitive; save all information privately and security under their own group; it does not go global; function and talk in group; first ask Alex inside the group to perform correct install functions.

## Locked rules

1. **Per-group vault** — memory, notes, security context stay under that group only (`data/telegram/groups/<chatId>/`).
2. **No global bleed** — group digs go to the vault `digs.jsonl`, not global `training/digs.jsonl`. No other-group context in prompts.
3. **In-group presence** — Ava talks when addressed: `@ava_ivy_bot`, `/ava`, entity mention, reply-to-bot, or name match when Telegram delivers the update.
4. **Install gate** — before enabling group-specific install scopes, Ava asks Alex **inside that group**; Alex replies **`install go`**.
5. **Alex absolute command** — verified Telegram id `6644482344` still has operator authority in groups.

## Enabled (2026-08-03 deploy)

- Poller: reply-to-bot + mention entities; `my_chat_member` join logging; empty-text join registration.
- `telegramApi` `allowed_updates`: `message`, `edited_message`, `my_chat_member`.
- Privacy mode ON (`can_read_all_group_messages=false`) — Telegram only delivers @mentions / commands / replies-to-bot. Bare “Ava” without `@ava_ivy_bot` never arrives.
- `privacy.mjs`: Telegram **groups** are not treated as Alex-only DMs (no billing PII in groups).
- Pipeline: group vault memory context; install ask / `install go` gate.

## Traffic read (this pass)

- All inbound Telegram to date is **DM only** `tg:6644482344` (37 unique msgs). Latest group-design DM = msg **346**; solar countdown DM = msg **363**.
- `getUpdates` pending = **0**. No `tg:-…` group chat id in inbound/logs/seen yet.
- Join event for the add-to-group was missed earlier (empty service message + no `my_chat_member` in allowed_updates). Fixed going forward.

## Operator note

To land a group id + reply in-thread: `@ava_ivy_bot` (or reply to Ava) inside the group once. Privacy mode requires the username tag.

— Ava
