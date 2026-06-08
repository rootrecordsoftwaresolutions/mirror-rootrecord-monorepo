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

All RootRecord plugins use **`plugins/RootRecord/`** on the server (one folder, one YAML per plugin):

| File | Purpose |
|------|---------|
| `cloud.yml` | **Shared** API credentials (`server-id`, `server-secret`) |
| `rootstat.yml` | RootStat (MySQL, messages, sync interval) |
| `blocknotes.yml` | BlockNotes (server address, heartbeat) |

New plugins should use the `rootrecord-common` module — see [`rootrecord-common/README.md`](rootrecord-common/README.md).

## BlockNotes (production — use this on the SMP)

[`blocknotes/`](blocknotes/) — unified companion for the Block Notes Android app: heartbeat, account linking (`/rootstat`), McMMO + playtime sync, PlaceholderAPI, and remote jar updates via cloud heartbeat.

```powershell
.\build-with-server-jdk.bat :plugins:blocknotes:build
```

Output: `out/blocknotes-1.1.0-SNAPSHOT.jar` (also copied to `server/plugins/`). Publish the same filename to `https://rootrecord.info/realm/plugins/` so live servers auto-pull updates.

**Do not** deploy `blocknotes` and `rootstat` together — both register `/rootstat`.

## RootStat (standalone, optional)

[`rootstat/`](rootstat/) — linking-only jar for servers that do not run BlockNotes. Same `plugins/RootRecord/cloud.yml` + `rootstat.yml` layout.

```powershell
.\build-with-server-jdk.bat :plugins:rootstat:build
```