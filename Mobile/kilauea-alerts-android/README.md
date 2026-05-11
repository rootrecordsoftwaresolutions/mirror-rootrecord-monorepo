# Kilauea Alerts by Root Record

Native **Kotlin + Jetpack Compose** app for Big Island volcano status, earthquakes, weather (via Root Record `GET /api/dashboard`), live feeds, and alerts — with offline cache in the **`kilauea_data`** Room table. A lightweight **web** companion (dashboard bundle + Big Island presets) lives in **`../../Web/apps/kilauea-alerts-web/`** and deploys to **`https://kilauea.rootrecord.info`**.

## Build

Requirements: **JDK 17**, **Android SDK** (set `sdk.dir` in `local.properties`).

```powershell
cd Mobile/kilauea-alerts-android
.\gradlew.bat assembleDebug
```

Release bundles use the same Gradle targets as other Root Record apps; staged copies go to `Mobile/builds/kilauea-alerts/` when using `Mobile/scripts/build-all-release-to-builds.ps1`.

## Configuration

| Input | Purpose |
|-------|---------|
| `local.properties` → `sdk.dir` | Android SDK path (do not commit). |
| `local.properties` → `YOUTUBE_API_KEY` | Optional YouTube Data API v3 key for live-feed discovery (never commit real keys). |
| `app/google-services.json` | Firebase Cloud Messaging — replace the placeholder with your Firebase Android app config. |

## Architecture

- **MVVM** + repositories (`UsgVolcanoRepository`, `EarthquakeRepository`, `WeatherRepository`, `NwsAlertsRepository`, `LiveFeedsRepository`).
- **Room** single table `kilauea_data` for JSON snapshots + timestamps.
- **DataStore** for guest id, notification toggles, dedupe id sets.
- **WorkManager**: `AlertPollWorker`, `LiveFeedsSyncWorker`, `HomeRefreshWorker`.
- **FCM**: `KilaueaFirebaseMessagingService` triggers a one-shot alert poll.

USGS and NWS are called **directly** from the device. Weather dashboards use **`https://api.rootrecord.info/api/dashboard`** with `X-Guest-Id`.

Signed-in users can send **feedback** from **More → Send feedback**; the app posts to **`POST https://api.rootrecord.info/api/feedback`** (same path as Business Manager; Worker forwards to Discord when configured).

## Beta testing

Discord announcement copy for testers: [`docs/DISCORD-BETA-1.0.3.md`](docs/DISCORD-BETA-1.0.3.md) (paste from below the horizontal rule).

## Branching

Per workspace rules, weather-ecosystem work targets branch **`weather-work`**.
