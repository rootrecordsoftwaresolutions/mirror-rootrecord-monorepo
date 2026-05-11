# Solana Jupiter Arb Bot (Python)

Experimental **asyncio** bot that discovers liquid Solana pairs (Dexscreener + optional Birdeye), scans **round-trip** quotes through **Jupiter Swap API** (`/swap/v1` on `lite-api.jup.ag` by default), optionally **simulates** swap transactions, and can send them on-chain with risk gates.

> **HIGH RISK — NOT FINANCIAL ADVICE**  
> You can lose your entire balance to bugs, slippage, MEV, RPC failures, partial fills (leg1 succeeds, leg2 fails), rug liquidity, and contract risk. **Two Jupiter swaps are not atomic** unless you build a single custom transaction (not what this template does). Start with **DRY_RUN=true**, tiny size, and funds you can afford to lose.

## Features

- **Dynamic discovery** (Dexscreener search + optional Birdeye tokenlist) with liquidity / age / volume filters and rotating **watchlist** (20–50 mints).
- **Round-trip arb scan**: `INPUT_MINT → TOKEN → INPUT_MINT` via Jupiter quotes; **net** edge estimate subtracts buffers, price impact, and a rough priority-fee allowance.
- **Execution**: Jupiter `/swap` → sign `VersionedTransaction` → **simulate** both legs → optional **send** (sequential) or optional **Jito bundle** toggle.
- **Risk**: position % of USDC balance, daily loss stop, drawdown stop, RPC error burst stop, token cooldown, max concurrent trades.
- **Monitoring**: Loguru file + stderr; optional **Telegram** + **Discord**; **Rich** console table; optional **FastAPI** `/snapshot` + `/health`.
- **Persistence**: `data/trades.jsonl`, `data/bot_state.json`, `data/blacklist.json`.

## Requirements

- **Python 3.11+**
- A **Solana RPC** URL (paid Helius / QuickNode / RPC Fast recommended for latency).
- For swap simulation / live trading: **wallet** `PRIVATE_KEY` (JSON 64-byte array or base58) and matching `WALLET_ADDRESS` if you want to decouple read-only monitoring.

## Quick setup

```powershell
cd c:\Users\rrdeveloper\Development\solana-arb-bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Environment

1. Copy `.env.example` to `.env` **or** rely on an existing credentials file.

2. By default, `config/settings.py` loads env in this order:

   - `../Web/credentials.env` (under your `Development` tree) — often already defines **`SOLANA_RPC_URL`** (e.g. Helius).  
   - `credentials.env` in this project folder (if present).  
   - `CREDENTIALS_ENV_PATH` if set.  
   - **`.env` in this project last**, with **override=True**, so local secrets (`PRIVATE_KEY`, toggles) win over shared files.

3. **Never commit** `.env`, `Web/credentials.env`, or private keys. Add your trading keys only on the machine that runs the bot.

Minimal recommended variables:

| Variable | Purpose |
|----------|---------|
| `SOLANA_RPC_URL` | Helius / QuickNode / devnet RPC |
| `DRY_RUN` | `true` until you trust the stack |
| `PRIVATE_KEY` | Required when `DRY_RUN=false` (or use `TREASURY_PRIVATE_KEY` / `TREASURY_SECRET_KEY_B58`) |
| `WALLET_ADDRESS` | Optional if derivable from key; or set `TREASURY_WALLET_ADDRESS` |
| `INPUT_MINT` | Mainnet USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `INPUT_DECIMALS` | `6` for USDC |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alerts |
| `DISCORD_WEBHOOK_URL` | Alerts |
| `BIRDEYE_API_KEY` | Improves discovery (optional) |

### Run

```powershell
python main.py
```

- **Console dashboard** (Rich) runs alongside the main loop.  
- Optional HTTP: set `ENABLE_HTTP_DASHBOARD=true` → `http://127.0.0.1:8765/snapshot`.

## Devnet first

1. `SOLANA_RPC_URL=https://api.devnet.solana.com`  
2. `INPUT_MINT` = devnet USDC mint (e.g. Circle’s devnet USDC — verify current mint in [Circle devnet docs](https://developers.circle.com/stablecoins/docs/usdc-on-test-networks)).  
3. Fund devnet wallet + USDC faucet.  
4. Keep `DRY_RUN=true` until simulations succeed consistently.

## Mainnet

1. Use a **paid** RPC; tune `SCAN_INTERVAL_SEC` and discovery filters to respect rate limits.  
2. Set realistic `MIN_PROFIT_NET_PCT` (quotes overstate executable edge).  
3. `DRY_RUN=false` only after: stable sims, alerts wired, and **micro** size (`POSITION_SIZE_PCT`).  
4. Keep **SOL** for fees (priority fees can dominate on contested routes).

## Jupiter rate limits (429)

The free **`lite-api.jup.ag`** tier is strict. The client **serializes** Jupiter HTTP, spaces calls by **`JUPITER_MAX_RPS`** (default **0.4**), **retries** `429`/`503`, and uses conservative **`SCAN_INTERVAL_SEC`** / **`MAX_SCAN_CONCURRENCY`**. Discovery uses **24h volume** when **5m** is zero so major pools still qualify. For heavier scanning, use [Jupiter Pro](https://station.jup.ag/docs/apis/swap-api) (`api.jup.ag` + `JUPITER_API_KEY`) and raise `JUPITER_MAX_RPS` cautiously.

## Profit threshold

`MIN_PROFIT_NET_PCT` **defaults to `0.002`** (~0.2%): opportunities must clear the conservative **net** estimate (`estimate_net_profit_pct`). Set **`0`** only if you want any **gross** paper edge (`out > in`). With **`REFRESH_QUOTES_BEFORE_EXECUTE=true`** (default), the engine re-fetches the full round-trip from Jupiter right before building swap transactions so leg 2 matches fresh routes.

## Optional Binance SOL price (ccxt)

By default **`USE_CCXT_SOL_PRICE=false`**. Turning it on fetches SOL/USDT from Binance for a rough fee heuristic; it is **throttled** (`SOL_PRICE_REFRESH_SEC`, default 120) and **`await exchange.close()`** runs in a `finally` block so resources are released. Leave it off unless you need that hint.

## Jupiter API note

Defaults target **Jupiter hosted Swap API v1** (`https://lite-api.jup.ag/swap/v1`). Jupiter’s routing surface evolves; if quotes fail, check [Jupiter developer docs](https://dev.jup.ag/) and adjust `JUPITER_API_BASE`, `JUPITER_QUOTE_PATH`, and `JUPITER_SWAP_PATH` in `.env`.

## Jito bundles

`USE_JITO_BUNDLE=true` submits two signed txs via the Block Engine JSON-RPC. You still need a **Jito-aware RPC path** for landing behavior; read [Jito docs](https://docs.jito.wtf/). Tips and priority fees are easy to misconfigure — test in dry-run and tiny size.

## Optimization tips (~$80–100)

- Tighten discovery to **SOL/USDC** and a few **high-volume** names first (`SEED_TOKEN_MINTS`).  
- Raise `MIN_LIQUIDITY_USD` and `MIN_VOLUME_5M_USD` to cut junk pairs.  
- Prefer **one concurrent trade** until you measure failure modes.  
- Log everything; compare **quoted** vs **simulated** vs **actual** balances before scaling.

## Backtesting stub

`backtesting/stub.py` can summarize your own `data/trades.jsonl`. There is no free official historical Jupiter quote tape; archive your own quotes if you want serious replay.

## Legal / operational

You are responsible for exchange terms, taxes, licensing, and compliance in your jurisdiction. This repository is a **template** for developers, not a promise of profitability.

## Clearing state

- `data/blacklist.json` — remove mints you blacklisted by mistake.  
- `data/bot_state.json` — reset daily PnL / emergency flags (after fixing root cause).
