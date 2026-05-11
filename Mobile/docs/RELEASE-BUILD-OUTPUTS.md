# Release build outputs (canonical layout)

All RootRecord Android apps built from this repository use a **single staging root** for release **APK** and **AAB** copies, so paths stay predictable across machines and docs.

`Mobile/` is the app workspace inside this monorepo. In this repository, paths are rooted at `MonoRepo/`.

## Output root

| Location | Meaning |
|----------|---------|
| **`builds/`** | At Mobile repo root — staged release artifacts (directory created by the build script if missing). |

On a typical dev PC the absolute path matches your clone, for example:

`C:\Users\rrdeveloper\MonoRepo\Mobile\builds\`

## Per-app subfolders

| Subfolder | Web source (CRA) | Android wrapper (Capacitor) |
|-----------|------------------|-----------------------------|
| `token-manager/` | `Web/apps/token-manager-web/` | `Mobile/token-manager-app/` |
| `account-hub/` | `Web/apps/account-hub-web/` | `Mobile/account-hub-app/` |
| `business-manager/` | `Web/apps/business-manager-web/` | `Mobile/business-manager-app/` |
| `weather-manager/` | `Web/apps/weather-manager-web/` | `Mobile/weather-manager-mobile/` |
| `kilauea-alerts/` | n/a (native) | `Mobile/kilauea-alerts-android/` (native Kotlin / Gradle) |

Filenames follow the pattern **`RootRecord-<Product>-<version>.apk`** and **`.aab`** (version from each app’s `package.json` / Android `versionName` used by the build script).

## How builds are produced

From the **Mobile** repo root (`Mobile/` — the folder that contains `scripts/` and `builds/`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/build-all-release-to-builds.ps1"
```

From the monorepo root (`MonoRepo/`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "Mobile/scripts/build-all-release-to-builds.ps1"
```

The script runs, per app: `pnpm install && pnpm run build` in `Web/apps/<name>-web/`, then `pnpm install && pnpm exec cap sync android` in `Mobile/<app>/`, then `android\gradlew.bat bundleRelease assembleRelease`, then copies the first matching APK and AAB from Gradle’s `outputs` into the subfolder above.

## Relationship to Gradle output

Gradle writes under each Android wrapper:

- `Mobile/<app>/android/app/build/outputs/apk/release/*.apk`
- `Mobile/<app>/android/app/build/outputs/bundle/release/*.aab`

**`builds/`** (at Mobile repo root) is the **canonical handoff location** for “everything built” and for documentation; individual apps may also use app-local scripts (for example Weather’s `android:play:ready`). When in doubt, use **`builds/<subfolder>/`**.

## Signing

Release signing varies by app (keystore, `keystore.properties`, etc.). Some builds may still produce **unsigned** release APKs while AABs are signed—check Gradle config per app. This doc only defines **where staged copies go**, not signing policy.
