# Root Farms — Bringing it to Life

## Problem Statement
> Today's focus will be fully bringing the roots farmer app to life. I want
> animations, better layout, something that makes it all come alive. Mobile
> and web.

## Tech Stack (existing monorepo)
- `/app/Web/apps/root-farms-web/` — React 18 + Vite + TS (desktop web)
- `/app/Web/apps/root-farms-mobile-web/` — same core re-exported via `@core` alias for Capacitor / mobile web
- `/app/Mobile/root-farms-app/` — Capacitor Android wrapper that builds the mobile-web bundle

## User Choices (Jan 2026 session)
- Vibe: **Lush organic** (earthy greens, soil tones, breathing motions)
- Animation intensity: **Rich** (everything moves with intent)
- Special FX: **Harvest celebration burst** (RU coins flying to balance)
- Layout: **Refresh layout + visuals**
- Constraint: do **not** touch game logic, economy numbers, or API calls

## What's Been Implemented (2026‑01)

### 1. Global "alive" stylesheet — `src/styles/alive.css`
Single CSS module imported by both apps **after** their `index.css` so it
wins specificity wars without `!important` everywhere:
- Organic palette (soil + leaf greens, gold sun, dark forest base) override
  of the original navy/cyan via CSS custom properties.
- Ambient drifting background (`body::before`) + grain overlay (`body::after`)
- Display typography swap to **Fraunces** + **DM Sans** for distinctive feel
- Side-nav: glowing breathing brand logo, active pill with sliding left rail
- Bottom-nav: animated pill underline, icon lift on active tab
- Cards (plots/tiers/market panels/store/upgrades): unified hero-card style,
  hover lift + sheen sweep, organic green border glow
- Plot growth bar: animated shimmer gradient
- Row segment bars: animated fill keyframe
- HUD: hero-card with gradient ring, sun-glow halo, gradient text on balance,
  4.5s soft pulse glow
- Harvest button: ring-pulse "ready" animation
- Modals & overlays: card-in spring with backdrop blur
- Staggered screen entrance + per-card pop entrance
- Custom leaf-green scrollbar + selection
- `prefers-reduced-motion` respected

### 2. Harvest celebration — `src/components/HarvestBurst.tsx`
- Pure visual layer: triggers a ring splash + a flock of gold RU coins that
  fly from the Harvest button to the balance number on a successful click.
- Wired into existing `AccountBalanceHud` without altering any game-logic
  call (`harvestNow()` is still invoked unchanged).

### 3. Stylesheet wiring
- `root-farms-web/src/main.tsx` and `root-farms-mobile-web/src/main.tsx`
  now import `alive.css` after `index.css` so overrides land last.

## What's NOT touched
- Game economy, RU rates, plot/row prices
- API / D1 calls (`farmsApi`, `economyApi`, etc.)
- Auth, ads, native bridges
- Component logic, state, contexts, types
- Existing class names, data-testids, DOM structure
  (HarvestBurst appends one extra fixed-position overlay only when bursting)

## Verified manually (Playwright screenshots)
- Desktop (1440×900): Plots ✓ Roots grid (65 plots) ✓ Orchards ✓ Guide ✓
  The Well/Market ✓ Plot Detail (Carrot) ✓ Harvest burst fires (balance
  went 0.00008 → 0.00008008, cooldown engages correctly) ✓
- Mobile (412×870 via Capacitor mobile-web app): Plots ✓ Roots ✓ The Well ✓
  Bottom nav active states ✓ Beta banner ✓
- `tsc --noEmit` clean for both root-farms-web and root-farms-mobile-web

## Backlog / Next Action Items
- P1 — Plant-growing keyframe (rows visibly grow over cycle) — deferred per
  user choice (b: harvest burst only)
- P2 — Animated mascot / parallax leaves for ambient layer
- P2 — Per-tier accent color theming (carrots orange, beetroot magenta, etc.)
- P2 — Confetti variation on jackpot / cluster purchase
- P3 — Sound design (subtle harvest "thunk" + soft ambient)
- P3 — Skeleton loaders during D1 sync

## How to run locally
```
cd /app/Web/apps/root-farms-web && pnpm install && pnpm dev   # :3000 desktop
cd /app/Web/apps/root-farms-mobile-web && pnpm install && pnpm dev  # mobile web
```
Capacitor Android: `cd /app/Mobile/root-farms-app && pnpm android:assemble:debug`
