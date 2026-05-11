# API & services overview

RootRecord’s **central production API** is served at:

**`https://api.rootrecord.info`**

The implementation is a **Cloudflare Worker** named **`rootrecord-primary`** (source path: `Web/cloudflare/rootrecord-primary` in the web workspace).

## What the primary Worker does (high level)

Routing is centralized in `router.ts`. Major families include:

| Area | Examples |
|------|-----------|
| **Auth & account** | Login, signup, `/auth/me`, session resolution, password flows, account deletion |
| **Billing** | Stripe checkout creation |
| **Weather** | Alerts, forecast, current conditions, hazard bundles (NOAA-related crons), environmental feeds |
| **Business mobile** | Business-owned data routes + entitlement glue |
| **Earn** | Rewards summaries, ledger routes |
| **Push / prefs** | FCM-backed push endpoints, user preferences |
| **Solana-related** | Custodial wallet plumbing, treasury proxies, Solana site logging, linked wallets, forwarding to Solana Tools API origin |
| **Ops** | Internal admin routes (guarded by secrets), mobile version floor policy, developer messages |

Exact paths evolve—**read `router.ts`** when integrating a new client.

## Companion services

- **`rootrecord-license`** — Legacy/companion licence Worker; marketing site historically integrates via configured API base.
- **`rootrecord-app-build`** — Handles app build request form posts from Pages.
- **`rootrecord-solana-tx`** — Referenced for treasury / scheduled Solana operations (URL in env `ROOTRECORD_SOLANA_TX_URL`).

## Design pattern: one HTTP entry, many subsystems

The Worker is a **single fetch handler** with:

- CORS handling for browser clients
- Path normalization (including repeated `/api` prefix cleanup for robustness)
- Observability hooks (request logging, error persistence to D1)

## Related reading

- [cloudflare-workers.md](cloudflare-workers.md)
- [data-and-storage.md](data-and-storage.md)
- [../04-accounts/authentication.md](../04-accounts/authentication.md)
