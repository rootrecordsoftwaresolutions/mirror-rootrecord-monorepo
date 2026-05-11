# RootRecord Business Manager — Mobile (PRD)

## Product
Standalone **Android** Business Manager (Capacitor + React): time, money, clients, inventory, scheduling, work log, and reports. Users sign in with a **RootRecord account**; cloud data for this app is stored on **RootRecord primary** (`https://api.rootrecord.info`, D1 `bm_owned_row`). Visual language: dark teal (#2B8A8F), tagline *"Your grounding root for business productivity."* This repo is **not** coupled to any other Business Manager codebase or release train.

## Architecture (this repo)
- **Frontend**: React 18 mobile-first PWA (Manrope + Work Sans, Tailwind). React Router. Recharts. jsPDF for Reports → PDF.
- **Backend (optional)**: FastAPI + Motor (MongoDB), `/api` — useful for local dev and tests; the **shipping APK** uses the **Cloudflare Worker** API directly (`api.rootrecord.info`).
- **Auth & billing**: RootRecord **licence Worker** (`rootrecord-license…`) for login, signup, `/v1/me`, entitlement — same account system as other RootRecord apps.
- **Navigation**: Bottom tabs — Dashboard / Track / Money / Schedule / More.

## Modules (mobile scope)
1. **Auth** — sign in / sign up / guest. JWT in `localStorage`; stable `device_id`.
2. **Dashboard** — Hours / Income / Expenses / Net; scope chips; category charts.
3. **Time & Tracking** — clock in/out, category + project, manual entry, quick actions.
4. **Work Log** — range, search, category filter, delete.
5. **Reports** — range, charts, PDF export.
6. **Finance & Clients** — Money, clients, invoices, debts, funds, scheduled, resources, tax helper.
7. **Schedule** — events list + form.
8. **Stock & Supplies** — products + supplies.
9. **Account Settings** — plan, entitlement refresh, wipe, feedback path.
10. **Business Settings** — businesses list / edit.
11. **Program Settings** — currency, theme, prompts, timezone, toggles.
12. **About & Help**
13. **Feedback** — POST `/api/feedback` → Discord webhook (Worker secret).

## Implemented (cloud + mobile)
- All modules above with `data-testid` on interactive controls.
- **D1 / Worker**: first business API touch seeds **only** default **business** row + **settings** row — **no** preset categories or quick actions; those appear only after explicit client `POST`.
- **Quick actions**: `/api/quick-actions` CRUD + `/api/quick-actions/{id}/run`; managed on **Track**; Dashboard shows up to six when not clocked in.
- **Auth**: bearer token; optional FastAPI proxy in `backend/` for pytest against Worker-shaped routes.

## Known gaps / next
- **Optional FastAPI ↔ Worker/D1**: local Mongo stack is legacy convenience; long-term is Worker-only for business data.
- **Capacitor**: `npm run android:apk` from `frontend/` for release builds; for the **workspace-standard** staged APK+AAB location (`builds/business-manager/` at Mobile repo root), use **`scripts/build-all-release-to-builds.ps1`** — see **`docs/RELEASE-BUILD-OUTPUTS.md`**.
- **Licence API**: `/v1/auth/login`, `/v1/me`, `/v1/entitlement`, etc. — document changes in `api.js` + Worker only.
- **Reports PDF**: basic jsPDF today; richer tables (e.g. autotable) later.

## Backlog
- Unified sync / offline queue (if product requires it).
- Notifications (scheduled expenses, low stock).
- Biometric lock + safer token storage on Android.

## Testing
- See `memory/test_credentials.md`.
- `backend/tests/` against configured `API` base.

## Reference
Design notes and screenshots may live under `memory/` or `frontend/`; nothing here is required to track another product’s source tree.
