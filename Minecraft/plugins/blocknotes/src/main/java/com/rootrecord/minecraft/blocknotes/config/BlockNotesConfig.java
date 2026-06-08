package com.rootrecord.minecraft.blocknotes.config;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public final class BlockNotesConfig {

    private final String apiBase;
    private final String serverId;
    private final String serverSecret;
    private final int heartbeatIntervalMinutes;
    private final String serverAddress;
    private final String defaultWorldName;
    private final String gameVersion;
    private final String mapUrl;

    private BlockNotesConfig(
            String apiBase,
            String serverId,
            String serverSecret,
            int heartbeatIntervalMinutes,
            String serverAddress,
            String defaultWorldName,
            String gameVersion,
            String mapUrl) {
        this.apiBase = apiBase;
        this.serverId = serverId;
        this.serverSecret = serverSecret;
        this.heartbeatIntervalMinutes = heartbeatIntervalMinutes;
        this.serverAddress = serverAddress;
        this.defaultWorldName = defaultWorldName;
        this.gameVersion = gameVersion;
        this.mapUrl = mapUrl;
    }

    public static BlockNotesConfig from(JavaPlugin plugin, FileConfiguration cfg) {
        RootRecordCloudConfig.CloudSettings cloud = RootRecordCloudConfig.resolve(plugin, cfg);
        String apiBase = cloud.apiBase().isBlank() ? "https://rootrecord.info" : cloud.apiBase();
        return new BlockNotesConfig(
                trimSlash(apiBase),
                cloud.serverId(),
                cloud.serverSecret(),
                Math.max(1, cfg.getInt("cloud.heartbeat-interval-minutes", 5)),
                nullToEmpty(cfg.getString("server.address", "15.204.13.9:25565")),
                nullToEmpty(cfg.getString("server.default-world-name", "RootRecord SMP")),
                nullToEmpty(cfg.getString("server.game-version", "26.1")),
                nullToEmpty(cfg.getString("server.map-url")));
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimSlash(String value) {
        if (value == null || value.isBlank()) {
            return "https://rootrecord.info";
        }
        return value.replaceAll("/+$", "");
    }

    public boolean hasServerCredentials() {
        return !serverId.isBlank() && !serverSecret.isBlank();
    }

    public String apiBase() {
        return apiBase;
    }

    public String serverId() {
        return serverId;
    }

    public String serverSecret() {
        return serverSecret;
    }

    public int heartbeatIntervalMinutes() {
        return heartbeatIntervalMinutes;
    }

    public String serverAddress() {
        return serverAddress;
    }

    public String defaultWorldName() {
        return defaultWorldName;
    }

    public String gameVersion() {
        return gameVersion;
    }

    public String mapUrl() {
        return mapUrl;
    }
}
