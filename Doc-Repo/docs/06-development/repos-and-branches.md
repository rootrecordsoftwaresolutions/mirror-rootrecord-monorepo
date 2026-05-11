# Repositories & branches

## Repositories

| Name | Contents |
|------|-----------|
| Mobile-Development-2026 | All RootRecord Android-first apps in one pnpm workspace |
| Web-Development-2026 | Workers, Pages, shared worker libraries |
| RootRecord/solana-rootrecord-site | **Only** shipping Solana Tools Next.js app |

## Branch conventions (Mobile)

- **`main`** — canonical branch.
- **`weather-work`** — feature branch for Weather changes; merge via PR.
- **`business-work`** — feature branch for Business changes; merge via PR.

**Do not** recreate historic `app/*` subtree branch experiments.

## Branch conventions (Web)

Follow each repo’s README; Workers often use **`main`** with PRs for risky changes.

## Commit hygiene

- Keep commits scoped to the app or Worker you are touching.
- Avoid drive-by refactors in unrelated packages.
- Never commit `node_modules`, `.gradle`, `.wrangler`, build artifacts.

## Related reading

- [build-and-release-mobile.md](build-and-release-mobile.md)
- [build-and-deploy-web.md](build-and-deploy-web.md)
