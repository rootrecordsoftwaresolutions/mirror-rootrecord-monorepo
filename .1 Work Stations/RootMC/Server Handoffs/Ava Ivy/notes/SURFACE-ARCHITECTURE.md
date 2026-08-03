# Ava surface architecture

**Discord (powered on + awake + Cursor key)** = autonomous Root Server digs. Mentions / replies / chimes run through gateway+poller → pipeline → Cursor agents (up to concurrency). No manual agent IDs needed.

**Discord (sleep / `AVA_FORCE_DREAM` / no Cursor key)** = dream state (cloud brain). Soft Slack pointer for heavy digs while dreaming.

**Slack** = staff dig home (Root Server on-device). Still preferred for long implement threads.

**Web** (rootmc.net / wiki) = communal organization + knowledge pages.

**Intentional offs** (unchanged):
- **QUIET / hush** — mute
- **Operator sleep** — dream summons only until ~10:00 HST
- **Power-down** — process off until human `npm start`
- **Cloud-dark** — silences Discord/Telegram only when dream is required (no Cursor); with Cursor up, Discord still answers

## Code
- `Web Files/rootmc-ava/src/recommend.mjs` — routes by power/sleep/forceDream + Cursor key
- `Web Files/rootmc-ava/src/surfaceRules.mjs` — Slack redirect only while asleep / no cursor
- `Web Files/rootmc-ava/src/dreamBrain.mjs` — sleep / fallback dream replies
- `Web Files/rootmc-ava/src/cursorBrain.mjs` — Root Server digs (Discord + Slack)
- `Web Files/rootmc-ava/src/opsPowerStatus.mjs` — EcoFlow / voting pack shortcut

## Status page
`Cursor digs 0/3 · idle` means free slots (not broken). Digging shows `1/3`…`3/3`.

## Test
Restart Ava. Ping Discord while live·hot → Root Server ask opens (`asks` / cursor digs bump). Sleep / QUIET still mute or dream-only.
