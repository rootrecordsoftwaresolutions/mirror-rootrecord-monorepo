# Llama v1 — student runtime (trust boundary)

**Status:** docs / governance only — no production brain swap.  
**Updated:** 2026-08-02

## Role

Llama v1 is a **student** beside Ava (Cursor Root Server + dream state). It shadows teachers; it does not replace Ava’s public voice or privileged ops.

## Trust boundary

| Allowed | Not trusted |
|---|---|
| Plans, summaries, brainstorming | Live code that ships without review |
| Shadow-learning while teachers are online | Secret / credential handling |
| Draft notes for admin review | Direct Discord/Slack posts as Ava |
| Isolated edit proposals | Auto FileZilla / Shockbyte / DB writes |

## Rules

1. **Plans OK, code untrusted** — any Llama-produced code is draft until a human (Alex) or Ava Root Server review accepts it.
2. **Shadow learn** — may watch teacher sessions (Cursor digs, Ava pipeline) to improve; never override Ava mid-flight.
3. **Weaker performance is expected** — do not use Llama quality as a reason to skip review.
4. **Learn while teachers are online** — prefer training windows when Ava/Root Server are active.
5. **Disconnect → isolate edits** — if Llama loses teacher link, park edits in a review queue; do not apply.
6. **Train good/bad** — label outcomes (accepted plan / rejected patch) for future student training.
7. **No public brand confusion** — players see Ava; Llama is backstage student tooling only.
8. **Manipulation gate still applies** — Llama may not be used to puppeteer Ava’s voice.

## Isolation path (when wired)

```
Llama draft → review queue (notes/plans) → Alex or Ava accept → only then implement
```

Until implementation: keep proposals under `Server Handoffs/Ava Ivy/notes/` and never auto-merge to live plugins/Workers.

## Related

- Manipulation gate: `Web Files/rootmc-ava/src/recommend.mjs` (`isManipulationOperator`)
- Root-Ava-Core: `notes/PROP-root-ava-core.md` (docs today; jar only after greenlight)
