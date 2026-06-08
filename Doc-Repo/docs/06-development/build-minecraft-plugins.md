# Minecraft plugin build & deploy

Paper plugin workspace: **`Minecraft/`** in the MonoRepo (not a separate GitHub repo today).

## Requirements

| Tool | Version |
|------|---------|
| JDK (Gradle daemon) | 17 or 21 — **not** JDK 25 |
| JDK (bytecode toolchain) | 25 — matches Paper 26.x server |
| Paper API | 26.1.2 (local jar under `server/libraries/` preferred) |

Copy `local.properties.example` → `local.properties` and set `java.version=25`. Do **not** set `org.gradle.java.home` to JDK 25.

## Build BlockNotes (production)

```powershell
cd Minecraft
.\build-with-server-jdk.bat :plugins:blocknotes:build
```

Artifacts:

- `Minecraft/out/blocknotes-1.1.0-SNAPSHOT.jar`
- `Minecraft/server/plugins/blocknotes-1.1.0-SNAPSHOT.jar` (deploy task)

## Publish for live server auto-update

1. Copy jar to `Web/main/realm/plugins/blocknotes-1.1.0-SNAPSHOT.jar`
2. Ensure `Web/main/realm/plugins/manifest.json` version matches `build.gradle.kts`
3. Deploy **rootrecord.info** Pages so heartbeat `plugin_updates` URL serves the new file

API constant mirror: `Web/cloudflare/rootrecord-api-blocknotes/src/blocknotes-server.ts` → `PLUGIN_RELEASES`.

## Server restart

After replacing the jar on a live Paper host:

```powershell
cd Minecraft\server
.\start_paper.bat
```

Or restart the process manager wrapping Paper.

## Layout

| Path | Role |
|------|------|
| `plugins/blocknotes/` | Unified companion plugin source |
| `plugins/rootstat/` | Optional standalone linking plugin |
| `plugins/rootrecord-common/` | Shared config paths + cloud.yml helpers |
| `plugin-template/` | Scaffold for new plugins |

## Related reading

- [../02-products/minecraft-realm.md](../02-products/minecraft-realm.md)
- `Minecraft/README.md` (runbook in code repo)
