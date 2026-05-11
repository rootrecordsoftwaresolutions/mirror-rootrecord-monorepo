# Domains & URLs

Canonical endpoints you can rely on when explaining RootRecord to users or wiring integrations.

| Surface | URL | Notes |
|---------|-----|--------|
| **Marketing site** | `https://rootrecord.info` | Cloudflare Pages (`Web/main/`) |
| **Primary API** | `https://api.rootrecord.info` | Worker `rootrecord-primary` |
| **Solana Tools (public)** | `https://solana.rootrecord.info` | Next.js app from **`RootRecord/solana-rootrecord-site`** only |

## Deep links & app schemes

Mobile apps may register **custom URL schemes** (e.g. `weathermanager://`, `businessmanager://`) for Account Hub → app handoff, with store fallbacks.

## Site config pattern

Marketing Pages expose **`/api/site-config`** so the front-end learns **`ROOTRECORD_API_BASE`** (and related flags) without hardcoding secrets.

## What not to do

- Do not teach users to trust random mirrors or **unofficial** GitHub forks for downloads—point to **official** releases and stores linked from rootrecord.info.

## Related reading

- [marketing-website.md](../02-products/marketing-website.md)
- [solana-tools-site.md](../05-solana/solana-tools-site.md)
