# RootStat

Paper plugin linking Minecraft players to [RootRecord](https://rootrecord.info) accounts.

## Setup

1. **Register server** — [rootrecord.info/realm/servers](https://rootrecord.info/realm/servers) → copy credentials into `plugins/RootRecord/cloud.yml`.
2. **MySQL** — Point `mysql.*` at the same database Vault, Jobs, McMMO, etc. use. RootStat creates a `rootstat_players` table (with optional prefix).
3. **Deploy jar** — `./gradlew :plugins:rootstat:build` (requires JDK 25, see repo `local.properties`).

## Player flow

1. In-game: `/rootstat link`
2. Web: [rootrecord.info/realm/verify](https://rootrecord.info/realm/verify) — sign in, enter code
3. Plugin syncs from Cloudflare D1 → local MySQL on interval and on join

## PlaceholderAPI

- `%rootstat_verified%` — `true` / `false`
- `%rootstat_account_id%` — RootRecord account id
- `%rootstat_email%` — linked email (if synced)

## API

Server-authenticated routes (headers `X-RootStat-Server-Id`, `X-RootStat-Server-Secret`):

- `POST /api/realm/minecraft/link/start`
- `GET /api/realm/minecraft/link/status?uuid=…`
- `GET /api/realm/minecraft/sync?since=…`

User-authenticated (browser / bearer):

- `POST /api/realm/minecraft/link/complete`
- `POST /api/realm/minecraft/server/register`
