# Mobile build & release

## Package manager

The mobile monorepo uses **pnpm**. Install from the repo root:

```bash
pnpm install
```

## Running an app (example)

```bash
pnpm --filter <package-name> start
```

Exact filter names appear in each app’s `package.json` and root workspace config.

## Android (Capacitor)

Each app’s `frontend/` (or equivalent) holds Capacitor config and the **`android/`** project.

Typical scripts:

- Open Android Studio
- Assemble debug APK for QA
- Produce release builds signed with your **local** keystore (never commit)

## Staged release outputs

Release APK/AAB artifacts are staged under:

`Mobile/builds/<token-manager|account-hub|business-manager|weather-manager>/`

See **`Mobile/docs/RELEASE-BUILD-OUTPUTS.md`** and **`Mobile/scripts/build-all-release-to-builds.ps1`**.

## Version policy

The primary Worker exposes **`GET /api/mobile/version-policy`** with semver floors per app (`MIN_APP_VERSION_*`). Older clients may be nudged to upgrade.

## Related reading

- [../03-platform/api-overview.md](../03-platform/api-overview.md)
