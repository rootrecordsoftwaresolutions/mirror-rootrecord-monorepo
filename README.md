# RootRecord MonoRepo

Single git repo housing every Root Record property: Android (Capacitor) wrappers, Cloudflare Pages web apps, Cloudflare Workers (APIs + utilities), the marketing site, the public Solana tools site, and a few small bots/docs sub-repos.

- Primary branch: `main`
- Repo root: `C:\Users\rrdeveloper\MonoRepo` (Windows dev path)
- Package managers: `pnpm` for Mobile and product web apps, `npm` for Workers, `npm`+`serve` for the marketing site preview.

## Top-level layout

```
MonoRepo/
├── Mobile/                  Android (Capacitor) wrappers + native Kotlin (kilauea)
├── Web/
│   ├── apps/                Product web apps (Cloudflare Pages)
│   ├── cloudflare/          Cloudflare Workers (APIs, license, solana-tx, etc.)
│   ├── main/                Marketing site (rootrecord-website, Pages + Functions)
│   └── scripts/             Shared deploy scripts (Pages helpers, analytics injection)
├── solana-rootrecord-site/  Public Next.js site at solana.rootrecord.info
├── Bots/                    solana-swing-bot / solana-arb-bot
├── Doc-Repo/                Long-form internal docs
├── ebooks/                  Static ebook assets
├── commit-all.bat           Stage + commit + push (user runs)
├── cloudflare-update-all.bat        Workers + Pages deploy wrapper (user runs)
├── cloudflare-update-workers.bat    Workers only (user runs)
└── cloudflare-update-pages.bat      Pages only (user runs)
```

## Web vs Mobile — important rule

**Web app source is in `Web/apps/<name>-web/`, never in `Mobile/`.**
`Mobile/<app>/` holds only the Android (Capacitor) wrapper: `android/`, `capacitor.config.json` (with `webDir` pointing at `../../Web/apps/<name>-web/build`), and Android build scripts. The web build always runs in `Web/apps/<name>-web/`; `cap sync` pulls that `build/` into the Android project.

## Products and where their code lives

| Product | Web (Pages) | Android (Capacitor / native) | Backend (Worker) |
|---|---|---|---|
| Weather Manager | `Web/apps/weather-manager-web/` → `rootrecord-weather-web` | `Mobile/weather-manager-mobile/` | `Web/cloudflare/rootrecord-api-weather/` |
| Business Manager | `Web/apps/business-manager-web/` → `rootrecord-business-web` | `Mobile/business-manager-app/` | `Web/cloudflare/rootrecord-api-business/` |
| Account Hub | `Web/apps/account-hub-web/` → `rootrecord-account-web` | `Mobile/account-hub-app/` | `Web/cloudflare/rootrecord-api-account/` |
| Token Manager | `Web/apps/token-manager-web/` → `rootrecord-token-web` | `Mobile/token-manager-app/` | `Web/cloudflare/rootrecord-api-token/` |
| Kīlauea Alerts | `Web/apps/kilauea-alerts-web/` → `rootrecord-kilauea-web` (Vite) | `Mobile/kilauea-alerts-android/` (native Kotlin) | `Web/cloudflare/rootrecord-api-kilauea/` |
| Marketing site | `Web/main/` → `rootrecord-website` | — | (Pages Functions in `Web/main/functions/`) |
| Solana tools | `solana-rootrecord-site/` → `solana.rootrecord.info` | — | — |

Other Workers in `Web/cloudflare/`: `rootrecord-license`, `rootrecord-solana-tx`, `rootrecord-app-build`, `rr-weather-manager-api`, `shared/` (importable code, e.g. `password-verify.ts`). `rootrecord-primary` is **legacy** and being phased out — do not deploy.

## Common tasks

### Commit + push
```
commit-all.bat
```
Stages all changes, commits with prompt or default message, and pushes to `origin`. Run from repo root.

### Deploy Cloudflare (Pages + Workers)
```
cloudflare-update-all.bat       :: Workers, then Pages
cloudflare-update-workers.bat   :: Workers only
cloudflare-update-pages.bat     :: Pages only
```
All three pause on success/failure and write `<script-name>.log` next to themselves. Wrangler auth comes from a `credentials.env` file (gitignored).

### Build a Pages site manually
```
cd Web\apps\weather-manager-web
pnpm install
pnpm run pages:deploy
```

### Build + release an Android app (bumps version, signs, copies to `Mobile\builds\`)
```
Mobile\weather-manager-mobile\bump-and-build-release.bat
Mobile\business-manager-app\bump-and-build-release.bat
Mobile\account-hub-app\bump-and-build-release.bat
Mobile\token-manager-app\bump-and-build-release.bat
```
Each one:
1. Bumps `versionCode` +1 and the last segment of `versionName` +1 in `Mobile/<app>/android/app/build.gradle`.
2. Writes the same `version` into `Mobile/<app>/package.json` and `Web/apps/<name>-web/package.json`.
3. Runs `pnpm install && pnpm run build` in `Web/apps/<name>-web/`.
4. Runs `pnpm install && pnpm exec cap sync android` in `Mobile/<app>/`.
5. Runs `gradlew.bat bundleRelease assembleRelease --no-daemon`.
6. Stages `RootRecord-<Product>-<version>.apk` + `.aab` under `Mobile/builds/<sub>/`.
7. Refuses to ship any file with `debug` in the name; tags `-unsigned` if signing is not wired.

### Build all Android apps in one shot
```
powershell -NoProfile -ExecutionPolicy Bypass -File Mobile\scripts\build-all-release-to-builds.ps1
```
Builds web → cap sync → Gradle release for token, account, business, weather, then the native Kilauea Alerts project. Does **not** bump versions.

## Release artifact staging

- Canonical staging root: `Mobile\builds\<token-manager|account-hub|business-manager|weather-manager|kilauea-alerts>\`
- Filename pattern: `RootRecord-<Product>-<version>.apk` / `.aab`
- Per-app `Mobile/<app>/release/` (Weather) is local-only and ignored by git.

## Source-of-truth notes

- **APIs**: prefer the per-product shards (`rootrecord-api-<product>`). `api.rootrecord.info` may still map to legacy `rootrecord-primary` during migration. New features go on the shards.
- **Web app shared frontend libraries**: each web app is a standalone pnpm project (its own `node_modules`, its own lockfile).
- **Shared Worker utilities** (e.g. `password-verify.ts`): live in `Web/cloudflare/shared/`. `cloudflare-update-workers.bat` runs `npm ci` there before deploying any Worker.

## Secrets / safety

Never commit:
- `credentials.env`, `.env*` (except `*.example`)
- Android keystores, `local.properties`, `keystore.properties`
- Firebase service account JSON (`*-adminsdk-*.json`, `google-services.json` is allowed but is gitignored in most subprojects)
- Stripe / API tokens of any kind

The repo-root `.gitignore` plus per-area `.gitignore` files handle this. Env edits should always be surgical (touch only the keys you mean to change).

## Workflow rules (for assistant + dev)

- Only the human runs `commit-all.bat`, `cloudflare-update-*.bat`, and the `bump-and-build-release.bat` scripts.
- The assistant edits files and may suggest commit messages but does not push, deploy, or amend commits unless explicitly told to.
- Minimal diffs scoped to the area being worked on (`Mobile/`, `Web/`, `Doc-Repo/`, `solana-rootrecord-site/`). Avoid cross-area churn in a single commit.
- See `.cursor/rules/rootrecord-workspace.mdc` and `.cursor/rules/mobile-build-outputs.mdc` for the full set of conventions.
