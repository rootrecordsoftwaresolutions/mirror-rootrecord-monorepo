# RootRecord Token Manager — Mobile (Android-first)

A non-custodial Solana wallet companion built as a mobile-first React + Capacitor app inside the `rootrecord-mobile-workspace` monorepo. The app provides feature parity with the Solana site ([RootRecord/solana-rootrecord-site](https://github.com/RootRecord/solana-rootrecord-site)) for the **core flows** that matter on mobile: connect wallet, view balances, send tokens, receive (QR), view recent activity, and manage settings + an address book.

> Status: **MVP** — core flows shipped (Phantom + Watch, SOL + SPL send, receive, history, contacts, RootRecord sign-in); Android debug build documented below.

## Architecture decision

**Option 1 chosen: native-like React + Capacitor app.** The web Solana site is a Next.js application heavy on `@solana/web3.js`, wallet adapter, and direct RPC calls — none of which require server-side rendering on mobile. A native-like Capacitor build:

- Reuses 100% of the Solana TypeScript logic (`@solana/web3.js`, `@solana/spl-token`).
- Lets us replace browser-only wallet-adapter UI with a mobile-optimized Phantom flow (`window.solana` in the WebView; deep-link install fallback).
- Keeps signing UX explicit and on-device — your wallet app is in charge.
- Avoids the latency/UX issues of wrapping a remote site (Option 2) and the build complexity of bundling a static next export (Option 3).

## Parity checklist (Web Solana site → Mobile)

| Web feature | Mobile screen | Status |
|---|---|---|
| Wallet adapter connect (Phantom) | `Connect` (`/connect`) — Phantom + Watch mode | ✅ |
| RPC network config (mainnet/devnet/testnet) | `Settings` → Network (synced to backend) | ✅ |
| Wallet dashboard (SOL + USD value, 24h change) | `Dashboard` (`/dashboard`) | ✅ |
| SPL token list | `Dashboard` → Tokens tab | ✅ |
| NFT gallery | `Dashboard` → NFTs tab (heuristic by decimals=0/uiAmount=1) | ✅ (basic, no metadata fetch) |
| Send SOL | `Send` (`/send`) — 3-step amount → review → sent | ✅ |
| Send SPL token | `Send` — asset picker, `buildSplTransferTx`, ATA create when missing | ✅ |
| Receive (QR + address) | `Receive` (`/receive`) | ✅ |
| Transaction history | `History` (`/history`) — recent signatures, links to Explorer | ✅ |
| Address book / saved recipients | `AddressBook` (`/contacts`) | ✅ |
| Network status | Network pill in every header + `/api/network/endpoints` | ✅ |
| Server-side calls / API | FastAPI backend: prefs + contacts + price proxy | ✅ |
| Web-only features | none required for the core mobile flows | n/a |

## Mobile architecture

```
token-manager-app/
├── backend/                # FastAPI + MongoDB (prefs, contacts, price proxy)
│   ├── server.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── package.json        # React + Capacitor + Solana web3
    ├── capacitor.config.json
    ├── tailwind.config.js
    ├── public/
    └── src/
        ├── App.js
        ├── index.{js,css}
        ├── lib/
        │   ├── api.js      # axios client → /api/*
        │   ├── solana.js   # RPC + tx builders (SOL + SPL helpers)
        │   ├── wallet.js   # Phantom provider helpers
        │   └── format.js   # mono numerics, lamports/USD, address shortener
        ├── contexts/WalletContext.js
        ├── components/ui/      # BottomNav, Toast, NetworkPill, AddressCopy, PageHeader
        └── components/modules/ # Connect, Dashboard, Send, Receive, History, Settings, AddressBook
```

### Wallet & security model

- **Never** asks for, stores, or transmits seed phrases / private keys.
- Phantom integration uses the standard provider (`window.solana` / `window.phantom.solana`) which works in:
  - Desktop browser (Phantom extension) — for development.
  - Capacitor WebView with Phantom-injected provider, **or**
  - Native deep-link to Phantom mobile via `https://phantom.app/ul/browse/<encoded current url>`.
- Backend stores only the public key + UI preferences + saved contact addresses.
- Network selection is per-wallet and synced server-side so it follows the user across devices.

### Backend endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB ping |
| POST | `/api/wallets/connect` | Register / refresh a wallet by pubkey |
| GET | `/api/wallets/{pubkey}/preferences` | Current preferences |
| PATCH | `/api/wallets/{pubkey}/preferences` | Update network / currency / display flags |
| GET | `/api/wallets/{pubkey}/contacts` | List address book |
| POST | `/api/wallets/{pubkey}/contacts` | Add contact |
| DELETE | `/api/wallets/{pubkey}/contacts/{id}` | Remove contact |
| GET | `/api/price/sol?vs=usd` | CoinGecko proxy with 45-second cache |
| GET | `/api/network/endpoints` | Public Solana RPC endpoints by cluster |

All wallet-scoped endpoints validate the base58 pubkey decodes to 32 bytes. There is no password / JWT — the public key itself is the identity (this is consistent with non-custodial wallet UX).

## Local dev

```bash
# from the repo root
cd token-manager-app/frontend
yarn install
yarn start                   # CRA dev server on :3000
# Unit tests (decimal parsing + SPL tx builder): CI=true yarn test:ci

cd ../backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Configure `frontend/.env`:

```
REACT_APP_BACKEND_URL=http://localhost:8001    # or your preview backend
REACT_APP_DEFAULT_NETWORK=mainnet-beta
```

And `backend/.env` (see `.env.example`):

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=rootrecord_token_manager
SOLANA_DEFAULT_NETWORK=mainnet-beta
COINGECKO_BASE=https://api.coingecko.com/api/v3
```

## Building the Android debug APK

The frontend is already configured for Capacitor. The first-time setup needs the Android SDK installed locally (Android Studio with API 33+).

```bash
cd token-manager-app/frontend
yarn install
yarn build                                          # produces /build
yarn cap:init:android                               # only the very first time -> creates frontend/android/
yarn android:assemble:debug                         # build + sync + ./gradlew assembleDebug
```

Output APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

**Release APK + AAB (workspace standard):** staged under **`builds/token-manager/`** when you run **`scripts/build-all-release-to-builds.ps1`** from the **Mobile** monorepo root. Details: **`docs/RELEASE-BUILD-OUTPUTS.md`**.

Open in Android Studio for emulator runs:

```bash
yarn android:open
```

> **Note:** The Emergent preview container does **not** ship the Android SDK, so APK assembly must run on the developer's machine (same convention as the sibling `business-manager-app` and `weather-manager-mobile`). The web preview at `REACT_APP_BACKEND_URL` is what runs inside the cluster.

## Known gaps / follow-ups

- **New-token Discord feed** — lives on the **Solana web site** (`/create` on [solana-rootrecord-site](https://github.com/RootRecord/solana-rootrecord-site)): webhook secret `DISCORD_TOKEN_CREATE_WEBHOOK_URL` on **RootRecord primary Worker**; Next proxies via `SOLANA_SITE_LOG_URL` (same as site action log). This mobile app does not mint SPL tokens.
- **NFT metadata** — NFT tab currently lists by mint; integrating Metaplex DAS for image / name is a P1.
- **Mobile Wallet Adapter (MWA)** — for native deep-link signing on Android we recommend integrating `@solana-mobile/mobile-wallet-adapter-protocol` once you have a target Phantom Mobile / Solflare flow in mind. Today's Phantom provider works in WebView when Phantom is installed.
- **Watchlists / favorites** — the backend prefs schema already accommodates this; UI is not built yet.
