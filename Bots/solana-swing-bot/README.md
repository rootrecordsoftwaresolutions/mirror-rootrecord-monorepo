# solana-swing-bot

Separate from **`solana-arb-bot`**: a small **directional** experiment on Solana using the **same env layering** (`Development/Web/credentials.env` then project **`.env`**) and the **same wallet** if you point `PRIVATE_KEY` / `WALLET_ADDRESS` at it.

## What it does

- Every **`SWING_LOOP_INTERVAL_SEC`** pulls a **Jupiter quote** (default USDC → SOL) for a tiny **price probe** and turns that into a **USDC-per-SOL** series.
- Runs a **dual moving-average crossover** (`SWING_FAST_SMA` / `SWING_SLOW_SMA`).
- **BUY**: reads **USDC SPL balance**, then swaps **`SWING_POSITION_PCT_OF_USDC`** of that (e.g. `0.02` = 2%), clamped between **`SWING_POSITION_MIN_USDC`** and **`SWING_POSITION_MAX_USDC`**, and **never more than the wallet** (default SOL route: USDC → SOL).
- **SELL**: reads **native SOL lamports**, subtracts **`SWING_SOL_RESERVE_LAMPORTS`**, then swaps **`SWING_SELL_PCT_OF_SOL`** of that spendable amount to USDC (`1.0` = all spendable). **Only automated for SOL** as `SWING_QUOTE_MINT`. Other mints log a warning on SELL until you extend the bot.

State is persisted in **`data/swing_state.json`** (`in_position`) so a restart does not forget an open long.

Each tick logs **`Planned move — …`**: whether you are warming up MAs, flat and waiting for a golden cross, or long and waiting for a death cross (plus MA levels). When a signal fires you also get **`Executing planned move: BUY/SELL`** right before the swap path runs.

### Priority / “gas” on Jupiter swaps

Jupiter’s UI “fee” mixes **base transaction rent/CU** and **optional priority tip**. This bot sends **`prioritizationFeeLamports.priorityLevelWithMaxLamports`**. By default it uses **`SWING_JUPITER_PRIORITY_LEVEL=medium`** and **`SWING_PRIORITY_MAX_LAMPORTS=100000`** (~**0.0001 SOL** tip ceiling) so you do not inherit a huge **`JUPITER_PRIORITY_MAX_LAMPORTS`** from a shared `credentials.env` meant for the arb bot. Raise cautiously if txs land slowly in congestion; lower further (e.g. `50000`) if you still see more tip than you want. Each swap logs the cap at **INFO**.

## Risk

This is **not** arbitrage: you can **lose** to trend, fees, slippage, Jupiter **429**, bad parameters, and bugs. **`DRY_RUN=true`** simulates swaps (needs **`PRIVATE_KEY`** for signature verification) but does not send.

## Setup

```bash
cd solana-swing-bot
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Ensure SOLANA_RPC_URL and signing material: Web/credentials.env, and/or sibling solana-arb-bot/.env (auto-loaded), and/or swing .env
python main.py
```

**Keys:** With default **`SWING_LOAD_ARB_DOTENV=true`**, `Development/solana-arb-bot/.env` is loaded **before** `solana-swing-bot/.env` (both respect earlier vars unless swing `.env` overrides). So **`PRIVATE_KEY` can live only in the arb bot `.env`** and swing live mode still starts. Set **`SWING_LOAD_ARB_DOTENV=false`** if you must isolate envs.

Tune MAs, loop interval, and position size in `.env`. When satisfied with sims, **`DRY_RUN=false`** only with capital you accept losing.

## Relation to solana-arb-bot

- **Independent codebase** — run one or the other (or both in separate terminals); watch **Jupiter rate limits** if both hit lite-api.
- **No shared Python package** — duplicate signing/RPC helpers on purpose so each project stays self-contained.
