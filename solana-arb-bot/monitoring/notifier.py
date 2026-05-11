from __future__ import annotations

import aiohttp
from loguru import logger

from config.settings import Settings


class Notifier:
    """Telegram Bot API + Discord webhook (async, non-blocking failures)."""

    def __init__(self, settings: Settings, session: aiohttp.ClientSession) -> None:
        self._s = settings
        self._session = session

    async def send(self, text: str, *, silent: bool = False) -> None:
        msg = (text or "")[:3900]
        if self._s.telegram_bot_token and self._s.telegram_chat_id:
            await self._telegram(msg, silent)
        if self._s.discord_webhook_url:
            await self._discord(msg)

    async def _telegram(self, text: str, silent: bool) -> None:
        url = f"https://api.telegram.org/bot{self._s.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": self._s.telegram_chat_id,
            "text": text,
            "disable_notification": silent,
        }
        try:
            async with self._session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status != 200:
                    body = await r.text()
                    logger.warning("Telegram HTTP {} {}", r.status, body[:300])
        except Exception as e:  # noqa: BLE001
            logger.warning("Telegram send failed: {}", e)

    async def _discord(self, text: str) -> None:
        try:
            async with self._session.post(
                self._s.discord_webhook_url,
                json={"content": text[:2000]},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if r.status not in (200, 204):
                    logger.warning("Discord webhook HTTP {}", r.status)
        except Exception as e:  # noqa: BLE001
            logger.warning("Discord send failed: {}", e)
