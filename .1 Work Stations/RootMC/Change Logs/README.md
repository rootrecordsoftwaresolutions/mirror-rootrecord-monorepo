# RootMC Change Logs

Tracking for live server ops and Root Record plugin releases.

| File | Use for |
|------|---------|
| `SERVER-CHANGELOG.md` | Server-wide: Paper/config, third-party plugins, API Worker deploys, D1 migrations, Discord ops, Shockbyte uploads |
| `plugins/<name>.md` | One changelog per plugin (`Plugin Building/Minecraft/plugins/<name>/`) |

## Conventions

- **Newest first** under each heading.
- **Plugin version** must match `build.gradle.kts` when a jar is built or deployed.
- **Player-facing copy** uses Gold, not dollars.
- **Secrets** — never log tokens, passwords, or `cloud.yml` credentials.
- **Deploy notes** — say what changed on Shockbyte (FileZilla jar swap, restart, heartbeat-only, etc.).

## When to update

| Change | Update |
|--------|--------|
| Plugin code + version bump | `plugins/<name>.md` + `SERVER-CHANGELOG.md` if live deploy |
| `api.rootmc.net` deploy | `SERVER-CHANGELOG.md` |
| Live YAML under `plugins/RootRecord/` or Towny config | `SERVER-CHANGELOG.md` |
| `rootmc.net` / manifest / heartbeat jars | `SERVER-CHANGELOG.md` + affected plugin files |
| `rootmc-realm-api` / Worker behavior, D1, Discord automation | `SERVER-CHANGELOG.md` |
| `rootmc-web` Pages / wiki deploy | `SERVER-CHANGELOG.md` |
| `root-territories` mesa / BlueMap | `plugins/root-territories.md` + `SERVER-CHANGELOG.md` if live deploy |

Plugin source: `Plugin Building/Minecraft/plugins/*/build.gradle.kts`.
