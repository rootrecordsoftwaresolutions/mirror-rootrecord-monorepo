# Delta 2-B off-circuit (Alex 2026-08-02)

**Channel:** `#random-facts` · msg `1533610461264613396`

**Lock:** Delta 2-B (SOC ~99%, out ~7W, solar 0W) is **not on our circuit**, will not run out for Root Server load, **can disconnect**.

## Runtime
- `ECO_OFF_CIRCUIT_SNS` / `isEcoOffCircuit` in `ecoflow.mjs`
- Excluded from site bank mood avg + site solar totals
- Still listed in power reports as **off-circuit**
- On-circuit bank: cucumbers + shackas
