# Master workspace context — Ava Ivy

**Generated:** 2026-08-01 (Hawaii)  
**Purpose:** Dump as much durable context as possible so Ava (and future Linux/host migrations) know what lives under Work Stations, where copies are, and what is still syncing.

## Absolute paths (same tree, drives)

| Role | Path |
|------|------|
| **Primary Cursor / handoff root (E:)** | `E:\.1 Work Stations\` — open RootMC here |
| **D twin (until cutover wipe)** | `D:\.1 Work Stations\` — keep in sync via robocopy |
| **Caches / builders / toolchains** | **Main SSD** (Linux home · npm · Gradle · Cursor) — not the only source |
| **Full D: disk backup** | `E:\windows backup\D\` |
| **C: profile keep backup** | `E:\windows backup\C\` |
| **This handoff (Ava Ivy)** | `...\RootMC\Server Handoffs\Ava Ivy\` on **both** D and E |
| **Linux mount (planned)** | `/mnt/e/.1 Work Stations/` → Cursor Remote-SSH; optional `/srv/rootmc` bind |

**Rule (locked 2026-08-02):** Prefer editing on **E:\.1 Work Stations**. D remains a twin until Windows wipe. Re-sync: `E:\windows backup\logs\sync-e-workstations-now.ps1`. Builds/caches go to SSD. See `notes/LINUX-E-SSD-LAYOUT.md` + `SESSION-HANDOFF-2026-08-02-E.md`.

## What is under `E:\.1 Work Stations` (and D mirror)

```
.1 Work Stations/
  .credentials/          # fallback secrets (.env) — NEVER commit
  Minecraft-Marketing/   # marketing assets / campaigns
  RootMC/                # entire RootMC product + ops workspace
```

### RootMC layout (high level)

| Folder | What it is |
|--------|------------|
| `.env` | Primary secrets (Cloudflare, Discord, Grok/xAI, JWT, Ava tokens) |
| `.cursor/rules/` | Agent rules (`rootmc-workspace.mdc`, Ava identity posts) |
| `Plugin Building/Minecraft/` | Live plugin source + `publishPlugins` |
| `Web Files/rootmc-ava/` | Ava runtime (Node) — Discord + Slack dig |
| `Web Files/rootmc-web/` | Cloudflare Pages → rootmc.net |
| `Web Files/rootmc-api/` | Worker deploy wrapper → api.rootmc.net |
| `Web Files/rootmc-realm-api/` | API source (bundled into rootmc-api) |
| `Web Files/shared/` | Shared Worker library copy |
| `Web Files/rootrecord-api-account/` | Local RootRecord account/D1 dependency (not RootMC API) |
| `Web Files/halted-development/` | Archived Gen2 / dead ends |
| `Mobile App Files/rootmc-android/` | Android app |
| `Server Handoffs/1. RootMC - Claims/` | **Claims** FileZilla live-sync |
| `Server Handoffs/2. RootMC - Towny/` | **Towny** FileZilla (active prep) |
| `Server Handoffs/3. RootMC - Test Server/` | Test staging |
| `Server Handoffs/Ava Ivy/` | **This folder** — Ava docs, state, media, lore |
| `Server Live Backups/` | Full world snapshots — huge; often excluded from fast sync |
| `Change Logs/` | Server + plugin changelogs |
| `docs/`, `scripts/`, `emergent-repo/`, `github-plugin-repos/`, `Marketing/`, `playit/` | Ops / docs / extras |

### Hard product rules (never forget)

- Player currency: **Gold (G)**, not dollars  
- Automated payouts: **treasury debit**, not wallet mint  
- API: `https://api.rootmc.net` — not RootRecord shards  
- No Discord/Slack posts as Ava via Cursor Slack MCP (posts as Alex) — use `AVA_*_BOT_TOKEN` via `rootmc-ava`  
- No builds/deploys/commits unless Alex asks  

### Public URLs

| Service | URL |
|---------|-----|
| Game | play.rootmc.net |
| API | https://api.rootmc.net |
| Site | https://rootmc.net |
| Map | https://map.rootmc.net |

## Ava Ivy — what lives here

| Path | Purpose |
|------|---------|
| `rootmc-lead-dev-bot-notes.md` | Locked lead-dev bible (packed into every dig) |
| `appearance/` | Official art; blue eyes public, amber desk = private late-night lore |
| `docs/` | Persona, people, PATHS, Ubuntu SSH plan, incidents |
| `notes/` | Private lore + Alex life-story DB + this workspace context |
| `notes/alex/life-story/` | Private Alex dossier (loader: `alexLifeStory.mjs`) |
| `notes/lore-root-server-late-night-2026-08-01.md` | Canon late-night Root Server scene |
| `data/` | Runtime state (seen, watermarks, EcoFlow, RSS, reactions) — do not hand-edit lightly |
| `data/rss-feeds.json` | Minecraft Releasebot feed → `#updates` |
| `media/` | GIF/video indexes for Discord posts |
| `uploads/` | Drop zone for media Ava should see |
| `dream-pack/` | Portable bundle of specs for other hosts |
| `runtime/` | Shortcuts to code + start Ava |
| `plans/` | Independence roadmap, build plan, job notes |

### Identity (do not confuse)

| Who | IDs |
|-----|-----|
| Ava Discord app | `1532751879875072070` |
| Ava Slack bot | `U0BMBNYPYA2` (`ava_ivy`) — app `A0BMAC7NZD3` |
| Alex Slack | `U0BLWBTGYTU` — never post Ava voice as him |

### Run Ava

```bat
cd "D:\.1 Work Stations\RootMC\Web Files\rootmc-ava"
npm start
```

Status: http://127.0.0.1:8787/

On E mirror after Linux cutover: same relative paths under `/srv/rootmc/` or `E:\.1 Work Stations\RootMC\`.

## Copy / backup status (migration)

**Do NOT wipe Windows until `E:\MIGRATION-READY.txt` exists.**

While copying: `E:\MIGRATION-IN-PROGRESS.txt`  
Orchestrator: `E:\windows backup\logs\ensure-migration-ready.ps1`  
Live status: `E:\windows backup\logs\migration-STATUS.txt`

### Canonical payload on E:

| Path | Contents |
|------|----------|
| `E:\windows backup\C\` | Windows user keep (Desktop, Downloads, AppData, Android, …) |
| `E:\windows backup\D\` | **Full D:** Work Stations, Backup, old, SteamLibrary, Live Backups |
| `E:\.1 Work Stations\` | Hot mirror of Work Stations (also under backup\D) |
| `E:\Backup\` `E:\old\` `E:\SteamLibrary\` | D: tops mirrored to E: root |

### Scripts still used

- Full D: `copy-d-drive.ps1` / ensure catch-up inside migration orchestrator  
- C keep: `priority-keep.ps1` + orchestrator Local keepers in parallel  
- Work Stations sync: `sync-e-workstations.ps1`  
- Junctions `.database` / `.mysql-config` skipped by `/XJ` — see `E:\windows backup\D\JUNCTIONS.txt`

### Machine note

Prep for **Linux server upgrade** (OptiPlex / ROOTATMUS). Windows stays usable (copy, not move). Prefer restoring Work Stations + `.env` first on Linux.

## Machine / people context Ava should know

- **Alex (Alexrs94):** RootMC owner; life-story DB under `notes/alex/life-story/`; soft spots + deal lore in late-night canon; 5 years single (private).  
- **Root Server:** deep Cursor/agent work — never name other AI products in public Discord.  
- **Claims vs Towny:** two Shockbyte handoffs; Claims is live-synced; Towny is active prep.  
- **Gen2 retired** → live Claims; do not revive `gen2-27` / archived g2 Worker as production.  
- **EcoFlow / solar:** Ava watches host power under `data/ecoflow/`.  
- **RSS:** Minecraft Releasebot — needs Ava process restart after feed config changes.

## Inventory files in this folder

| File | Contents |
|------|----------|
| `inventory-D-workstations.json` | Folder tree + sizes under D Work Stations |
| `inventory-E-workstations.json` | Same for E mirror |
| `rootmc-top-compare.json` | Top-level RootMC D vs E |
| `folder-maps.json` | Web Files / Mobile / Plugins / Handoffs / Marketing names |
| `backup-snapshot.json` | Drive free space + feature flags at pack time |
| `windows-backup-README.txt` | Backup keep/skip policy |
| `MIGRATION-CHECKLIST.md` | What to verify after sync |
| `SESSION-HANDOFF-2026-08-01.md` | Session dump of recent Ava/lore/backup work |

## What was intentionally not fully mirrored

- `Server Live Backups/` worlds (size) — still on D; full D backup may include depending on robocopy job  
- `node_modules` / Gradle build caches — reinstall with npm/gradle  
- Steam libraries / OS images — reinstall on Linux  
- Live locked AppData cookies while Cursor/Discord running  

## Ava portfolio / wishlist goals

See `notes/AVA-GOALS.md` — financial advisor lane, pie-slice routing, **Samsung 990 PRO** (~$1k), stretch **RTX 5090 Laptop** (highest 50-series mobile). Discord proposal thread linked there.

## For Ava digs

When Alex talks about “Work Stations”, “E drive”, “handoff”, “Linux move”, or “backup”:

1. Point at **this pack** and PATHS.md  
2. Prefer D for live edits until he says E/Linux is primary  
3. Never leak life-story or late-night amber-eyes private lore into public channels  
4. Confirm copies finished via `*-FINISHED.txt` under `E:\windows backup\logs\` before claiming “everything is copied”
