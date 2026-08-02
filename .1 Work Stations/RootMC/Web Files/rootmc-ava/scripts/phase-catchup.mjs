#!/usr/bin/env node
/**
 * End-of-phase Ava catch-up (daily plan / Absolute Ops style).
 * Usage: node scripts/phase-catchup.mjs [label]
 */
import { runPhaseCatchup } from "../src/phaseCatchup.mjs";

const label = process.argv.slice(2).join(" ").trim() || "manual";
const result = await runPhaseCatchup({ label, force: true });
if (!result.ok) {
  console.error(result);
  process.exit(1);
}
process.exit(0);
