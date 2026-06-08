# Root Goals (Android)

Capacitor wrapper for **Root Goals** — web source at `Web/apps/root-goals-web/`, API at `Web/cloudflare/rootrecord-api-goals/`.

- **Package:** `com.rootrecord.rootgoals`
- **Baseline version:** 1.0.0 (Release 0)
- **Play Console app id:** `rootrecord_goals_android` (sent as `device_id` guest id + future mobile config)

## Build (debug)

Requirements: **JDK 17**, **Android SDK** (`android/local.properties` → `sdk.dir`).

```powershell
cd Mobile/root-goals-mobile
pnpm install
pnpm run android:assemble:debug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Release (signed APK + AAB)

Signing uses the **same Root Record upload keystore** as Business Manager (`android/upload-release.jks` + `keystore.properties`, both gitignored).

1. Copy signing files once (if not already present):

```powershell
cd Mobile\root-goals-mobile\android
copy ..\..\business-manager-app\android\upload-release.jks .
copy ..\..\business-manager-app\android\keystore.properties .
```

Or generate a dedicated keystore and register its **SHA-256** in Play Console for `com.rootrecord.rootgoals`:

```powershell
keytool -genkeypair -v -storetype PKCS12 `
  -keystore upload-release.jks `
  -alias upload `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=RootRecord Root Goals, OU=Mobile, O=RootRecord, L=US, ST=HI, C=US"
keytool -list -v -keystore upload-release.jks -alias upload
```

Copy the **SHA256:** line into Play Console → App signing → Upload key certificate.

2. Release build:

```powershell
cd Mobile\root-goals-mobile
.\bump-and-build-release.bat
```

Output: `Mobile/builds/root-goals/RootRecord-RootGoals-<version>.apk` and `.aab`

Or from repo root: `Mobile\scripts\build-all-release-to-builds.ps1` (includes Root Goals).

## API / env

Production Android bundles use `VITE_GOALS_API_BASE=https://api-goals.rootrecord.info/api` (set in `bump-and-build-release.bat`). Override locally in `Web/apps/root-goals-web/.env` for dev.
