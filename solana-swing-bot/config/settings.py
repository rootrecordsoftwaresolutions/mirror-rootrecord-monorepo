"""Swing bot configuration — same env layering as solana-arb-bot (Web/credentials.env + .env)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def _load_env_files() -> None:
    here = Path(__file__).resolve()
    project_root = here.parents[1]
    dev_root = here.parents[2]
    shared = [dev_root / "Web" / "credentials.env", project_root / "credentials.env"]
    extra = os.environ.get("CREDENTIALS_ENV_PATH", "").strip()
    if extra:
        shared.append(Path(extra))
    for p in shared:
        if p.is_file():
            load_dotenv(p, override=False)
    # Same monorepo layout as solana-arb-bot: reuse wallet/RPC from sibling .env without copying secrets.
    if os.environ.get("SWING_LOAD_ARB_DOTENV", "true").lower() in ("1", "true", "yes"):
        arb_dotenv = dev_root / "solana-arb-bot" / ".env"
        if arb_dotenv.is_file():
            load_dotenv(arb_dotenv, override=False)
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
    solana_rpc_url: str = field(default_factory=lambda: os.environ.get("SOLANA_RPC_URL", ""))
    commitment: str = field(default_factory=lambda: os.environ.get("COMMITMENT", "confirmed"))

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

    # USDC (6 dec) used to price and to buy SOL
    base_mint: str = field(
        default_factory=lambda: os.environ.get(
            "SWING_BASE_MINT", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        )
    )
    # Asset to swing (default wrapped SOL)
    quote_mint: str = field(
        default_factory=lambda: os.environ.get(
            "SWING_QUOTE_MINT", "So11111111111111111111111111111111111111112"
        )
    )
    base_decimals: int = field(default_factory=lambda: int(os.environ.get("SWING_BASE_DECIMALS", "6")))
    quote_decimals: int = field(default_factory=lambda: int(os.environ.get("SWING_QUOTE_DECIMALS", "9")))

    jupiter_api_base: str = field(
        default_factory=lambda: os.environ.get("JUPITER_API_BASE", "https://lite-api.jup.ag/swap/v1")
    )
    jupiter_quote_path: str = field(default_factory=lambda: os.environ.get("JUPITER_QUOTE_PATH", "/quote"))
    jupiter_swap_path: str = field(default_factory=lambda: os.environ.get("JUPITER_SWAP_PATH", "/swap"))
    jupiter_api_key: str = field(default_factory=lambda: os.environ.get("JUPITER_API_KEY", "").strip())
    jupiter_max_rps: float = field(
        default_factory=lambda: max(0.2, float(os.environ.get("JUPITER_MAX_RPS", "0.35")))
    )
    jupiter_rate_limit_retries: int = field(
        default_factory=lambda: int(os.environ.get("JUPITER_RATE_LIMIT_RETRIES", "6"))
    )
    max_slippage_bps: int = field(default_factory=lambda: int(os.environ.get("MAX_SLIPPAGE_BPS", "80")))
    # Priority fee: swing-specific vars override generic JUPITER_* (so shared credentials.env can stay aggressive for arb).
    # Defaults keep tips small (~0.0001 SOL max tip cap at medium; total tx $ still includes base fee + route).
    jupiter_priority_level: str = field(
        default_factory=lambda: (
            os.environ.get("SWING_JUPITER_PRIORITY_LEVEL", "").strip()
            or os.environ.get("JUPITER_PRIORITY_LEVEL", "").strip()
            or "medium"
        )
    )
    jupiter_priority_max_lamports: int = field(
        default_factory=lambda: int(
            os.environ.get("SWING_PRIORITY_MAX_LAMPORTS", "").strip()
            or os.environ.get("JUPITER_PRIORITY_MAX_LAMPORTS", "").strip()
            or "100000"
        )
    )

    dry_run: bool = field(
        default_factory=lambda: os.environ.get("DRY_RUN", "true").lower() in ("1", "true", "yes")
    )

    loop_interval_sec: float = field(
        default_factory=lambda: float(os.environ.get("SWING_LOOP_INTERVAL_SEC", "60"))
    )
    fast_sma: int = field(default_factory=lambda: int(os.environ.get("SWING_FAST_SMA", "12")))
    slow_sma: int = field(default_factory=lambda: int(os.environ.get("SWING_SLOW_SMA", "26")))
    price_probe_usdc: float = field(
        default_factory=lambda: float(os.environ.get("SWING_PRICE_PROBE_USDC", "1.0"))
    )

    # BUY size: fraction of current USDC balance (after min/max clamp, never above wallet).
    position_pct_of_usdc: float = field(
        default_factory=lambda: float(os.environ.get("SWING_POSITION_PCT_OF_USDC", "0.02"))
    )
    position_min_usdc: float = field(
        default_factory=lambda: float(os.environ.get("SWING_POSITION_MIN_USDC", "5"))
    )
    position_max_usdc: float = field(
        default_factory=lambda: float(os.environ.get("SWING_POSITION_MAX_USDC", "100"))
    )
    # SELL: fraction of (native SOL lamports − reserve); 1.0 = sell all spendable.
    sell_pct_of_spendable_sol: float = field(
        default_factory=lambda: float(os.environ.get("SWING_SELL_PCT_OF_SOL", "1.0"))
    )

    # Native SOL lamports to keep when selling quote asset (fees + buffer)
    sol_reserve_lamports: int = field(
        default_factory=lambda: int(os.environ.get("SWING_SOL_RESERVE_LAMPORTS", "25000000"))
    )

    state_path: Path = field(default_factory=lambda: Path(os.environ.get("SWING_STATE_PATH", "data/swing_state.json")))

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


def get_settings() -> Settings:
    s = Settings()
    if not s.solana_rpc_url:
        raise ValueError("SOLANA_RPC_URL is required")
    if s.fast_sma >= s.slow_sma:
        raise ValueError("SWING_FAST_SMA must be less than SWING_SLOW_SMA")
    if s.jupiter_priority_level not in ("medium", "high", "veryHigh"):
        raise ValueError("SWING_JUPITER_PRIORITY_LEVEL / JUPITER_PRIORITY_LEVEL must be medium|high|veryHigh")
    if s.jupiter_priority_max_lamports < 0 or s.jupiter_priority_max_lamports > 5_000_000:
        raise ValueError("SWING_PRIORITY_MAX_LAMPORTS / JUPITER_PRIORITY_MAX_LAMPORTS must be 0..5_000_000 lamports")
    if not s.dry_run and not s.private_key:
        raise ValueError(
            "PRIVATE_KEY (or TREASURY_PRIVATE_KEY / TREASURY_SECRET_KEY_B58) is required when DRY_RUN=false. "
            "Put it in Development\\Web\\credentials.env, solana-arb-bot\\.env (loaded by default as sibling), "
            "or solana-swing-bot\\.env — or set DRY_RUN=true. "
            "Disable sibling load with SWING_LOAD_ARB_DOTENV=false."
        )
    if not s.wallet_address and not s.private_key:
        raise ValueError("Set WALLET_ADDRESS and/or PRIVATE_KEY for Jupiter userPublicKey / signing")
    if not (0.0 < s.position_pct_of_usdc <= 1.0):
        raise ValueError("SWING_POSITION_PCT_OF_USDC must be in (0, 1], e.g. 0.02 for 2%")
    if s.position_min_usdc <= 0 or s.position_max_usdc < s.position_min_usdc:
        raise ValueError("SWING_POSITION_MIN_USDC / MAX_USDC invalid")
    if not (0.0 < s.sell_pct_of_spendable_sol <= 1.0):
        raise ValueError("SWING_SELL_PCT_OF_SOL must be in (0, 1], e.g. 1.0 for full spendable")
    return s
