# RootMC Discord — Town & Nation channels

Automated town/nation Discord channels for the RootMC guild (`1516108585740800042`).

## Categories

| Type | Category ID |
|------|-------------|
| Towns | `1516282271848726628` |
| Nations | `1516283613283483749` |

## Channels

| Channel | ID | Use |
|---------|-----|-----|
| `#general-chat` | `1516108586307158088` | Community chat; app support deep-link |
| `#ingame-chat` | `1516706598519832677` | In-game global chat bridge (RootMC ↔ RootMC bot) |
| `#bot-spam` | `1516391754625187921` | Misc automated bot posts |
| Daily summary | `1516395175780286615` | Midnight HST combined category reports |
| Town general info | `1516282373426249878` | Town founded / fallen announcements |
| Nation general info | `1516283667364974602` | Nation founded / fallen announcements |

Optional archive categories (legacy — channels are **deleted** on fall, not archived):

- `DISCORD_ROOTMC_TOWN_ARCHIVE_CATEGORY_ID` (unused)
- `DISCORD_ROOTMC_NATION_ARCHIVE_CATEGORY_ID` (unused)

## How it works

1. **RootMC plugin** reads Towny towns/nations each sync (~5 min) and POSTs to `POST /api/rootmc/towny/sync`.
2. **rootmc-api** (`api.rootmc.net`) stores snapshots in D1 (`rootmc_towny_*` tables).
3. **Cron** (`*/10 * * * *`) + each Towny sync runs channel reconcile:
   - New town → channel under **Towns** category (`1516282271848726628`), sorted by resident count.
   - New nation → channel under **Nations** category (`1516283613283483749`), sorted by town count.
   - Mayor / nation leader gets a **DM with invite link** if their Minecraft UUID is linked to RootRecord **and** Discord (`/rootmc link` + Account Hub Discord link).
   - Town/nation removed from Towny → **Discord channel deleted** (mapping row removed from D1).
   - **Founded / fallen** → announcement in town general info (`1516282373426249878`) / nation general info (`1516283667364974602`); founded posts include a link to the new channel (deduped in D1).

## In-game chat bridge

Global in-game chat ↔ `#ingame-chat` (`1516706598519832677`):

1. **RootMC** (`discord-chat.enabled: true`) relays player chat to `POST /api/rootmc/ingame-chat`.
2. **Worker** posts as the RootMC bot (`DISCORD_ROOTMC_INGAME_CHAT_CHANNEL_ID`).
3. **Poll** (`GET /api/rootmc/ingame-chat/poll`) every ~3s returns new Discord messages → broadcast in-game as `[Discord] User: message`.

Bot needs **Read Message History** in `#ingame-chat`. On first start the plugin seeds the cursor (no backlog flood).

## Bot requirements

RootMC bot (`DISCORD_ROOTMC_BOT_TOKEN`) needs in the guild:

- Manage Channels
- View Channel, Send Messages
- Create Instant Invite
- Manage Permissions (for private town/nation channels)

Re-invite with elevated permissions if channel create fails:

```text
node Web/cloudflare/rootmc-realm-api/scripts/discord-register-rootmc-commands.mjs
```

## Deploy checklist

1. Apply D1 migration `0088_rootmc_discord_towny.sql` (`d1-apply-remote.ps1` via rootmc deploy).
2. Deploy **`rootmc-api`**: `powershell -File Web\cloudflare\rootmc-api\deploy.ps1` (cron + routes).
3. Deploy updated `rootmc` jar with Towny snapshot push.
4. Create `#town-archive` / `#nation-archive` categories in Discord (optional — no longer used; channels delete on fall).

## Daily status report

At **midnight HST** (`0 10 * * *` UTC) the RootMC Worker posts **nine isolated category reports** to the **daily summary** channel (`1516395175780286615`):

| Category | Focus |
|----------|--------|
| Playerbase | Linked accounts, playtime leaders, sync health |
| Economy | Net worth, balances, wealth leaders |
| mcMMO | Power-level rankings |
| Discord | Guild activity, top channels |
| Towns | Active towns, mayors, residents |
| Nations | Active nations, leaders |
| Items | Server-wide item quantities |
| Shops | Active listings |
| Prices | Average shop prices, sample depth |

Each category gets its own Grok brief + data appendix embed. Deduped in D1 (`0092_rootmc_daily_category_reports.sql`).

**Grok setup**

1. Add `GROK_API_BEARER_TOKEN` or `GROK_API_KEY` to repo-root `credentials.env` (same key as Kilauea/Goals).
2. Deploy **`rootmc-api`** — `deploy.ps1` uploads the secret automatically.
3. Apply D1 migrations `0089_rootmc_daily_reports.sql` and `0090_rootmc_daily_reports_grok.sql`.

**Discord setup**

1. Channel: daily summary — `1516395175780286615` (`DISCORD_ROOTMC_DAILY_REPORT_CHANNEL_ID` in `wrangler.toml`).
2. Redeploy Worker after config changes.
3. RootMC bot needs **Send Messages** + **Embed Links** in that channel.

## Player requirements

- Mayor / nation leader: link Minecraft (`/rootmc link`) **and** link Discord in Account Hub so the bot can DM the invite.
