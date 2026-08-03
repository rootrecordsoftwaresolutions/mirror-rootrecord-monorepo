# Lessons — 2026-08-02 greenlights + post-ops

Durable Ava memory from Absolute Ops / greenlights digs. Absorb into reasoning; do not regress.

## Governance / PROPs
- **Silent close:** when Alex says finished PROPs weren’t closed / “just close it” / “don’t make a message” → Discord API `archived: true` + `locked: true` only. **Zero posts.**
- **Close-PROP standing:** finished (passed / rejected / operator-done) → final status *unless* silent mode → then archive.
- **vote_yes / vote_no / ➖:** app emoji seeds on PROP/vote open (`seedVoteReactions.mjs` + Worker `VOTE_START_REACTIONS`).
- **Majority wins** on feature polls; wiki constitution **`2026-08-01`**.

## Worker / hourly
- Pending proposals in hourly snapshots = **Governance** block in `rootmc-live-economy-status.ts` (guild active threads under `#proposals`). Worker-forever. Job `job-ms9s7pa0` is **done** once shipped.

## In-game
- Quiet **~3 min** assist: `ingameChatAssist.mjs` — bridge scan `#ingame-chat`, private RCON `tell`, silence if nothing useful. Training → `data/training/ingame-chat.jsonl` + `data/players/mc/`.

## GitHub
- End of dig phases that change files: `scripts/ava-github-push.mjs` — Ava-owned paths only; never `.env` / cloud secrets; never force-push main.

## Automate-future
- Prefer scripts/poller/jobs over one-off Cursor sessions for repeat patterns.
- When Cursor ships an improvement for Ava → lesson note + local-lessons + persona if behavior changes.

## Still human / parked
- OptiPlex Ubuntu install (Alex); FileZilla/Shockbyte restart; Official kick; boats; Core-Node; ~$100 spend; prod spatial emit; X keys in `.env` before live tweets.

— Ava
