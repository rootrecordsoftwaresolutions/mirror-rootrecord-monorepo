# Block Notes (Android)

**Block Notes** (`com.rootrecord.blocknotes`) is Root Record’s native **Kotlin + Jetpack Compose** Minecraft companion: offline-first notes, coordinates, build plans, world maps, and optional cloud features when signed into a Root Record account.

**Display name:** Block Notes  
**Stable app id:** `rootrecord_blocknotes_android`  
**Products page:** [rootrecord.info/blocknotes](https://rootrecord.info/blocknotes)

## What problem it solves

- **Second brain for worlds** — Markdown notes, tags, trash, templates, and per-world organization without requiring an account.
- **Coordinates & maps** — Save labeled coords, home-screen widget, grid map from saved X/Z (works without world seed), optional Dynmap/BlueMap and Chunkbase links.
- **Build planning** — Materials lists, progress tracking, bundled reference data (blocks, items, mobs, enchantments, trades, legacy IDs).
- **Optional cloud** — Account sync, World AI reports (Grok), Realm social features, and feedback when signed in.

Core notes and worlds live in **Room** on-device. Cloud routes are additive.

## How it talks to the cloud

Production API shard: **`rootrecord-api-blocknotes`**

| Surface | URL |
|---------|-----|
| Worker (direct) | `https://rootrecord-api-blocknotes.rootrecord.workers.dev/` |
| Custom domain (when attached) | Routes under `rootrecord.info` via Pages Functions proxy |

Representative routes:

| Route family | Purpose |
|--------------|---------|
| `POST /api/feedback` | In-app feedback → Discord |
| `GET/PUT /api/sync/snapshot` | Signed-in backup of worlds, notes, waypoints, areas |
| `/api/blocknotes/realm/*` | Player profiles, friends, groups, group chat |
| `/api/blocknotes/world-ai` | Grok world analysis reports (tier limits) |
| `/api/blocknotes/server/*` | Featured SMP metadata + plugin heartbeat (server-authenticated) |
| `/v1/auth/*`, `/v1/me` | Optional Root Record sign-in / membership |

Auth: Bearer token after Root Record sign-in; guest flows use `X-Guest-Id` where applicable.

## Monetization

- **Free** — Full offline core; ads (AdMob banner + interstitial on navigation).
- **Pro / Lifetime** — Ads hidden; higher World AI quotas; Realm group limits (see app copy).

## Code locations (MonoRepo)

| Layer | Path |
|-------|------|
| Android app | `Mobile/blocknotes-android/` |
| API Worker | `Web/cloudflare/rootrecord-api-blocknotes/` |
| Marketing page | `Web/main/blocknotes.html` |
| Staged releases | `Mobile/builds/blocknotes/` |

## Build & release

```powershell
cd Mobile/blocknotes-android
.\gradlew.bat assembleDebug
# Signed Play release:
.\bump-and-build-release.bat
```

Requires **JDK 17**, Android SDK (`local.properties` → `sdk.dir`), and gitignored upload keystore for release.

Current baseline in repo: **versionName 1.0.17** (versionCode 17) — verify `app/build.gradle.kts` before shipping.

## Realm & SMP integration

Block Notes pairs with the **RootRecord Realm** hub ([rootrecord.info/realm/](https://rootrecord.info/realm/)) and the **BlockNotes Paper plugin** on the dedicated SMP. Players link in-game with `/rootstat link`, verify at [rootrecord.info/realm/verify](https://rootrecord.info/realm/verify), and view public stats at `/realm/player/{uuid}`.

See [minecraft-realm.md](minecraft-realm.md) for server plugin and heartbeat details.

## Related reading

- [minecraft-realm.md](minecraft-realm.md) — Paper plugin, linking, McMMO, playtime
- [../06-development/build-and-release-mobile.md](../06-development/build-and-release-mobile.md)
- [../03-platform/api-overview.md](../03-platform/api-overview.md)
