"""
Load configuration from environment.

HIGH RISK: Automated trading can lose funds. Never commit PRIVATE_KEY or API keys.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


def _load_env_files() -> None:
    """
    Load shared Development credentials first, then optional extra path, then project-level files.
    Project `.env` is loaded last with override=True so you can layer PRIVATE_KEY / overrides locally.
    """
    here = Path(__file__).resolve()
    project_root = here.parents[1]
    dev_root = here.parents[2]

    shared: list[Path] = [
        dev_root / "Web" / "credentials.env",
        project_root / "credentials.env",
    ]
    extra = os.environ.get("CREDENTIALS_ENV_PATH", "").strip()
    if extra:
        shared.append(Path(extra))
    for p in shared:
        if p.is_file():
            load_dotenv(p, override=False)
    dotenv = project_root / ".env"
    if dotenv.is_file():
        load_dotenv(dotenv, override=True)


_load_env_files()


def _env_first(*names: str) -> str:
    for name in names:
        v = os.environ.get(name, "").strip()
        if v:
            return v
    return ""


@dataclass
class Settings:
    # Solana
    solana_rpc_url: str = field(default_factory=lambda: os.environ.get("SOLANA_RPC_URL", ""))
    commitment: str = field(default_factory=lambda: os.environ.get("COMMITMENT", "confirmed"))
    input_mint: str = field(
        default_factory=lambda: os.environ.get(
            "INPUT_MINT", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        )
    )
    # Treasury-first: set TREASURY_* in .env, or classic PRIVATE_KEY / WALLET_ADDRESS.
    wallet_address: str = field(
        default_factory=lambda: _env_first(
            "WALLET_ADDRESS",
            "TREASURY_WALLET_ADDRESS",
            "TREASURY_ADDRESS",
        )
    )
    private_key: str = field(
        default_factory=lambda: _env_first(
            "PRIVATE_KEY",
            "TREASURY_PRIVATE_KEY",
            "TREASURY_SECRET_KEY_B58",
        )
    )

    # Jupiter
    jupiter_api_base: str = field(
        default_factory=lambda: os.environ.get("JUPITER_API_BASE", "https://lite-api.jup.ag/swap/v1")
    )
    jupiter_quote_path: str = field(default_factory=lambda: os.environ.get("JUPITER_QUOTE_PATH", "/quote"))
    jupiter_swap_path: str = field(default_factory=lambda: os.environ.get("JUPITER_SWAP_PATH", "/swap"))
    jupiter_api_key: str = field(default_factory=lambda: os.environ.get("JUPITER_API_KEY", "").strip())
    # Lite tier is strict; raise RPS only with Jupiter Pro / paid tier.
    jupiter_max_rps: float = field(
        default_factory=lambda: max(0.25, float(os.environ.get("JUPITER_MAX_RPS", "0.4")))
    )
    jupiter_rate_limit_retries: int = field(
        default_factory=lambda: int(os.environ.get("JUPITER_RATE_LIMIT_RETRIES", "8"))
    )

    # Discovery
    birdeye_api_base: str = field(
        default_factory=lambda: os.environ.get("BIRDEYE_API_BASE", "https://public-api.birdeye.so")
    )
    birdeye_api_key: str = field(default_factory=lambda: os.environ.get("BIRDEYE_API_KEY", "").strip())
    dexscreener_api_base: str = field(
        default_factory=lambda: os.environ.get("DEXSCREENER_API_BASE", "https://api.dexscreener.com")
    )
    discovery_interval_sec: float = field(
        default_factory=lambda: float(os.environ.get("DISCOVERY_INTERVAL_SEC", "45"))
    )
    min_liquidity_usd: float = field(
        default_factory=lambda: float(os.environ.get("MIN_LIQUIDITY_USD", "10000"))
    )
    max_pair_age_min: float = field(
        default_factory=lambda: float(os.environ.get("MAX_PAIR_AGE_MIN", "0"))
    )
    min_pair_age_min: float = field(
        default_factory=lambda: float(os.environ.get("MIN_PAIR_AGE_MIN", "5"))
    )
    min_volume_5m_usd: float = field(
        default_factory=lambda: float(os.environ.get("MIN_VOLUME_5M_USD", "2000"))
    )
    watchlist_size: int = field(default_factory=lambda: int(os.environ.get("WATCHLIST_SIZE", "15")))
    seed_token_mints: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            m.strip()
            for m in os.environ.get(
                "SEED_TOKEN_MINTS",
                "So11111111111111111111111111111111111111112,DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            ).split(",")
            if m.strip()
        )
    )

    # Risk
    dry_run: bool = field(default_factory=lambda: os.environ.get("DRY_RUN", "true").lower() in ("1", "true", "yes"))
    # <= 0: trigger on any gross round-trip profit (quote out > in). > 0: require conservative net estimate.
    min_profit_net_pct: float = field(
        default_factory=lambda: float(os.environ.get("MIN_PROFIT_NET_PCT", "0.002"))
    )
    max_slippage_bps: int = field(default_factory=lambda: int(os.environ.get("MAX_SLIPPAGE_BPS", "80")))
    position_size_pct: float = field(
        default_factory=lambda: float(os.environ.get("POSITION_SIZE_PCT", "0.18"))
    )
    daily_max_loss_usd: float = field(
        default_factory=lambda: float(os.environ.get("DAILY_MAX_LOSS_USD", "15"))
    )
    max_concurrent_trades: int = field(
        default_factory=lambda: int(os.environ.get("MAX_CONCURRENT_TRADES", "1"))
    )
    token_cooldown_sec: float = field(
        default_factory=lambda: float(os.environ.get("TOKEN_COOLDOWN_SEC", "120"))
    )
    rpc_error_burst_limit: int = field(
        default_factory=lambda: int(os.environ.get("RPC_ERROR_BURST_LIMIT", "8"))
    )
    drawdown_stop_pct: float = field(
        default_factory=lambda: float(os.environ.get("DRAWDOWN_STOP_PCT", "0.12"))
    )
    estimated_priority_fee_usd: float = field(
        default_factory=lambda: float(os.environ.get("ESTIMATED_PRIORITY_FEE_USD", "0.02"))
    )
    extra_fee_buffer_bps: int = field(
        default_factory=lambda: int(os.environ.get("EXTRA_FEE_BUFFER_BPS", "15"))
    )
    # Re-fetch forward+reverse Jupiter quotes immediately before swap build (reduces stale leg2 sims).
    refresh_quotes_before_execute: bool = field(
        default_factory=lambda: os.environ.get("REFRESH_QUOTES_BEFORE_EXECUTE", "true").lower()
        in ("1", "true", "yes")
    )

    # Scanner (conservative defaults for lite-api Jupiter quota)
    scan_interval_sec: float = field(
        default_factory=lambda: float(os.environ.get("SCAN_INTERVAL_SEC", "10.0"))
    )
    max_scan_concurrency: int = field(
        default_factory=lambda: int(os.environ.get("MAX_SCAN_CONCURRENCY", "1"))
    )

    # Jito
    use_jito_bundle: bool = field(
        default_factory=lambda: os.environ.get("USE_JITO_BUNDLE", "false").lower() in ("1", "true", "yes")
    )
    jito_block_engine_url: str = field(
        default_factory=lambda: os.environ.get(
            "JITO_BLOCK_ENGINE_URL", "https://mainnet.block-engine.jito.wtf/api/v1/bundles"
        )
    )

    # Alerts
    telegram_bot_token: str = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", "").strip())
    telegram_chat_id: str = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID", "").strip())
    discord_webhook_url: str = field(default_factory=lambda: os.environ.get("DISCORD_WEBHOOK_URL", "").strip())

    # Dashboard
    enable_http_dashboard: bool = field(
        default_factory=lambda: os.environ.get("ENABLE_HTTP_DASHBOARD", "false").lower()
        in ("1", "true", "yes")
    )
    dashboard_host: str = field(default_factory=lambda: os.environ.get("DASHBOARD_HOST", "127.0.0.1"))
    dashboard_port: int = field(default_factory=lambda: int(os.environ.get("DASHBOARD_PORT", "8765")))

    # Paths
    trade_log_path: Path = field(
        default_factory=lambda: Path(os.environ.get("TRADE_LOG_PATH", "data/trades.jsonl"))
    )
    blacklist_path: Path = field(
        default_factory=lambda: Path(os.environ.get("BLACKLIST_PATH", "data/blacklist.json"))
    )
    state_path: Path = field(default_factory=lambda: Path(os.environ.get("STATE_PATH", "data/bot_state.json")))

    # Swap build
    jupiter_priority_level: str = field(
        default_factory=lambda: os.environ.get("JUPITER_PRIORITY_LEVEL", "high")
    )
    jupiter_priority_max_lamports: int = field(
        default_factory=lambda: int(os.environ.get("JUPITER_PRIORITY_MAX_LAMPORTS", "800000"))
    )
    input_decimals: int = field(default_factory=lambda: int(os.environ.get("INPUT_DECIMALS", "6")))

    # Optional ccxt Binance SOL/USDT hint for fee heuristics (creates its own aiohttp; keep off unless needed)
    use_ccxt_sol_price: bool = field(
        default_factory=lambda: os.environ.get("USE_CCXT_SOL_PRICE", "false").lower() in ("1", "true", "yes")
    )
    sol_price_refresh_sec: float = field(
        default_factory=lambda: float(os.environ.get("SOL_PRICE_REFRESH_SEC", "120"))
    )

    def validate(self) -> list[str]:
        errors: list[str] = []
        if not self.solana_rpc_url:
            errors.append("SOLANA_RPC_URL is required")
        if not self.dry_run and not self.private_key:
            errors.append("PRIVATE_KEY is required when DRY_RUN=false")
        if self.jupiter_priority_level not in ("medium", "high", "veryHigh"):
            errors.append("JUPITER_PRIORITY_LEVEL must be medium|high|veryHigh")
        return errors

    @property
    def jupiter_quote_url(self) -> str:
        base = self.jupiter_api_base.rstrip("/")
        path = self.jupiter_quote_path if self.jupiter_quote_path.startswith("/") else f"/{self.jupiter_quote_path}"
        return f"{base}{path}"

    @property
    def jupiter_swap_url(self) -> str:
        base = self.jupiter_api_base.rstrip("/")
        path = self.jupiter_swap_path if self.jupiter_swap_path.startswith("/") else f"/{self.jupiter_swap_path}"
        return f"{base}{path}"


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings_for_tests() -> None:
    global _settings
    _settings = None
