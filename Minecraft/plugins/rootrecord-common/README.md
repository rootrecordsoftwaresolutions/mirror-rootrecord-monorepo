# rootrecord-common

Shared library (embedded in each plugin jar) for RootRecord Paper plugins.

## Config layout

All plugins read and write under **`plugins/RootRecord/`**:

| File | Plugin |
|------|--------|
| `rootstat.yml` | RootStat |
| `blocknotes.yml` | BlockNotes |
| `downloaded-plugins.yml` | BlockNotes (auto-update state) |

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
