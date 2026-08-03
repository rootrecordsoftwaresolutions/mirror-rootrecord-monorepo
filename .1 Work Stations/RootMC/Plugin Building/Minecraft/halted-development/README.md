# Halted development plugins

These plugins are **not** built or deployed by `publishPlugins`. Each project is isolated here for optional one-off work.

| Plugin | Status | Last release jar |
|--------|--------|------------------|
| `root-questionnaire` | Never shipped â€” not started | `releases/root-questionnaire-1.0.0.jar` |
| `root-ask` | Retired â€” no longer used | `releases/root-ask-1.1.2.jar` |
| `root-blueprints` | Not tested | `releases/root-blueprints-1.0.1.jar` |
| `root-contracts` | Not using | `releases/root-contracts-1.0.3.jar` |
| `root-explore` | Not using | `releases/root-explore-1.0.1.jar` |

## Build one plugin

From `Plugin Building/Minecraft/`:

```bat
.\build-with-server-jdk.bat :halted:root-ask:build
```

Jars land in `halted-development/<name>/build/libs/` only (no handoff copy).

`publishPlugins` and `buildAllPlugins` **never** include these projects. Any stray jars or `plugins/RootMC/<plugin>.yml` in handoff folders are deleted automatically when you run a normal build-all or publish.

## Layout per plugin

- `src/` â€” source (unchanged Gradle project)
- `releases/` â€” last known jar kept for reference
- `handoff-config/` â€” live YAML moved off production handoff (if any)

## Workstations

Apply the same layout on every RootMC workstation:

- `Plugin Building/Minecraft/halted-development/<plugin>/`
- Remove matching jars from `Server Handoffs\2. RootMC - Towny/plugins/` and `Web Files/rootmc-web/public/plugins/` (Gen 1 paths only â€” not Gen 2 `gen2-27/`)
- Remove matching `plugins/RootMC/<plugin>.yml` from live handoff
