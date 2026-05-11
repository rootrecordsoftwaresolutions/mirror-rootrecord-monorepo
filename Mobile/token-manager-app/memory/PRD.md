# RootRecord Token Manager — PRD

## Original problem statement

Build a fully mobile version (Android-first) of the existing Solana site (`RootRecord/solana-rootrecord-site`), placed in the `Mobile-Development-2026` pnpm monorepo, with feature parity for the core wallet flows. The mobile app is named **"RootRecord Token Manager"**. Architecture: React + Capacitor preferred. Wallet UX: never prompt for seed phrases; use external wallets via standard Phantom flows. Deliver Android debug APK build instructions.

## Architecture (chosen)

**Option 1 — Native-like React + Capacitor**, sitting alongside `business-manager-app` and `weather-manager-mobile` in the workspace.

- React (CRA) + Tailwind + lucide-react + framer-motion-style micro animations (CSS only).
- `@solana/web3.js` + `@solana/spl-token` for all RPC + transaction building, client-side.
- Phantom via `window.solana` provider (browser ext / Capacitor WebView injection / Phantom in-app browser deep link).
- Lightweight FastAPI + MongoDB backend for preferences, address book, and SOL price proxy.

## User personas

- **Solana power user (primary)** — wants to read balances and approve sends from their phone with their existing Phantom wallet.
- **Curious watcher** — wants to track an address's holdings without connecting their own wallet.

## Core requirements (static)

- Non-custodial: never store private keys / seeds.
- Mobile-first UI with bottom-tab navigation.
- Network selector: mainnet-beta / devnet / testnet (synced server-side).
- Touch targets ≥ 44px, safe-area aware.
- All interactive elements carry `data-testid`.
- Distinctive non-AI-slop aesthetic (phosphor + magenta on deep ink).

## Implemented (2026-04-30, MVP)

- ✅ Backend (`/api`): health, wallet connect, prefs (GET/PATCH), contacts (CRUD), SOL price proxy with 45s cache, network endpoints listing.
- ✅ Wallet context: Phantom + Watch mode, persisted in `localStorage`, network synced with backend.
- ✅ Connect screen with security copy, Phantom + Watch flows, deep-link install fallback.
- ✅ Dashboard: SOL balance + USD + 24h change, SPL token list, NFT grid (heuristic), copy-address.
- ✅ Send (SOL **and SPL tokens**): asset picker with live balances; 3-step flow (amount → review → sent); decimal-safe BigInt parsing per token's decimals; auto-creates the recipient ATA when missing (via `buildSplTransferTx`); fee-reserve checks both the asset balance and the SOL needed for network fees; explorer link.
- ✅ Receive: QR + full address + copy + cluster warning.
- ✅ History: recent signatures from RPC with Explorer links.
- ✅ Settings: network selector, address-book entry, security note, disconnect.
- ✅ Address book: add/list/delete saved contacts (server-backed).
- ✅ Capacitor config (`com.rootrecord.tokenmanager`) — APK build commands documented; Android folder added on first `cap:init:android`.

## Backlog (prioritized)

### P0 (next)
- ✅ Unit tests: `parseDecimalToBaseUnits` / `formatBaseUnits` (`src/lib/format.test.js`); `isValidPubkey` + `buildSplTransferTx` (`src/lib/solana.test.js`, `@jest-environment node` for Solana PDAs).
- 🔲 E2E or broader integration coverage for the full signed SPL send path (Phantom not feasible in CI).

### P1
- 🔲 NFT metadata via Metaplex DAS (image + name on the NFT grid).
- 🔲 Mobile Wallet Adapter integration for native Android signing.

### P2
- 🔲 Multi-currency display (EUR / GBP / SOL-only).
- 🔲 Token allow-list / hide-zero-balance toggle (schema is in place).
- 🔲 Push notifications for incoming transfers (FCM, à la `rr-weather-manager-mobile`).
- 🔲 Pull-to-refresh on Dashboard / History.

## Known gaps

- Source-map warnings from `superstruct` in dev mode are silenced via `GENERATE_SOURCEMAP=false`.
- Phantom on real mobile requires either the Phantom in-app browser or MWA — a P1.

## Next tasks

1. Run backend tests (`testing_agent_v3`) for `/api/wallets/*`, `/api/price/sol`, `/api/network/endpoints`.
2. Manual UI smoke through Connect → Watch (real address) → Dashboard → Send (SOL + SPL) → History.
3. Expand frontend unit tests (SPL tx builder + decimal parsing are covered; add more edge cases as needed).
