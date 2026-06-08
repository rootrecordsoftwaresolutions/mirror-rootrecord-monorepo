# Minecraft Notes (BlockNotes) by Root Record

Native **Kotlin + Jetpack Compose** offline-first Minecraft companion notes app.

## Build

Requirements: **JDK 17**, **Android SDK** (`local.properties` → `sdk.dir`).

```powershell
cd Mobile/blocknotes-android
.\gradlew.bat assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

## Play signing (Android developer verification)

Register **`com.rootrecord.blocknotes`** in Play Console with the **SHA-256** of your **upload** keystore (the key you use to sign release AAB/APK).

1. Create the keystore once (pick a strong password; store in password manager):

```powershell
cd Mobile\blocknotes-android
mkdir keystore -ErrorAction SilentlyContinue
keytool -genkeypair -v `
  -keystore keystore\blocknotes-upload.jks `
  -alias blocknotes-upload `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=RootRecord BlockNotes, OU=Mobile, O=RootRecord, L=US, ST=HI, C=US"
```

2. Print the SHA-256 fingerprint for Play Console → **Add key**:

```powershell
keytool -list -v -keystore keystore\blocknotes-upload.jks -alias blocknotes-upload
```

Copy the line **`SHA256:`** (colon-separated hex) into Play Console.

3. Add to gitignored `local.properties`:

```
RELEASE_STORE_FILE=keystore/blocknotes-upload.jks
RELEASE_KEY_ALIAS=blocknotes-upload
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_PASSWORD=...
```

4. Release build (bumps version and stages signed APK + AAB):

```powershell
.\bump-and-build-release.bat
```

Baseline in repo: **versionCode 0**, **versionName 1.0.0**. First run bumps to **1 / 1.0.1** and writes:

- `Mobile/builds/blocknotes/RootRecord-BlockNotes-1.0.1.apk`
- `Mobile/builds/blocknotes/RootRecord-BlockNotes-1.0.1.aab`

Or from `Mobile/scripts/`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File release-bump-and-build.ps1 -App blocknotes
```

Manual Gradle only (no bump):

```powershell
.\gradlew.bat bundleRelease assembleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab`

Use the **same upload key** for every Play release. If you enable Play App Signing, Google re-signs for users; you still register this upload certificate fingerprint.

## AdMob (banner + interstitial)

Same pattern as **Kīlauea Alerts**: anchored adaptive **banner** above the bottom nav; **interstitial** every 50 screen navigations. Both hidden for **Pro / Lifetime** (`auth_pro_unlocked` from RootRecord sign-in).

| | Production unit |
|--|-----------------|
| App ID | `ca-app-pub-8245496571119619~4685237071` |
| Banner | `ca-app-pub-8245496571119619/2059073739` |
| Interstitial | `ca-app-pub-8245496571119619/8432910391` |

These are baked into `release` builds by default. Override in `local.properties` if needed (see `local.properties.example`).

| Build | Ads |
|-------|-----|
| **Debug** | Google test banner + test interstitial |
| **Release** | Production units above |

New AdMob units can take up to an hour to serve live ads; use debug builds with test units meanwhile.

## Backend

Optional cloud routes on Worker **`rootrecord-api-blocknotes`** (`https://rootrecord-api-blocknotes.rootrecord.workers.dev/`):

- `POST /api/feedback` → RootMC Discord
- `GET/PUT /api/sync/snapshot` — signed-in cloud backup (worlds, notes, waypoints, areas)
- `/v1/auth/*`, `/v1/me` — optional RootRecord sign-in

Notes are stored locally in Room and **backed up to your account when signed in**.

## Package

`com.rootrecord.blocknotes` · stable `app_id` `rootrecord_blocknotes_android`
