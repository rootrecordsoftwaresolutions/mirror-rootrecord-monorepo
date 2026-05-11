# Projects in the RootRecord workspace (snapshot)

This page summarizes what typically lives under **`Development/`** when building RootRecord. Paths mirror the internal workspace rules (`Mobile-Development-2026`, `Web-Development-2026`).

## Mobile monorepo (`Mobile/`)

| Path | Project |
|------|---------|
| `weather-manager-mobile/` | Weather Manager — alerts, forecasts, hazard bundles |
| `business-manager-app/` | Business Manager — operations, finance, scheduling |
| `token-manager-app/` | Token Manager — Solana mobile wallet UX |
| `account-hub-app/` | Account Hub — account spine + subscriptions shortcuts |

Shared tooling: **`pnpm`**, staged releases under **`builds/`** per app token.

## Web workspace (`Web/`)

| Path | Project |
|------|---------|
| `cloudflare/rootrecord-primary/` | Primary API Worker (`api.rootrecord.info`) |
| `cloudflare/rootrecord-license/` | Licence / companion auth Worker |
| `cloudflare/rootrecord-app-build/` | App build request Worker |
| `cloudflare/shared/` | Shared Worker TS utilities |
| `main/` | **rootrecord.info** — Cloudflare Pages static site |

**Not a source tree for shipping Solana Tools Next.js** — that lives in **`RootRecord/solana-rootrecord-site`** only.

## This documentation repo (`Doc-Repo/`)

Markdown-only knowledge base you are reading—safe to open-source without application secrets.

## Related reading

- [../06-development/workspace-layout.md](../06-development/workspace-layout.md)
