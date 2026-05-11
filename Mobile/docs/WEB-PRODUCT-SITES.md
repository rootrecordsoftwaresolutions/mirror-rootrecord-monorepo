# Product web (Cloudflare Pages)

Most Android apps ship a **React (CRA) frontend** as the same SPA on the web: `pnpm run build` → `build/`. **Kīlauea Alerts (web)** is a small **Vite + React** app in `kilauea-alerts-web/` (also outputs `build/`) because the native Kīlauea app is Kotlin, not CRA. Each site has **its own Cloudflare Pages project** and **one subdomain** on `rootrecord.info`.

## Pages project names (fixed)

| App | Pages project name | Suggested custom domain |
|-----|----------------------|-------------------------|
| Weather Manager | `rootrecord-weather-web` | `weather.rootrecord.info` |
| Business Manager | `rootrecord-business-web` | `business.rootrecord.info` |
| Account Hub | `rootrecord-account-web` | `account.rootrecord.info` |
| Token Manager | `rootrecord-token-web` | `token.rootrecord.info` |
| Kīlauea Alerts (web) | `rootrecord-kilauea-web` | `kilauea.rootrecord.info` |

Domains are suggestions only; use whatever fits DNS and branding.

## One-time (per project)

1. **Cloudflare Dashboard** → Workers & Pages → **Create** → Pages → Create with **Direct Upload** or connect Git later — project slug must match the table (or run `npx wrangler pages project create <name>` from any machine with Wrangler logged in).
2. **Custom domains**: same project → **Custom domains** → add the hostname (e.g. `weather.rootrecord.info`). If you add the **DNS CNAME yourself** (instead of only the Pages UI), point `weather` → `rootrecord-weather-web.pages.dev` (etc.) with **DNS only / grey cloud** (`proxied: false`). **Do not orange-cloud proxy** a CNAME to `*.pages.dev` — that commonly yields **522** because the record is meant to resolve directly to Pages’ edge. If DNS is already grey-cloud but the site still **522**, check **Workers & Pages** → project → **Custom domains**: a row in **deactivated** state will not serve; remove the hostname and add it again, or run `Mobile/scripts/fix-business-pages-dns-only.ps1` (loads `credentials.env`, greys any proxied DNS on `business.rootrecord.info`, and re-adds the Pages hostname when deactivated).
3. **API**: **Pages / browser** builds call the per-app shard (`https://rootrecord-api-<app>.rootrecord.workers.dev` by default). **Capacitor (Android)** builds still use `https://api.rootrecord.info`. CORS on Workers allows `*` for many JSON routes today. If you add cookie-based auth later, tighten CORS to explicit `https://<product>.rootrecord.info` origins.

## Deploy (from Mobile repo root)

Uses the same `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_EMAIL` + `CLOUDFLARE_GLOBAL_API_KEY` as other tooling (loads `credentials.env` from ancestors of the script **and** `Web/credentials.env` next to the monorepo when present).

```powershell
pnpm install
pnpm run pages:deploy:weather
pnpm run pages:deploy:business
pnpm run pages:deploy:account
pnpm run pages:deploy:token
pnpm run pages:deploy:kilauea
```

Or from an app frontend folder: `pnpm run pages:deploy` (builds if `build/index.html` is missing). After a local build: `pnpm run pages:deploy:only`.

## Files

- `scripts/deploy-product-web-to-pages.ps1` — shared deploy.
- Each app `frontend/wrangler.toml` (and `kilauea-alerts-web/wrangler.toml`) — `pages_build_output_dir = "build"` (reference for Wrangler; deploy script passes `build` explicitly).

## Web Analytics

Per-hostname Cloudflare Web Analytics tokens and deploy-time injection are documented in **`Web/docs/CLOUDFLARE-WEB-ANALYTICS.md`** (env vars `CF_WEB_ANALYTICS_TOKEN_*`).

## Notes

- **Capacitor**: native-only code paths should stay behind `Capacitor.isNativePlatform()`; add web fallbacks where needed (clipboard, filesystem, etc.).
- **Marketing site** (`Web/main`, project `rootrecord-website`) is unchanged; product sites are separate Pages projects.
- **Kīlauea web** uses `GET …/api/dashboard` on the **Kīlauea API shard** (default `rootrecord-api-kilauea.rootrecord.workers.dev`) with **`X-Guest-Id`** (stable in `localStorage`). USGS HANS and other device-direct feeds remain in the **Android** app until you add Worker proxies or a richer web UI.
- **Solana tools** (separate Next repo / Vercel) is unrelated to these product Pages.
