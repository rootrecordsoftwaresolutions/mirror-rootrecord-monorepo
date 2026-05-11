# Release build outputs (canonical layout)

All RootRecord Android apps built from this repository use a **single staging root** for release **APK** and **AAB** copies, so paths stay predictable across machines and docs.

**Repository root** here means the **Mobile** monorepo checkout: the directory that contains `scripts/`, `builds/`, `token-manager-app/`, etc. (In a larger tree such as `Development/Mobile/`, that folder is still the Mobile repo root.)

## Output root

| Location | Meaning |
|----------|---------|
| **`builds/`** | At Mobile repo root — staged release artifacts (directory created by the build script if missing). |

On a typical dev PC the absolute path matches your clone, for example:

`C:\Users\rrdeveloper\Development\Mobile\builds\`

## Per-app subfolders

| Subfolder | App source |
|-----------|------------|
| `token-manager/` | `token-manager-app/frontend/` |
| `account-hub/` | `account-hub-app/frontend/` |
| `business-manager/` | `business-manager-app/frontend/` |
| `weather-manager/` | `weather-manager-mobile/frontend/` |
| `kilauea-alerts/` | `kilauea-alerts-android/` (native Kotlin / Gradle at repo root of that folder) |

Filenames follow the pattern **`RootRecord-<Product>-<version>.apk`** and **`.aab`** (version from each app’s `package.json` / Android `versionName` used by the build script).

## How builds are produced

From the **Mobile** repo root (`Mobile/` — the folder that contains `scripts/` and `builds/`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/build-all-release-to-builds.ps1"
```

From a parent folder (for example the overall **Development** tree that contains `Mobile/`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "Mobile/scripts/build-all-release-to-builds.ps1"
```

The script runs, per app: install (`npm ci` or `npm install` with legacy peer deps where needed), `npm run build`, `npx cap sync android`, then `android\gradlew.bat bundleRelease assembleRelease`, then copies the first matching APK and AAB from Gradle’s `outputs` into the subfolder above.

## Relationship to Gradle output

Gradle still writes under each frontend:

- `frontend/android/app/build/outputs/apk/release/*.apk`
- `frontend/android/app/build/outputs/bundle/release/*.aab`

**`builds/`** (at Mobile repo root) is the **canonical handoff location** for “everything built” and for documentation; individual apps may also use app-local scripts (for example Weather’s `android:play:ready` copying into `frontend/release/`). When in doubt, use **`builds/<subfolder>/`**.

## Signing

Release signing varies by app (keystore, `keystore.properties`, etc.). Some builds may still produce **unsigned** release APKs while AABs are signed—check Gradle config per app. This doc only defines **where staged copies go**, not signing policy.
