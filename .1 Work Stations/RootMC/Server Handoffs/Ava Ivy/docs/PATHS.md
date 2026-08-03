# Ava Ivy — Paths & shortcuts

## This handoff

Windows (**primary / Cursor source — E handoff**): `E:\.1 Work Stations\RootMC\Server Handoffs\Ava Ivy\`  
Windows (D twin until cutover wipe): `D:\.1 Work Stations\RootMC\Server Handoffs\Ava Ivy\`  
Linux mount (planned): `/mnt/e/.1 Work Stations/RootMC/Server Handoffs/Ava Ivy/`  
Optional bind: `/srv/rootmc/Server Handoffs/Ava Ivy/`  
Override anytime: `AVA_HANDOFF`.

**Storage lock:** Cursor opens **E:** Work Stations (RootMC + RootRecord + all projects). Caches/builders → **main SSD**.  
Handoff note: `notes/workspace-context/SESSION-HANDOFF-2026-08-02-E.md`  
See `notes/LINUX-E-SSD-LAYOUT.md` + `notes/workspace-context/MASTER-CONTEXT.md`.

## Runtime (code)

Windows (primary): `E:\.1 Work Stations\RootMC\Web Files\rootmc-ava\`  
Windows (D twin): `D:\.1 Work Stations\RootMC\Web Files\rootmc-ava\`  
Linux: `/mnt/e/.1 Work Stations/RootMC/Web Files/rootmc-ava/` (or `/srv/rootmc/…` bind)

- Shortcut: `runtime\rootmc-ava-CODE.lnk`
- Start poller: `runtime\start-ava.lnk`
- Status window: `runtime\open-ava-status-window.lnk` → http://127.0.0.1:8787/
- Also: `Server Handoffs\Ava Ivy - runtime (rootmc-ava).lnk`
- **SSH:** `scripts/start-ava.sh` · systemd `scripts/ava-ivy.service` · see `Web Files/rootmc-ava/docs/SSH-LINUX.md`

Legacy folder `Web Files/rootmc-sexi/` is a stub if still present — use `rootmc-ava`.

## Env

RootMC `.env`:

- `AVA_DISCORD_BOT_TOKEN` / `AVA_DISCORD_APPLICATION_ID` (legacy `SEXI_*` still accepted)
- `CURSOR_API_KEY` (Root Server)
- `AVA_HANDOFF` — optional; defaults to `Server Handoffs/Ava Ivy` under the workspace
- Headless: `AVA_HEADLESS=1` `AVA_NO_STATUS_WINDOW=1` `AVA_RICH_PRESENCE=0`

## Related RootMC surfaces

- Workspace root: `E:\.1 Work Stations\RootMC\` (D twin still present; Linux: `/mnt/e/.1 Work Stations/RootMC/` or `/srv/rootmc/`)
- Wiki (public): https://rootmc.net/wiki/
- Governance API: https://api.rootmc.net/api/governance/
- Plugin handoffs: `Server Handoffs\1. RootMC - Claims\`, `2. RootMC - Towny\`
- OptiPlex Ubuntu plan: `docs/ROOTATMUS_PRIME-Ubuntu-Server-SSH-Plan.md`
