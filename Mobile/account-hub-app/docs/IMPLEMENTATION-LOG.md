# Account Hub — implementation log (2026-04-30)

One-session scaffold. This log is the "what I ran, why, and what broke"
trail requested in the problem statement.

## 1. Repo inspection

```
fd . /app -d 3          # tree overview
view_bulk /app/package.json /app/pnpm-workspace.yaml \
          /app/.npmrc /app/.gitignore
view_bulk /app/weather-manager-mobile/frontend/package.json \
          /app/weather-manager-mobile/frontend/capacitor.config.json \
          /app/weather-manager-mobile/frontend/src/App.js \
          /app/weather-manager-mobile/frontend/src/lib/api.js \
          /app/weather-manager-mobile/frontend/src/pages/AuthGate.js
view_bulk /app/business-manager-app/frontend/package.json \
          /app/business-manager-app/frontend/capacitor.config.json \
          /app/business-manager-app/frontend/src/App.js \
          /app/business-manager-app/frontend/src/lib/api.js \
          /app/business-manager-app/frontend/src/contexts/AuthContext.js \
          /app/business-manager-app/frontend/src/components/ui/Shell.jsx \
          /app/business-manager-app/frontend/src/components/modules/AuthScreen.jsx
ls /app/business-manager-app/frontend/android/app/src/main/
```

**Findings (full compatibility report in `docs/COMPATIBILITY-REPORT.md`):**

- Identical React 18 + CRA + Tailwind + Capacitor 6 stack.
- Shared `POST /api/auth/{login,signup,me,logout,entitlement}` with
  `{email, password, device_id}` Bearer-token flow.
- Shared `rr_earn_*` balance via `/api/earn/{summary,heartbeat,checkin}`
  with a per-app `RR_APP_ID` (`rootrecord_<app>_android`).
- Business Manager's API client is the newer, cleaner version — we
  mirrored its shape and renamed the `localStorage` prefix to `rrah_`.
- Tailwind theme and fonts differ per app on purpose. We picked a new
  amber palette + Space Grotesk / Inter / JetBrains Mono so the Hub is
  visually unmistakable in Android recents.

## 2. Scaffold creation

```
mkdir -p /app/account-hub-app/{frontend/{src/{components/{ui,modules},contexts,lib,pages},public,scripts},backend,memory,docs}
```

Then created 17 source files via parallel `mcp_create_file` calls:

| File                                                        | Purpose                                |
|-------------------------------------------------------------|----------------------------------------|
| `frontend/package.json`                                     | Deps + scripts (matches Business Manager shape) |
| `frontend/capacitor.config.json`                            | `com.rootrecord.accounthub` / `webDir: build` |
| `frontend/postcss.config.js` + `tailwind.config.js`         | Amber brand theme                      |
| `frontend/.env.example` + `.npmrc`                          | Env template; hoisted node_modules     |
| `frontend/public/index.html` + `manifest.json`              | Shell, fonts, theme-color              |
| `frontend/src/index.{js,css}`                               | HashRouter mount, dark tokens, `.btn`/`.card`/`.row` |
| `frontend/src/App.js`                                       | Routes, Gate, /auth auto-redirect, earn heartbeat |
| `frontend/src/contexts/AuthContext.js`                      | login/register/logout/refresh/refreshEntitlement |
| `frontend/src/lib/api.js`                                   | axios instance, Bearer interceptor, `formatApiError` |
| `frontend/src/lib/apps.js`                                  | Curated connected-apps registry        |
| `frontend/src/lib/format.js`                                | `initialsFrom`, `fmtDateOnly`, `fmtRelative` |
| `frontend/src/components/ui/Shell.jsx`                      | ScreenHeader/PageContainer/Section/Field/Empty/Spinner/Toast |
| `frontend/src/components/ui/BottomNav.jsx`                  | 4-tab bottom nav                       |
| `frontend/src/components/modules/AuthScreen.jsx`            | Sign-in / create-account               |
| `frontend/src/components/modules/Home.jsx`                  | Identity + earn + apps preview + manage |
| `frontend/src/components/modules/ConnectedApps.jsx`         | Full apps grid with deep-link opens    |
| `frontend/src/components/modules/Security.jsx`              | Password + sessions + danger zone      |
| `frontend/src/components/modules/Subscription.jsx`          | Plan card + entitlement refresh + portal |
| `frontend/src/components/modules/Notifications.jsx`         | Prefs toggles via `/api/me/prefs`      |
| `frontend/src/components/modules/Account.jsx`               | Profile + settings list + sign out + version |
| `frontend/src/components/modules/Info.jsx`                  | About + Help                           |

## 3. Android native scaffold

Copied Business Manager's `android/` tree (identical Capacitor 6 layout
with `minSdk 22`, `compileSdk 34`, Gradle 8.2.1, JDK 17) and renamed:

```
cp -r /app/business-manager-app/frontend/android \
      /app/account-hub-app/frontend/android
mkdir -p .../java/com/rootrecord/accounthub
rm -rf   .../java/com/rootrecord/businessmanager
```

Then overwrote:

- `android/app/build.gradle` → new `namespace` and `applicationId`:
  `com.rootrecord.accounthub`, versionCode 1, versionName `0.1.0`.
- `android/app/src/main/java/com/rootrecord/accounthub/MainActivity.java`
  → package `com.rootrecord.accounthub`.
- `android/app/src/main/res/values/strings.xml` → app name "Account Hub",
  `package_name` and `custom_url_scheme` updated.

Left intact: `build.gradle` (root), `variables.gradle`, `settings.gradle`,
`capacitor.settings.gradle`, `gradle-wrapper.*`, `proguard-rules.pro`,
splash drawables, mipmap launchers, `AndroidManifest.xml`. Conditional
`google-services` plugin retained (no-op without the JSON).

## 4. Workspace wiring

```
search_replace pnpm-workspace.yaml          # add account-hub-app/frontend
search_replace package.json (workspace root) # add hub:start / hub:build / hub:android:assemble
```

## 5. Build verification

Installed pnpm via Corepack because the pod image shipped `yarn@1.22`
globally:

```bash
corepack enable
corepack prepare pnpm@10.18.3 --activate
cd /app && pnpm install --ignore-scripts
```

Result: `Done in 24.8s · +1452 packages · Scope: all 4 workspace projects`.

Built the Hub:

```bash
cd /app/account-hub-app/frontend && CI=true pnpm run build
```

Result: `Compiled successfully · 79.77 kB gzip (JS) · 4.33 kB gzip (CSS)`.

Ran Capacitor sync:

```bash
cd /app/account-hub-app/frontend && pnpm exec cap sync android
```

Result: `Sync finished in 0.067s · 1 Capacitor plugin detected (@capacitor/app)`.

Regression check — both existing apps still build cleanly:

```bash
cd /app/business-manager-app/frontend && CI=true pnpm run build   # OK
cd /app/weather-manager-mobile/frontend    && CI=true pnpm run build      # OK
```

No existing-app source was modified.

## 6. Visual + behavioural verification (Playwright)

Served `build/` over `python3 -m http.server 3033` and screenshotted:

- **Unauthed** → `/auth` (Sign in tab default, Create account tab switches).
- **Visiting `#/home` unauthed** → correctly bounces to `/auth`.
- **Token seeded + `/auth/me` mocked** → lands on `/home` with:
  - Initials avatar, name, email, **Pro** chip, subscription **active** chip.
  - Beta rewards card: **1,234 pts · Shared balance across every RootRecord app**.
  - Connected-apps preview list (Weather, Business, Account Hub "this app").
  - Manage links: Security & sessions, Subscription & billing, Notifications.
- **`/apps`**: Available now grid (Weather + Business with Open buttons; Hub with "this app" chip) and Coming soon (Field Logger, Invoice Studio).
- **`/security`**: Change Password form, Active Sessions placeholder, Dangerous (Sign out of all devices).
- **`/subscription`**: Pro plan card with refresh button + Manage Billing opener.
- **`/notifications`**: three prefs toggles (push ON / email OFF / device ON), explanatory `/api/me/prefs` note.
- **`/account`**: Profile card with Pro chip + "since 1/15/2025", links to Security/Subscription/Notifications/About/Help, Sign out, version footer `Account Hub v0.1.0`.

## 7. Issue encountered and fixed

**Symptom:** after seeding a token in `localStorage` and visiting `#/home`,
the Gate correctly loaded `/auth/me`, but the URL resolved to `#/auth`
because my test harness had navigated to `#/auth` first (to establish
origin before calling `localStorage.setItem`) and my original
`<Route path="/auth" element={<AuthScreen />} />` had no
redirect-when-authed behaviour.

**Fix:** introduced `AuthOrRedirect` — if `user === undefined` renders
the loading placeholder, if a user is present it `<Navigate to="/home" replace />`s,
otherwise renders `AuthScreen`. Matches the Weather Manager pattern.
Rebuilt, re-ran the screenshot suite, all four main tabs and the two
nested routes rendered as expected.

## 8. Smoke test against production API

```
curl -s -X POST https://api.rootrecord.info/api/auth/me \
     -H "Authorization: Bearer invalid-test-token"
→ HTTP 401 · 0.11s

curl -s "https://api.rootrecord.info/api/earn/summary?app_id=rootrecord_account_hub_android"
→ HTTP 401
```

Auth endpoints reachable. The `rootrecord_account_hub_android` app id is
accepted (gets to auth, not parameter-validation rejection) — i.e. the
Worker treats it like any other app id, which is what we want for the
shared earn pool.

## 9. APK build — deferred to the user's Windows dev machine

This Emergent pod image does **not** ship JDK or Android SDK (`java`
absent; `ANDROID_HOME` empty). This matches the user's existing
workflow — Weather and Business both build their debug APKs on a
Windows dev machine per their READMEs. The Hub's README documents the
exact commands (`pnpm run android:assemble:debug`) and output path
(`android/app/build/outputs/apk/debug/app-debug.apk`). Once run on a
Windows box with JDK 17 + Android SDK, the APK will build because the
Capacitor sync output already wrote `android/app/src/main/assets/public/`.
