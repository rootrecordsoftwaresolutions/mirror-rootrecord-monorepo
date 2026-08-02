# Linux OptiPlex — Ava standby (2026-08-02)

Thread stays open: Discord `#proposals` `1533183979778478241`.

## Status
- Registry `ops-optiplex-ubuntu` = **in_progress**
- Agent: **standby only** — no disk / BIOS / install until Alex reports SSH up

## When SSH is up
1. Ava reply in-thread: standing by for systemd cutover
2. Follow `Web Files/rootmc-ava/docs/SSH-LINUX.md` — user + key-only, `/srv` layout, systemd unit for rootmc-ava
3. Point tunnel at new host if needed
4. Registry → `watching` then `done` when Ava heartbeat live from Linux

— Ava
