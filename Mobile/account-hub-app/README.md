# RootRecord Account Hub — mobile

Central RootRecord app for account management and shared services. It does
**not** duplicate Weather Manager or Business Manager feature sets; it is the
**home + account + subscription + security + connected apps** center.

The app is built with the **same stack as the other two apps**:

- React 18 + CRA (`react-scripts` 5.0.1)
- Tailwind CSS 3 (with `tailwindcss-animate`)
- `react-router-dom` 6 (HashRouter — Capacitor native `file://` friendly)
- Capacitor 6 Android (native project in `frontend/android/`)
- pnpm workspace — listed in root `pnpm-workspace.yaml`

It shares the production API at **`https://api.rootrecord.info`** and the
`rr_earn_*` rewards pool with Weather Manager and Business Manager.

## MVP scope

| Tab        | Screen(s)                                   | Notes                                                       |
|------------|---------------------------------------------|-------------------------------------------------------------|
| Home       | Identity, earn balance, quick links         | Reads `/api/auth/me`, `/api/earn/summary`                   |
| Apps       | Connected RootRecord apps, open/deep-link   | Custom URL scheme (`weathermanager://`, `businessmanager://`) with Play Store fallback |
| Security   | Change password, sessions, sign-out-all     | `POST /api/me/password` and `/api/auth/logout` — degrades gracefully if endpoints not live |
| Account    | Profile, links to all settings              | Sign-out, version                                            |
| Subscription (nested route) | Plan + entitlement refresh + billing portal | `POST /api/auth/entitlement`; portal on rootrecord.info      |
| Notifications (nested route) | Push/email toggles, device activity         | `/api/me/prefs` (same endpoint Weather already uses)         |

## Missing backend endpoints (not implemented here — tracked in `docs/API-PROPOSALS.md`)

- `POST /api/me/password`  — change password in-app
- `GET /api/me/sessions`   — list active tokens / devices
- `POST /api/me/sessions/:id/revoke`
- `GET /api/me/apps`       — server-driven connected-apps list + entitlement per app
- `POST /api/auth/logout`  — currently exists but `{ all_devices: true }` semantics aren't ratified

## Run the UI (web / dev)

From `Mobile-Development-2026` workspace root:

```bash
pnpm install
pnpm --filter rootrecord-account-hub-mobile start
```

(Add a convenience alias in the root `package.json` later if desired — e.g.
`"hub:start": "pnpm --filter rootrecord-account-hub-mobile start"`.)

## Android (Capacitor)

Native project: `frontend/android/` (generated with Capacitor 6, identical
layout to Business Manager).

**Debug APK (CLI, Windows dev machine):** from `frontend/`:

```powershell
pnpm run android:assemble:debug
```

Output:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

**Release APK + AAB (workspace standard):** staged under **`builds/account-hub/`** via **`scripts/build-all-release-to-builds.ps1`** from the **Mobile** monorepo root. See **`docs/RELEASE-BUILD-OUTPUTS.md`**.

**Android Studio:** `pnpm run android:open` from `frontend/`, then Run.

Scripts in `frontend/package.json`: `cap:sync`, `android:open`,
`android:build`, `android:assemble:debug`.

## Design

- Dark base `#0B0D12` with warm amber brand `#E9B949` — intentionally different
  from Weather's green and Business's teal so users can tell the three apps
  apart in the Android recents view.
- Fonts: **Space Grotesk** (heading), **Inter** (body), **JetBrains Mono**
  (labels) — chosen to visually distinguish from the other apps (Outfit /
  Manrope / Work Sans).

## Secrets / safety

- `.env` files are gitignored; only `.env.example` is committed.
- Android `local.properties`, keystore, and `google-services.json` are
  gitignored at the workspace root (Account Hub does not ship push yet).
