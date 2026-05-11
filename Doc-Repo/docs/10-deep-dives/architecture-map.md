# Architecture map

High-level system relationships. For authoritative route lists, read **`router.ts`** in `rootrecord-primary`.

```mermaid
flowchart TB
  subgraph clients [Clients]
    BM[Business Manager Android]
    WM[Weather Manager]
    TM[Token Manager]
    AH[Account Hub]
    WEB[rootrecord.info Pages]
    SOL[solana.rootrecord.info Next.js]
  end

  subgraph cf [Cloudflare]
    API[api.rootrecord.info — primary Worker]
    LIC[rootrecord-license Worker]
    PAGES[Pages — static site]
    D1[(D1 SQLite)]
  end

  subgraph external [External]
    STRIPE[Stripe]
    RPC[Solana RPC]
    PROV[Weather providers]
  end

  BM --> API
  WM --> API
  TM --> API
  AH --> API
  WEB --> LIC
  WEB --> PAGES
  API --> D1
  API --> STRIPE
  API --> PROV
  API --> RPC
  SOL --> API
```

**Legend:** Arrows are logical dependencies, not every HTTP call. Solana Tools may also call Vercel-hosted APIs directly for Next-specific routes, while Worker forwards some paths.

## Related reading

- [../03-platform/api-overview.md](../03-platform/api-overview.md)
