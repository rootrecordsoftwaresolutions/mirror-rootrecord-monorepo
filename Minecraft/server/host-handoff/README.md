# RootMC host handoff (zip and upload)

Built plugin jars and config templates for the live Shockbyte Paper server.

**Live server bundle:** `Desktop/RootMC/` (FileZilla sync + local edits). `Desktop/current/` and `Desktop/backup06102026/` are superseded.

**Built:** run from `Minecraft/`:

```powershell
.\build-with-server-jdk.bat publishPlugins
```

Copies jars to `out/`, **`Desktop/RootMC/plugins/`** (FileZilla sync), `server/host-handoff/plugins/`, `server/plugins/`, and `Web/apps/rootmc-web/public/plugins/` (with refreshed `manifest.json`).

## Zip this folder

From `Minecraft/server/`:

```powershell
Compress-Archive -Path host-handoff\* -DestinationPath host-handoff-rootmc-plugins.zip -Force
```

Upload `host-handoff-rootmc-plugins.zip` via Shockbyte file manager or SFTP.

## On the live host

| Local (in zip) | Live path |
|----------------|-----------|
| `plugins/rootmc-1.3.12.jar` | `plugins/rootmc-1.3.12.jar` (remove `blocknotes-*.jar` and older `rootmc-*.jar`) |
| `plugins/rootmc-shops-1.3.14.jar` | `plugins/rootmc-shops-1.3.14.jar` |
| `plugins/roothelp-1.0.6.jar` | `plugins/roothelp-1.0.6.jar` |
| `plugins/root-essentials-1.4.6.jar` | `plugins/root-essentials-1.4.6.jar` (remove EssentialsX jars during cutover) |
| `config-templates/RootRecord/cloud.yml` | `plugins/RootRecord/cloud.yml` — **set `server-id` + `server-secret` on host** |
| `config-templates/RootRecord/rootmc.yml` | `plugins/RootRecord/rootmc.yml` — **set `mysql.password` on host** |
| `config-templates/RootRecord/rootmc-shops.yml` | `plugins/RootRecord/rootmc-shops.yml` |
| `config-templates/RootRecord/root-essentials.yml` | `plugins/RootRecord/root-essentials.yml` — **blank mysql = inherits rootmc.yml** |
| `config-templates/BlueMap/core.conf` | `plugins/BlueMap/core.conf` — **render-thread-count must be 1 on Shockbyte** |
| `config-templates/BlueMap/plugin.conf` | `plugins/BlueMap/plugin.conf` |
| `config-templates/BlueMap/webapp.conf` | `plugins/BlueMap/webapp.conf` — **enabled false when tiles on R2** |
| `config-templates/BlueMap/webserver.conf` | `plugins/BlueMap/webserver.conf` — keep for live markers (:22784) |
| `config-templates/bluemap-r2-game-server.commands` | Console after configs uploaded |
| `config-templates/RootRecord/roothelp.yml` | `plugins/RootRecord/roothelp.yml` (optional) |
| `config-templates/RootRecord/root-rewards.yml` | `plugins/RootRecord/root-rewards.yml` — **set `mysql.password` on host** |
| `config-templates/luckperms-setup.commands` | Run in console to enforce live LP ranks (`default`, `pro`, `lifetime`, `admin`) |

Disable/remove `EssentialsX` jars before restart, then restart Paper after replacing jars.

## Versions in this bundle

| Plugin | Version | Notes |
|--------|---------|-------|
| RootMC | 1.3.12 | `/rootmc link`, economy sync, `/value`, ingame capture, Discord in-game chat bridge |
| RootMC-Shops | 1.3.14 | QuickShop-style chest flow, `/buy` quotes, price cap |
| RootHelp | 1.0.6 | `/rules`, `/cmds`, `/discord`, `/map` |
| Root-Essentials | 1.4.6 | Full EssentialsX replacement — warps, moderation, gold economy |

Auto-update: heartbeat pulls **rootmc** from `https://rootmc.net/plugins/` (manifest). Other jars: upload from `host-handoff/plugins/` or redeploy rootmc-web Pages after `publishPlugins`.

## Do not commit secrets

`cloud.yml` on the host must contain your registered `server-id` / `server-secret`. MySQL password lives only on Shockbyte.

## Optional: Towny extras (not in this zip)

Copy separately from `Minecraft/server/config-templates/` if not already on host:

- `Towny/config.yml` + `Towny/worlds/*.txt` (overworld claimable; nether/end not)
- Towny add-ons / optional plugin configs as needed for your host
