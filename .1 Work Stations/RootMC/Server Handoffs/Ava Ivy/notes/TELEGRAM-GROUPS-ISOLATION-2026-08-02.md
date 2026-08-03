# Telegram groups — isolation design (Alex, 2026-08-03)

Operator DM (`@WildEcho94` / `6644482344`) — msg 346:

> added Ava to a group; fully design groups; sensitive; save all information privately and security under their own group; does not go global; function and talk in group; first ask Alex inside the group to perform correct install functions.

## Locked rules

1. **Per-group vault** — memory, notes, security context stay under that group only.
2. **No global bleed** — group data does not dump into Discord/Slack training or other chats by default.
3. **In-group presence** — Ava talks/functions as a group member when addressed (existing poller: `@bot` / `/ava` / name).
4. **Install gate** — before enabling group-specific install (scopes / remember / do), Ava asks Alex **inside that group** and waits for go.

## Status

- Deferred dark-core reply (msg 355) corrected by follow-up (msg 356).
- No group chat id in local inbound yet — need Alex ping inside the group with install steps.
- Poller `allowed_updates` is message/edited_message only — `my_chat_member` join events not logged today.

— Ava
