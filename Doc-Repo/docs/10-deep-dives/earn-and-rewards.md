# Earn & rewards (high level)

Multiple apps read **`/api/earn/summary`**-style routes to show a **points or token balance** snapshot. The exact economics (what actions earn, conversion, withdrawal) are **product decisions** that may change—teach users to read **in-app legal/help** for authoritative rules.

## Implementation hints (engineering)

- Ledger routes (`handleRewardsLedgerV1`) expose historical rows where enabled.
- Custodial SPL mechanics may involve treasury keys—only ops-savvy engineers touch those paths.

## Compliance framing

Avoid promising yields. Use “rewards program” language unless legally cleared as investment advice.

## Related reading

- [internal-vs-external-solana.md](internal-vs-external-solana.md)
