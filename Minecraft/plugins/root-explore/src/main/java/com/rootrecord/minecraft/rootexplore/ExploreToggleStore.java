package com.rootrecord.minecraft.rootexplore;

import com.rootrecord.minecraft.common.RootRecordFolders;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Per-player opt-out for exploration hints (default: enabled). */
final class ExploreToggleStore {

    private static final String FILE = "explore-prefs.yml";
    private static final String KEY = "disabled";

    private final Plugin plugin;
    private final Set<UUID> disabled = new HashSet<>();

    ExploreToggleStore(Plugin plugin) {
        this.plugin = plugin;
        load();
    }

    boolean isEnabled(UUID uuid) {
        return !disabled.contains(uuid);
    }

    boolean toggle(UUID uuid) {
        if (disabled.remove(uuid)) {
            save();
            return true;
        }
        disabled.add(uuid);
        save();
        return false;
    }

    void setEnabled(UUID uuid, boolean enabled) {
        if (enabled) {
            if (disabled.remove(uuid)) {
                save();
            }
        } else if (disabled.add(uuid)) {
            save();
        }
    }

    private File file() {
        return RootRecordFolders.configFile(plugin, FILE);
    }

    private void load() {
        disabled.clear();
        File file = file();
        if (!file.isFile()) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        for (String id : yaml.getStringList(KEY)) {
            try {
                disabled.add(UUID.fromString(id));
            } catch (IllegalArgumentException ignored) {
                // skip
            }
        }
    }

    private void save() {
        RootRecordFolders.ensureDir(plugin);
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.set(KEY, disabled.stream().map(UUID::toString).sorted().toList());
        try {
            yaml.save(file());
        } catch (IOException ex) {
            plugin.getLogger().warning("Could not save explore prefs: " + ex.getMessage());
        }
    }
}
