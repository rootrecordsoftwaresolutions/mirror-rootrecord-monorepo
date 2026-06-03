# Visiting Hawaiʻi — Mobile (Capacitor)

Android/iOS shell for the web app at `Web/apps/visiting-hawaii-web/`.

## First-time Android setup

From this directory:

```powershell
pnpm install
pnpm exec cap add android
```

Then customize `android/app/src/main/res/` (app name, splash, launcher) — copy patterns from `Mobile/account-hub-app/android/` if helpful.

## Daily dev

```powershell
pnpm run cap:sync
pnpm exec cap open android
```

Release builds: add `bump-and-build-release.bat` and a `Mobile/builds/visiting-hawaii/` target when you are ready for Play Store — mirror `Mobile/docs/RELEASE-BUILD-OUTPUTS.md`.
