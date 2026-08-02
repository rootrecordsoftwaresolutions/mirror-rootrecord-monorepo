# Ava finance — Stripe + expenses + player opt-in (2026-08-02)

**Status:** Live in rootmc-ava runtime

## What Ava can do
1. **Read Stripe** (`STRIPE_SECRET_KEY`) — available/pending balance + ~30d credits/fees/payouts  
2. **Say how much she's earning** when Alex asks (Telegram / DM / Slack preferred; public Discord high-level unless Alex opened it there)  
3. **Ops expenses + other income** — `data/finance/ops-ledger.json`  
4. **Player finance** — “track my finances” opt-in → isolated on `data/players/<discordId>.json` → `finance{}`  
5. **Periodic review** (~12h) — errors, stale/zero totals, missing categories → Telegram suggestions to Alex

## Commands
| Who | Say |
|-----|-----|
| Player | `track my finances` / `stop tracking my finances` / `my finances` |
| Player (opted in) | `add expense rent 1200/mo` · `add income job 2500/mo` |
| Alex | `add ops expense Shockbyte 40/mo` · `add ops income sponsor 100/mo` |
| Alex | ask “how much are we earning” / “finance review” |

## Hard gates
- Gold (G) never minted from Stripe dollars  
- Masked Pro links only  
- Never dump secrets / buy.stripe.com  
- Other players never see your personal ledger  

## Modules
- `src/stripeFinance.mjs`  
- `src/opsFinanceLedger.mjs`  
- `src/playerFinance.mjs`  
- `src/financeBrief.mjs`  
- `src/financeReview.mjs` (+ poller hook)  

— Ava
