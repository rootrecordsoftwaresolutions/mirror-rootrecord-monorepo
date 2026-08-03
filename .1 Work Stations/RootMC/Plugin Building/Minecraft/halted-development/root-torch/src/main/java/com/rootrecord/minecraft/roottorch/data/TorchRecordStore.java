package com.rootrecord.minecraft.roottorch.data;

import com.rootrecord.minecraft.common.RootRecordFolders;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.Locale;

/** Persists longest burning Torch (light → burn-out duration). */
public final class TorchRecordStore {

    public static final String FILE = "root-torch-records.yml";

    private final Plugin plugin;
    private final File file;
    private long longestMs;
    private String litBy = "";
    private String lastHolder = "";
    private String recordedAt = "";

    public TorchRecordStore(Plugin plugin) {
        this.plugin = plugin;
        RootRecordFolders.ensureDir(plugin);
        this.file = RootRecordFolders.configFile(plugin, FILE);
        load();
    }

    public void load() {
        if (!file.isFile()) {
            return;
        }
        FileConfiguration cfg = YamlConfiguration.loadConfiguration(file);
        longestMs = Math.max(0L, cfg.getLong("longest.duration-ms", 0L));
        litBy = cfg.getString("longest.lit-by", "");
        lastHolder = cfg.getString("longest.last-holder", "");
        recordedAt = cfg.getString("longest.recorded-at", "");
    }

    public long longestMs() {
        return longestMs;
    }

    public String litBy() {
        return litBy == null ? "" : litBy;
    }

    public String lastHolder() {
        return lastHolder == null ? "" : lastHolder;
    }

    public String recordedAt() {
        return recordedAt == null ? "" : recordedAt;
    }

    /** @return true when this duration sets a new record */
    public boolean tryRecord(long durationMs, String litByName, String lastHolderName) {
        if (durationMs <= 0 || durationMs <= longestMs) {
            return false;
        }
        longestMs = durationMs;
        litBy = litByName == null ? "" : litByName;
        lastHolder = lastHolderName == null ? "" : lastHolderName;
        recordedAt = Instant.now().toString();
        save();
        return true;
    }

    public void save() {
        YamlConfiguration cfg = new YamlConfiguration();
        cfg.set("longest.duration-ms", longestMs);
        cfg.set("longest.duration-seconds", longestMs / 1000L);
        cfg.set("longest.lit-by", litBy);
        cfg.set("longest.last-holder", lastHolder);
        cfg.set("longest.recorded-at", recordedAt);
        try {
            cfg.save(file);
        } catch (IOException ex) {
            plugin.getLogger().warning("Could not save " + FILE + ": " + ex.getMessage());
        }
    }

    public static String formatDuration(long ms) {
        long totalSec = Math.max(0L, ms / 1000L);
        long min = totalSec / 60L;
        long sec = totalSec % 60L;
        if (min <= 0) {
            return sec + "s";
        }
        return String.format(Locale.US, "%dm %ds", min, sec);
    }
}
