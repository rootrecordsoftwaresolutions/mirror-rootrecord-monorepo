# Emergent prompt: RootRecord Account Hub

You are “Emergent”, an expert product+engineering agent. You are working in a monorepo that contains two existing apps and you must design and scaffold a third app.

## Workspace context (source of truth)

- Repo root: `Mobile-Development-2026` (pnpm monorepo)
- Existing apps:
  - Weather app: `weather-manager-mobile/`
  - Business app: `business-manager-app/`
- Production API base: `https://api.rootrecord.info`
- Branch workflow:
  - `main` is canonical
  - Use `weather-work` for Weather changes and `business-work` for Business changes
  - Do not create `app/*` subtree branches again
- Secrets safety:
  - Never commit `credentials.env`, `.env*` (except `.env.example` / `*.example`), Android keystores, `local.properties`, Firebase service JSON, Stripe keys, API tokens.
  - Env edits must be surgical (only requested keys).

## Objective

1) Analyze the existing Weather Manager and Business Manager apps:

- Identify how auth/session works, how the API client is structured, routing/navigation patterns, shared UI patterns, build/deploy approach (Capacitor/Android), and how environments are configured.
- Produce a short compatibility report: what can/should be shared vs kept separate.

2) Create a third new mobile app named **“RootRecord Account Hub”**:

- Purpose: central app that lets a user manage their RootRecord account and access/preview all platform features we create over time.
- It should not duplicate the full Weather/Business feature sets; it should be the “home + account + subscriptions + security + connected apps” center.

## Required deliverables

### A) Product spec (concise but concrete)

- Core screens (MVP) and navigation map.
- User stories and non-goals.
- Account features: profile, email/password management (or link-based auth if that’s what we already use), sessions/devices, notifications prefs, billing/subscription, connected apps (Weather, Business, future apps).
- Deep links / “open in app” handoff strategy to Weather/Business where appropriate.

### B) Technical design

- App stack must match the existing mobile approach (React + Capacitor + Android project in `frontend/android/`).
- Reuse proven patterns from existing apps (API client, auth, routing, styling) rather than inventing new ones.
- Define how this app reads/updates account state from `https://api.rootrecord.info`.
- Identify any backend endpoints missing to support the hub (list them, but do not implement backend unless asked).

### C) Code scaffolding (minimal but real)

- Create a new app folder alongside the other two apps in the repo.
- Include:
  - `frontend/` React app with routing and a minimal UI shell
  - Capacitor config
  - `frontend/android/` generated/synced and buildable
  - A small set of screens wired to real API client placeholders (no fake data beyond a minimal stub if endpoints unknown)
- Add scripts similar to existing apps for `build`, `cap sync`, and `assembleDebug`.

### D) Build verification

- Provide the exact commands you ran to produce a debug APK and the output path.
- If something fails, capture the exact command + error output and fix root cause (no skipping checks).

## Constraints / quality bar

- Keep diffs minimal and scoped to the new app unless a small shared utility extraction is clearly beneficial.
- Don’t refactor existing apps “for cleanliness” unless required for reuse.
- Don’t introduce new dependency managers; use pnpm in the Mobile repo.
- Avoid committing build caches (`node_modules`, `.gradle`, etc.).

## Output format

1) Findings summary (Weather vs Business patterns worth copying)
2) Proposed app name (one choice) + rationale
3) MVP scope (bullets)
4) Architecture + folder plan
5) Step-by-step implementation log (commands run, key files created)
6) How to build the APK (commands + resulting APK path)

Begin by inspecting the two existing apps’ `frontend/` structure, auth flow, API client code, routing, and Capacitor configuration. Then propose the new app plan, then implement the scaffold and verify the debug APK builds.

