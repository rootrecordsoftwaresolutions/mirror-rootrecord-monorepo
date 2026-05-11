# Web-Development-2026

Private workspace for RootRecord web stacks: **Cloudflare Workers** (primary API, licence), **shared Worker libraries**, **Solana / Next.js** tools, and **HELE** reference docs.

## Layout

| Path | What it is |
|------|----------------|
| `cloudflare/rootrecord-primary` | Main Worker (`api.rootrecord.info`): auth, weather, earn, business routes, D1 migrations |
| `cloudflare/rootrecord-api-weather` | Per-app API shard (copy of primary; **no crons**). Future: dedicated hostname for Weather. See `cloudflare/API-SHARDS.md`. |
| `cloudflare/rootrecord-api-business` | Per-app API shard for Business Manager. |
| `cloudflare/rootrecord-api-account` | Per-app API shard for Account Hub. |
| `cloudflare/rootrecord-api-token` | Per-app API shard for Token Manager. |
| `cloudflare/rootrecord-api-kilauea` | Per-app API shard for Kīlauea Alerts. |
| `cloudflare/rootrecord-license` | Licence Worker (legacy / companion) |
| `cloudflare/shared` | Shared TS modules (password verify, billing, app associations, etc.) |
| `solana/` | Solana operational docs/reference notes (`README.md`, `HELE/`), not the app source. |
| `solana/HELE` | Token / ops notes (`README.md`; local `.env` is gitignored) |
| `main` | **rootrecord.info** Cloudflare Pages site (static HTML + `functions/`; `wrangler pages deploy`) |
| `apps/kilauea-alerts-web` | Kilauea Alerts web app (Vite + React) deployed as `rootrecord-kilauea-web` |

Worker source of truth for the primary API is **`cloudflare/rootrecord-primary`**.

**Web Analytics (per app):** `docs/CLOUDFLARE-WEB-ANALYTICS.md` — add each hostname in the dashboard, set `CF_WEB_ANALYTICS_TOKEN_*` in `credentials.env`, deploy scripts inject the beacon (marketing uses a temp copy so secrets are not written into tracked HTML).

## New machine checklist

1. **Clone** this repo and open the `Web` folder (or your clone root).
2. **Node.js** ≥ 18 and **npm**; for the Solana **site** use **pnpm** in `../solana-rootrecord-site`.
3. **Cloudflare:** [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — `npx wrangler login` once per machine.
4. **Secrets:** copy each project’s `.env.example` to `.env` / `.dev.vars` where documented; never commit real secrets. Worker deploy uses `wrangler secret put` for production secrets.
5. **Deploy credentials:** copy **`credentials.env.example`** → **`credentials.env`** at this repo’s root (or any parent folder of `cloudflare/rootrecord-primary`). Both Worker `deploy.ps1` scripts walk upward until they find `credentials.env`. The real file is gitignored.
6. **Local Worker dev:** in `cloudflare/rootrecord-primary`, copy **`.dev.vars.example`** → **`.dev.vars`** (gitignored).
7. **D1:** from `cloudflare/rootrecord-primary`, apply migrations (`wrangler d1 migrations apply …` — see that package’s `package.json` scripts).

### Install & run — primary Worker

```bash
cd cloudflare/rootrecord-primary
npm ci
npm run dev
```

### Install & run — licence Worker

```bash
cd cloudflare/rootrecord-license
npm ci
npm run dev
```

### Install & run — shared (library only)

```bash
cd cloudflare/shared
npm ci
```

### Solana Tools Next app

Use the monorepo root directory **`solana-rootrecord-site/`**, then `pnpm install` / `pnpm dev` there.

### Install & run — marketing site (Pages, `main/`)

```bash
cd main
npm ci
npm run pages:dev
```

Deploy (after `wrangler login`): `npm run pages:deploy` from **`main/`** (project name `rootrecord-website` per `package.json`).

## Remote

Default remote: **`origin`** → `RootRecord/Web-Development-2026` (private). Push updates with `git push origin main`.
