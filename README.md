# RootRecord MonoRepo

Single git repo housing every Root Record property: Android (Capacitor) wrappers, Cloudflare Pages web apps, Cloudflare Workers (APIs + utilities), the marketing site, the public Solana tools site, and a few small bots/docs sub-repos.

- Primary branch: `main`
- Repo root: `C:\Users\rrdeveloper\MonoRepo` (Windows dev path)
- Package managers: `pnpm` for Mobile and product web apps, `npm` for Workers, `npm`+`serve` for the marketing site preview.

## Top-level layout

```
MonoRepo/
├── Mobile/                  Android (Capacitor) wrappers + native Kotlin (kilauea)
├── Web/
│   ├── apps/                Product web apps (Cloudflare Pages)
│   ├── cloudflare/          Cloudflare Workers (APIs, license, solana-tx, etc.)
│   ├── main/                Marketing site (rootrecord-website, Pages + Functions)
│   └── scripts/             Shared deploy scripts (Pages helpers, analytics injection)
├── solana-rootrecord-site/  Public Next.js site at solana.rootrecord.info
├── Bots/                    solana-swing-bot / solana-arb-bot
├── Doc-Repo/                Long-form internal docs
├── ebooks/                  Static ebook assets
├── commit-all.bat           Stage + commit + push (user runs)
├── cloudflare-update-all.bat        Workers + Pages deploy wrapper (user runs)
├── cloudflare-update-workers.bat    Workers only (user runs)
├── cloudflare-update-pages.bat      Pages only (user runs)
└── cloudflare-delete-primary.bat    Decommission legacy `rootrecord-primary` Worker (user runs, interactive)
```

## Web End + Graphics Organization Checklist (Marketing Site)

**For `Web/main/` (rootrecord.info marketing site)**

### 1. Core Structure & File Organization
- [ ] Folder layout aligned with `Web/main/`
- [ ] Shared components (nav/footer) — reduce duplication
- [ ] Dead files: `.banner` CSS if unused, legacy files

### 2. HTML Structure & Semantics
- [ ] Consistent DOCTYPE/head, semantic tags
- [ ] Legal dates synced

### 3. CSS & Styling
- [ ] Dark neon theme strong
- [ ] Add hero/image classes as needed

### 4. Functionality & Features
- [ ] Dynamic nav, CTAs, account handoff

### 5. Performance & SEO
- [ ] OG tags, Schema.org, sitemap

### 6-10. (Accessibility, Graphics, etc. — see full version below)

**Full Checklist** maintained in conversation or Doc-Repo for detailed use.

## (rest of original content...)
