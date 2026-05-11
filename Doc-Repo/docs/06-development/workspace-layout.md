# Workspace layout (Mobile + Web)

The **Development** workspace typically contains **two git roots** (do not assume a single monorepo):

| Repo | Role |
|------|------|
| **Mobile-Development-2026** | pnpm monorepo: Weather, Business, Token Manager, Account Hub, shared packages |
| **Web-Development-2026** | Cloudflare Workers (`rootrecord-primary`, `rootrecord-license`, shared libs), marketing Pages (`Web/main/`), Solana **notes** (not the shipping Next app source) |

## Mobile paths (typical)

- `weather-manager-mobile/` — Weather app
- `business-manager-app/` — Business Manager
- `token-manager-app/` — Token Manager
- `account-hub-app/` — Account Hub
- `builds/` — Staged release APK/AAB outputs per app token

## Web paths (typical)

- `cloudflare/rootrecord-primary/` — **Canonical** primary Worker
- `cloudflare/shared/` — Shared TS modules
- `main/` — rootrecord.info Pages site

## Solana site source

The **Next.js Solana Tools app** is **not** “just another folder” here—clone **`RootRecord/solana-rootrecord-site`** separately.

## Mental map

```
Users → rootrecord.info / Play Store / solana.rootrecord.info
          ↓                      ↓
    Pages + account.js     Mobile apps (Capacitor)
          ↓                      ↓
        licence / API ←──── api.rootrecord.info (primary Worker)
```

## Related reading

- [repos-and-branches.md](repos-and-branches.md)
