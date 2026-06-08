# Root Record — Minecraft plugins

Java **Paper** plugin workspace. Local dev server lives in **`server/`** (Paper **26.1.2**, Java **25**).

## Layout

| Path | Purpose |
|------|---------|
| `plugins/` | Plugin source projects (one folder per plugin) |
| `plugin-template/` | Copy into `plugins/<name>/` to start |
| `server/` | Your Paper server (`start_paper.bat`) |
| `server/plugins/` | Deploy target for built jars |
| `out/` | Copy of built jars (convenience) |

## Requirements

- **JDK 25** — same as `server/start_paper.bat` (Paper 26.x)
- Copy `local.properties.example` → `local.properties` if Gradle should use a specific JDK path

## Build & deploy

From `Minecraft/`:

```powershell
# Uses Java 25 when installed at the Temurin path from start_paper.bat
.\build-with-server-jdk.bat :plugin-template:build

# Build every plugin + copy jars to server/plugins/
.\build-with-server-jdk.bat buildAllPlugins
```

Then start or restart the server:

```powershell
cd server
.\start_paper.bat
```

Gradle prefers the **exact `paper-api` jar** under `server/libraries/` when present, so plugins compile against the same API as your running server.

## New plugin

1. Copy `plugin-template/` → `plugins/my-plugin/`
2. Set `name`, `main`, and `api-version` in `plugin.yml`
3. Build: `.\build-with-server-jdk.bat :plugins:my-plugin:build`

`settings.gradle.kts` auto-includes any `plugins/*/build.gradle.kts`.

## Versions

Configured in `gradle.properties`:

- `paperApiVersion=26.1.2-R0.1-SNAPSHOT`
- `paperApiBuild=26.1.2.build.15-alpha` (local jar path under `server/libraries/`)
- `javaVersion=25`

See also `server/README.md` for server-specific notes.
