# rootrecord-common

Shared library (embedded in each plugin jar) for RootRecord Paper plugins.

## Config layout

All plugins read and write under **`plugins/RootRecord/`**:

| File | Plugin |
|------|--------|
| `cloud.yml` | Shared API credentials (all RootRecord plugins) |
| `rootmc.yml` | RootMC — linking, economy, McMMO, heartbeat |
| `rootmc-shops.yml` | RootMC-Shops — price cap, messages |
| `shops.yml` | RootMC-Shops — chest shop listings |
| `roothelp.yml` | RootHelp — rules, command list |
| `root-rewards.yml` | Root-Rewards — playtime milestones, vote links |
| `root-loans.yml` | Root-Loans — interest, limits, income sweep |
| `root-contracts.yml` | Root-Contracts — escrow job limits |
| `root-announcer.yml` | Root-Announcer — rotating broadcast messages |

## New plugin

1. Add `implementation(project(":plugins:rootrecord-common"))` (wired automatically in root `build.gradle.kts`).
2. Ship defaults as `src/main/resources/<plugin-id>.yml`.
3. At enable:

```java
private RootRecordYamlConfig yaml;

@Override
public void onEnable() {
    yaml = new RootRecordYamlConfig(this, "myplugin.yml", "myplugin.yml");
    yaml.load();
    // MyConfig.from(yaml.config());
}
```

Do **not** call `saveDefaultConfig()` — it creates a per-plugin data folder.
