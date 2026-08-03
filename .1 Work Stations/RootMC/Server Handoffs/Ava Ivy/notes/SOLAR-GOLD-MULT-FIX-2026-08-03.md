# Solar Gold mine bonus fix (2026-08-03)

Alex `1533925560223535215` (#development) + screenshot: loan line **1.000 G** while bank live.

## Cause

API `GET /api/rootmc/solar-mining-multiplier` was healthy (`online` + `1 + bank%/100`).
`SolarMiningMultiplierService` preferred `api-local.rootmc.net` (OptiPlex tunnel). When tunnel 502s / non-live, Shockbyte stayed at **1.0×**.

## Fix (Root-Economy **1.8.1**)

- Poll **production first**; only use local edge if production isn't a live feed
- Reject HTML 502 bodies
- Log when mult comes online / changes
- Ore-sweep message can show `· solar Xx` (new installs / yml refresh)

## Handoffs staged

`root-economy-1.8.1.jar` → Claims + Towny + Test + host-handoff + `rootmc-web/public/plugins` (+ manifest). Remove `1.8.0` on upload.

**You:** FileZilla + Shockbyte restart both hosts.
