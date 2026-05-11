# Environment and Git — multi-device checklist

Use this when cloning **`Mobile-Development-2026`** on a new machine. Your copied **`.env`** files are per-app; match them to the sections below.

## Git (mobile)

- **Remote:** `https://github.com/RootRecord/Mobile-Development-2026.git` — branch `main`.
- From repo root: `pnpm install` (workspace).
- **Identity:** `git config user.name` / `user.email` (or `--global`) before committing.

## Cloudflare / Workers (sibling **Web** repo)

Worker source lives in **`Web-Development-2026`** (separate clone), not inside `Mobile/`.

- **Primary API:** `Web/cloudflare/rootrecord-primary` — `npm ci`, `npm run dev`, deploy via `deploy.ps1`.
- **Licence Worker:** `Web/cloudflare/rootrecord-license` — same pattern.
- **Deploy credentials file:** copy `Web/credentials.env.example` → **`credentials.env`** in either:
  - the **Web** repo root (same folder as `cloudflare/`), or
  - any **parent** folder of `cloudflare/rootrecord-primary` (e.g. your overall dev folder if you keep `Web` inside it).

Both `deploy.ps1` scripts **walk up directories** until they find `credentials.env`.

- **Wrangler login:** `npx wrangler login` once per machine (`cd` into the Worker folder first).
- **Local Worker dev:** `Web/cloudflare/rootrecord-primary/.dev.vars.example` → `.dev.vars` in that folder.

## Mobile app env files (copy your `.env` into these paths)

| Area | Path | Template |
|------|------|----------|
| Weather — CRA | `weather-manager-mobile/frontend/.env.local` | `frontend/.env.local.example` |
| Weather — production build | `weather-manager-mobile/frontend/.env.production` | `frontend/.env.production.example` |
| Weather — Python API | `weather-manager-mobile/backend/.env` | `backend/.env.example` |
| Business — CRA | `business-manager-app/frontend/.env.local` | `frontend/.env.example` |
| Business — Python API | `business-manager-app/backend/.env` | `backend/.env.example` |

Production **Android (Capacitor)** builds default **`https://api.rootrecord.info`**. Production **web (Pages)** defaults to the per-app shard on **`rootrecord-api-*.rootrecord.workers.dev`**. Set `REACT_APP_BACKEND_URL` (or Token’s `REACT_APP_RR_BACKEND_URL`, Kīlauea’s `VITE_ROOTRECORD_API_ORIGIN`) when you intentionally point at another host (e.g. a custom `api-*.rootrecord.info` domain).

## Android (not in Git)

Per app under `frontend/android/`: **`local.properties`**, release **keystore** + **`keystore/keystore.properties`** (Weather). Copy from your old machine if you ship signed builds.

## Release APK / AAB staging (binaries gitignored under `builds/`)

**Canonical output root (Mobile repo root):** `builds/` with subfolders **`token-manager`**, **`account-hub`**, **`business-manager`**, **`weather-manager`**. Automation: **`scripts/build-all-release-to-builds.ps1`**. See **`docs/RELEASE-BUILD-OUTPUTS.md`** for naming and workflow. (If your checkout lives at `Development/Mobile/`, the on-disk path is `Development/Mobile/builds/`.)

## Optional

- **`RootRecord/solana-rootrecord-site`** (clone separately) — `.env.example` for Next/Vercel and server keys for the Solana site.
- **`Web/solana/HELE/.env`** — local only; gitignored.
