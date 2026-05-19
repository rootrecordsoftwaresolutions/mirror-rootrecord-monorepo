# Root Farms (Android)

Capacitor wrapper → `Web/apps/root-farms-mobile-web/` (game core in `root-farms-web/src`).

## Release APK + AAB

From repo root:

```bat
build-root-farms-android.bat
```

Or from this folder: `bump-and-build-release.bat`

Outputs: **`Mobile/builds/root-farms/RootRecord-RootFarms-<version>.apk`** and **`.aab`**

Optional Play signing: copy `android/keystore.properties.example` → `android/keystore.properties` and add your `.jks` (same pattern as Business Manager).

## Web deploy only

`cloudflare-deploy-root-farms.bat` at monorepo root.

## Standalone private repo

Export web + mobile + API slice: `Mobile\scripts\export-root-units-idle-farmer-repo.ps1` → `..\Root-Units-Idle-Farmer` (GitHub: **Root-Units-Idle-Farmer**).
