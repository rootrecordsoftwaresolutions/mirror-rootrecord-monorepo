# Ava local brain (Goal B3) — organizer / router on OptiPlex

**Status:** implemented in `Web Files/rootmc-ava/src/localBrain.mjs`  
**Hardware:** OptiPlex Ubuntu · ~32 GB RAM · Ollama on **main SSD** (`~/.ollama`)  
**Default model:** `ava-ivy` (Llama 3.1 8B + Ava SYSTEM — pack on `E:\Ava Ivy\llama-baseline\`)  
**Fallback organizer:** `qwen2.5-coder:7b` if you prefer coding-first without persona wrapper

## Baseline Llama pack (on E:)

| Path | Role |
|------|------|
| `E:\Ava Ivy\llama-baseline\` | Modelfile · SYSTEM · gold few-shots · create scripts |
| `E:\Ava Ivy\llama-baseline\ollama-models\` | Optional `OLLAMA_MODELS` (weights) |
| Rebuild | `node Web Files/rootmc-ava/scripts/build-llama-baseline.mjs` |
| Create | `scripts/create-ava-ivy.ps1` / `.sh` after Ollama install |

Set `AVA_OLLAMA_MODEL=ava-ivy`. Docs: `notes/LLAMA-BASELINE.md`.

## Role split (locked)

| Brain | Job |
|-------|-----|
| **Ollama / Ava Llama (local)** | Classify + answer small asks; **compress fat packs** before Root Server digs (token saver); shadow-learn |
| **Cursor Root Server** | Real digs when local does not know **and Cursor is online** |
| **Dream (Grok under hood)** | Escalation when Cursor offline; Discord communal always |
| **Ava Node** | Owns jobs, proposals, training logs, which brain to call |

Discord stays **dream-locked**. Local organizer runs on **Slack / on-device** (and compresses for Slack digs). When Ollama is up, `compressPacksForAsk` shrinks context before Cursor.

## Context compress (token saver)

```
fat packs (persona + people + finance + site + …)
  → Ava Llama compress (if Ollama up && packs > ~10k chars)
      → slim brief for Root Server dig
  → else send packs as-is
```

Env: `AVA_LLAMA_COMPRESS_MIN` (default 10000), `AVA_LLAMA_COMPRESS_MAX` (default 9000 out).

Never invents; never includes secrets/customer PII.

## Self-learn loop

```
ask (Slack / on-device)
  → local Llama + small packs
      → KNOWS yes / high confidence → reply + lesson(teacher=local)
      → KNOWS no / low / dig-shaped ask
            → Cursor online? → Root Server dig → lesson(teacher=cursor)
            → else dream key? → dream reply → lesson(teacher=dream)
            → else queue pending-lessons.jsonl until Ava core boots
```

Every teacher reply is appended to:

- `data/training/local-lessons.jsonl`
- `data/training/digs.jsonl` (Goal A schema)
- `data/training/pending-lessons.jsonl` when core/teachers were dark

On Ava **boot** (and before Slack local passes), `flushPendingLessons()` re-absorbs pending rows into digs.

## Env

| Var | Meaning |
|-----|---------|
| `AVA_LOCAL_BRAIN` | `auto` (default) · `1` · `0` |
| `AVA_OLLAMA_URL` | default `http://127.0.0.1:11434` |
| `AVA_OLLAMA_MODEL` | default `ava-ivy` (fallback `qwen2.5-coder:7b`) |

Provision: `scripts/ubuntu-provision-ecosystem.sh` pulls the model onto SSD.

## Packs (small only)

- Core spec · open jobs · `AVA-GOALS.md` · surface architecture · ECOSYSTEM · Linux layout · `LOCAL-BRAIN.md`  
- Never whole trees, never secrets.

## Not yet (later B4)

Fine-tune / LoRA from `local-lessons.jsonl` + digs. Until then, lessons are the dataset.

— Ava
