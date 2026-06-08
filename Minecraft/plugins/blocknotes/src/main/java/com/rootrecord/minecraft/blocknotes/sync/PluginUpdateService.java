package com.rootrecord.minecraft.blocknotes.sync;

import com.rootrecord.minecraft.blocknotes.BlockNotesPlugin;
import com.rootrecord.minecraft.common.RootRecordFolders;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Map;
import java.util.logging.Level;

/** Pulls plugin jar updates from heartbeat responses (remote server, no SSH). */
public final class PluginUpdateService {

    private final BlockNotesPlugin plugin;
    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(30)).build();

    public PluginUpdateService(BlockNotesPlugin plugin) {
        this.plugin = plugin;
    }

    public void apply(HeartbeatResult result) {
        if (result.configDefaults() != null && !result.configDefaults().isEmpty()) {
            patchBlockNotesConfig(result.configDefaults());
        }
        for (PluginUpdate update : result.updates()) {
            if ("blocknotes".equals(update.plugin())) {
                tryDownload(update);
            }
        }
    }

    private void patchBlockNotesConfig(Map<String, Object> defaults) {
        Path configPath = RootRecordFolders.configFile(plugin, RootRecordFolders.BLOCKNOTES_CONFIG).toPath();
        if (!Files.isRegularFile(configPath)) {
            plugin.getLogger().info("BlockNotes config not found — skip remote config patch.");
            return;
        }
        try {
            YamlConfiguration cfg = YamlConfiguration.loadConfiguration(configPath.toFile());
            boolean changed = false;
            for (Map.Entry<String, Object> entry : defaults.entrySet()) {
                if (!cfg.contains(entry.getKey())) {
                    cfg.set(entry.getKey(), entry.getValue());
                    changed = true;
                }
            }
            if (changed) {
                cfg.save(configPath.toFile());
                plugin.getLogger().info("Patched plugins/RootRecord/blocknotes.yml — run /blocknotes reload.");
            }
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "BlockNotes config patch failed: " + ex.getMessage(), ex);
        }
    }

    private void tryDownload(PluginUpdate update) {
        if (update.url() == null || update.url().isBlank() || update.filename() == null) {
            return;
        }
        if (update.version() != null && alreadyDownloaded(update)) {
            return;
        }
        Path pluginsDir = RootRecordFolders.pluginsDir(plugin).toPath();
        Path target = pluginsDir.resolve(update.filename());
        Path temp = pluginsDir.resolve(update.filename() + ".download");
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(update.url()))
                    .timeout(Duration.ofMinutes(2))
                    .GET()
                    .build();
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() >= 400) {
                plugin.getLogger().warning("Plugin update download failed (" + update.filename() + "): HTTP "
                        + response.statusCode());
                return;
            }
            try (InputStream in = response.body()) {
                Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            markDownloaded(update);
            plugin.getLogger().info("Downloaded " + update.filename()
                    + " — restart Paper or reload the plugin to apply.");
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "Plugin update failed for " + update.filename() + ": "
                    + ex.getMessage(), ex);
            try {
                Files.deleteIfExists(temp);
            } catch (IOException ignored) {
                // ignore
            }
        }
    }

    private Path markerFile() {
        return RootRecordFolders.configFile(plugin, RootRecordFolders.DOWNLOADED_PLUGINS_STATE).toPath();
    }

    private boolean alreadyDownloaded(PluginUpdate update) {
        Path marker = markerFile();
        if (!Files.isRegularFile(marker)) {
            return false;
        }
        YamlConfiguration cfg = YamlConfiguration.loadConfiguration(marker.toFile());
        String key = update.plugin() + ".version";
        return update.version() != null && update.version().equals(cfg.getString(key));
    }

    private void markDownloaded(PluginUpdate update) {
        try {
            RootRecordFolders.ensureDir(plugin);
            Path marker = markerFile();
            YamlConfiguration cfg = Files.isRegularFile(marker)
                    ? YamlConfiguration.loadConfiguration(marker.toFile())
                    : new YamlConfiguration();
            cfg.set(update.plugin() + ".version", update.version());
            cfg.set(update.plugin() + ".filename", update.filename());
            cfg.set(update.plugin() + ".at", System.currentTimeMillis());
            cfg.save(marker.toFile());
        } catch (IOException ex) {
            plugin.getLogger().log(Level.WARNING, "Could not record plugin download marker: " + ex.getMessage());
        }
    }

    public record PluginUpdate(String plugin, String version, String filename, String url) {}

    public record HeartbeatResult(Map<String, Object> configDefaults, java.util.List<PluginUpdate> updates) {}
}
