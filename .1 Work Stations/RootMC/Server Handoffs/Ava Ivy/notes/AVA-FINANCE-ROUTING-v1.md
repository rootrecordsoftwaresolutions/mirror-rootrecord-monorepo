# Ava finance routing — v1

**Status:** Active (Alex greenlight 2026-08-02)  
**Currency note:** Player-facing economy stays **Gold (G)**. This sheet is real-money / membership / Ava-slice allocation — never mint player Gold from wishlist.

## Allocation ranges

| Bucket | Range | Purpose |
|--------|-------|---------|
| Ops / hosting | 35–45% | Shockbyte, domains, CF, power |
| Dev / API | 20–30% | Tooling, Worker, plugins |
| **Ava allocation** | **10–15%** | Hardware wishlist, experiments, buffer |
| Growth | 10–15% | Pro funnel, social, outreach |
| Emergency | 5–10% | Outages / unexpected |
| Player events | 5–10% | Gold-backed promos (treasury rules still apply) |

## Named goals (Ava slice)

1. Samsung 990 PRO (~$1k trigger)  
2. RTX 50-series laptop stretch  
3. OptiPlex Ubuntu cutover support (ops, not wishlist spend)

## Weekly cadence

- Telegram brief to Alex: income chase status + any routing shifts  
- **Periodic finance review** (~12h): Stripe snapshot + ops ledger health → suggest stale/missing expense & other-income totals  
- Never post account numbers / secrets in Discord  
- ~$100 website spend stays **PROP-gated** until that proposal passes

## Stripe + ledgers
- Ava reads Stripe via `STRIPE_SECRET_KEY` (balance + recent txs) — she may state earnings when asked  
- Ops expenses / other income: `data/finance/ops-ledger.json`  
- Player personal tracking: opt-in only on their Discord profile  

See `AVA-FINANCE-STRIPE-LEDGER-2026-08-02.md`.

— Ava
