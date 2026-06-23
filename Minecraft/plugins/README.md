# Plugins



Add each Paper plugin as its own subfolder here, for example:



```

plugins/

  earthmc-bridge/

    build.gradle.kts

    src/main/java/...

    src/main/resources/plugin.yml

```



Copy `../plugin-template/` as a starting point, then run from the repo root:



```powershell

.\gradlew.bat :plugins:earthmc-bridge:build

```



Built jars are copied to `Minecraft/out/` and `server/plugins/` (via `deployToServer`).



## Shared config folder



RootRecord Minecraft integration uses **`plugins/RootRecord/`** on the server (one folder, not per-plugin subfolders):



| File | Purpose |

|------|---------|

| `cloud.yml` | Shared API credentials (`server-id`, `server-secret`) |

| `rootmc.yml` | RootMC — server address, heartbeat, MySQL, McMMO, economy, messages |
| `root-rewards.yml` | Root-Rewards — playtime milestones, vote links |
| `root-admin.yml` | Root-Admin — report lookback, cooldown, staff notify |



New plugins should use the `rootrecord-common` module — see [`rootrecord-common/README.md`](rootrecord-common/README.md).



## RootMC (sole RootRecord Paper plugin)



[`rootmc/`](rootmc/) — account linking (`/rootstat`), McMMO + playtime sync, Vault economy, Root Shops sign scans, PlaceholderAPI, Block Notes app heartbeat, and remote jar updates.



Java packages under `com.rootrecord.minecraft.rootstat.*` are internal modules inside this single jar (linking, economy, sync) — not a separate plugin.



```powershell

.\build-with-server-jdk.bat :plugins:rootmc:build

```



Output: `out/rootmc-1.3.0.jar` (also copied to `Desktop/RootMC - Current/plugins/` on build). Ignore `server/host-handoff/plugins/` unless you use it yourself.

### Shop plugin integration (plug-and-play)

RootMC auto-detects **QuickShop / QuickShop-Hikari** and **ChestShop** via reflection (no compile-time dependency). Configure in `rootmc.yml`:

- `economy.shop-provider: auto` — first match in `shop-providers-priority` (default: quickshop → chestshop → sign fallback)
- `merge` — combine all detected providers
- `vault-enabled: true` — Vault balances for net-worth leaderboard

Install Vault + your shop plugin; register the server at rootrecord.info; no extra RootMC shop jar required.

## Root-Rewards

[`root-rewards/`](root-rewards/) — playtime milestone gold (15m → 65536h, doubling each tier) and vote rewards (20G default). Reads playtime from RootMC MySQL (`root_rootmc_playtime`). Requires Root-Essentials economy + NuVotifier/VotifierPlus for vote payouts.

```powershell
.\build-with-server-jdk.bat :plugins:root-rewards:build
```

Commands: `/rewards`, `/vote`, `/rootrewards reload` (op).

## Root-Loans

[`root-loans/`](root-loans/) — personal loans with **10% interest**, income sweep (100% of incoming G while in debt), and gold-ore repayment. Integrates with Root-Essentials via `RootMcLoanService`. Enabled on RootMC after a community vote.

```powershell
.\build-with-server-jdk.bat :plugins:root-loans:build
```

Commands: `/loan take|info|repay|list`, `/rootloans reload` (op). Config: `plugins/RootRecord/root-loans.yml`.

## Root-Contracts

[`root-contracts/`](root-contracts/) — player job escrow in **G** (offer → accept → complete/cancel). Gold is held until the client releases payment or cancels.

```powershell
.\build-with-server-jdk.bat :plugins:root-contracts:build
```

Commands: `/contract offer|accept|complete|cancel|list`, `/rootcontracts reload` (op). Config: `plugins/RootRecord/root-contracts.yml`.

## Root-Announcer

[`root-announcer/`](root-announcer/) — rotating server broadcasts from `plugins/RootRecord/root-announcer.yml`.

```powershell
.\build-with-server-jdk.bat :plugins:root-announcer:build
```

Commands: `/rootannouncer reload`, `/rootannouncer list`, `/rootannouncer now [index]` (aliases: `/rannounce`, `/announce`). Placeholders in lines: `{online}`, `{max}`.

[`root-explore/`](root-explore/) — biome + nearby structure hints via the server's own structure map (same as `/locate`).

```powershell
.\build-with-server-jdk.bat :plugins:root-explore:build
```

Commands: `/explore [on|off|status]` (aliases: `/explorehints`, `/hints`). Config: `plugins/RootRecord/root-explore.yml`.

## Root-Admin

[`root-admin/`](root-admin/) — staff moderation/admin commands (moved out of Root-Essentials) plus `/report <player> [reason]` with last 30 minutes of **reported player** chat, commands, and CoreProtect history.

```powershell
.\build-with-server-jdk.bat :plugins:root-admin:build
```

Requires **Root-Essentials** at runtime. Config: `plugins/RootRecord/root-admin.yml`. Reports saved to `plugins/RootRecord/reports/`. Staff notify permission: `rootadmin.reports.notify`.


