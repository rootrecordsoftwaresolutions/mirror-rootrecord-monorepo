# Compatibility report — Weather vs Business → shared with Account Hub

**Generated:** 2026-04-30 during Account Hub scaffold.

## Stack (identical across all three apps)

| Layer                 | Choice                                     |
|-----------------------|--------------------------------------------|
| Framework             | React 18 + Create-React-App (`react-scripts@5.0.1`) |
| Styling               | Tailwind 3 + `tailwindcss-animate`         |
| Icons                 | `lucide-react`                             |
| Router                | `react-router-dom@6`                       |
| HTTP                  | `axios@1.7`                                |
| Mobile shell          | Capacitor 6 (Android only today)           |
| Package manager       | pnpm (workspace root)                      |

## Auth / session

Identical Bearer-token pattern:

- `POST /api/auth/signup` + `POST /api/auth/login` with
  `{ email, password, device_id }`. Response: `{ access_token | token, email,
  pro_unlocked, life_member, account_id, subscription_status }`.
- `POST /api/auth/me` hydrates the user; `POST /api/auth/logout` clears
  server session.
- `POST /api/auth/entitlement` with `{ device_id }` re-reads plan after a
  purchase.
- Token stored in `localStorage`; stable UUID `device_id` stored once per
  install.

**Differences** (cosmetic only — both are safe to share with Hub):

| Concern           | Weather                      | Business                          | Hub reuses                         |
|-------------------|------------------------------|-----------------------------------|------------------------------------|
| Storage key       | `rrwm.token`                 | `rrbm_token`                      | `rrah_token` (no collision)        |
| Device id key     | `rrwm.guestId`               | `rrbm_device_id`                  | `rrah_device_id`                   |
| Guest mode        | Disabled (sign-in required)  | Allowed (`rrbm_guest=1`)          | Not supported (hub requires login) |
| Router            | `HashRouter`                 | `BrowserRouter`                   | `HashRouter` (safer in Capacitor)  |

## API client

Both files share:

- Default base `https://api.rootrecord.info`, overridable via
  `REACT_APP_BACKEND_URL` with a normaliser that strips a stray trailing
  `/api` (prevents `…/api/api/...`).
- `isLocalDevBackend(...)` guard that forces the production base when a
  production build accidentally ships with a `localhost`/`10.0.2.2` URL.
- Auth interceptor that attaches `Authorization: Bearer <token>`.
- `earn/summary`, `earn/heartbeat`, `earn/checkin` using a shared
  per-app `RR_APP_ID` (`rootrecord_<app>_android`).

**Business Manager's client is the newer / cleaner version** (adds
`formatApiError`, prod-URL fallback). The Hub adopts Business's
structure verbatim with the prefix renamed to `rrah_`.

## Earn / rewards (shared pool)

All three apps accrue into the same `rr_earn_*` balance on the primary
Worker; the Hub surfaces the total on Home and never duplicates
accruals — it just fires the same `/api/earn/heartbeat` every 25s on
the current route (matches Business Manager cadence).

## Routing & navigation

- Weather: bottom tab bar `Home / Hazards / Settings` (3 tabs).
- Business: bottom tab bar `Dashboard / Track / Money / Schedule / More`
  (5 tabs).
- Hub: bottom tab bar `Home / Apps / Security / Account` (4 tabs).
  "Subscription" and "Notifications" are nested routes reachable from
  Home and Account.

## Styling

Each app commits to a distinct palette so users can eyeball them in
Android recents without reading the label:

| App      | Base bg   | Brand     | Body font   | Heading font |
|----------|-----------|-----------|-------------|--------------|
| Weather  | `#081C2B` | `#3FE28D` green  | Outfit       | Outfit      |
| Business | `#0B1010` | `#2B8A8F` teal   | Work Sans    | Manrope     |
| Hub      | `#0B0D12` | `#E9B949` amber  | Inter        | Space Grotesk |

Shared building blocks (header, `card`, `chip`, `btn`, `row`, `label`)
are **intentionally duplicated** into each app's `src/components/ui/Shell.jsx`
/ `index.css` rather than extracted. Reasons:

1. The three apps evolve at different cadences (Weather is v1.0.8,
   Business is v0.1.0, Hub is v0.1.0).
2. Tailwind config differs per app, so the class contracts aren't
   really shareable without a design-system package.
3. The problem statement explicitly said "keep diffs minimal and scoped
   to the new app unless a small shared utility extraction is clearly
   beneficial." Extracting now would touch two stable apps.

If/when a fourth app is proposed, it is worth lifting the token/API
client into a `packages/rr-api` workspace entry. Until then, the Hub's
`src/lib/api.js` is the canonical modern version.

## Capacitor / Android

- Capacitor 6, appId `com.rootrecord.<slug>`, `webDir: "build"`,
  `androidScheme: "https"`.
- `variables.gradle`: `minSdk 22`, `compile/targetSdk 34`, Gradle 8.2.1,
  JDK 17 source/target.
- Both apps gitignore `android/.gradle`, `**/build/`, `local.properties`,
  and `google-services.json`.
- Weather ships FCM push (`google-services.json` present); Business and
  Hub do not (yet). Hub's `build.gradle` retains the conditional
  `google-services` plugin exactly as Business does — it's a no-op
  until you drop the JSON in.

## What is shared vs kept separate

### Shared (same endpoints, same semantics)
- `api.rootrecord.info` primary Worker
- `rr_earn_*` rewards pool
- Bearer-token auth with `device_id`
- `/api/me/prefs` key/value store (opaque — each app owns its keys)

### Separate (intentionally duplicated)
- UI shell / components
- Tailwind theme
- App icon + splash + manifest
- `android/` native project
- `localStorage` namespaces

No existing-app source code was modified to build the Hub.
