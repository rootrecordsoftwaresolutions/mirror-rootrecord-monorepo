package com.rootrecord.minecraft.rootstat.config;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

public final class RootStatConfig {

    private final String apiBase;
    private final String serverId;
    private final String serverSecret;
    private final int syncIntervalMinutes;
    private final String statsUrlBase;
    private final boolean mysqlEnabled;
    private final String mysqlHost;
    private final int mysqlPort;
    private final String mysqlDatabase;
    private final String mysqlUsername;
    private final String mysqlPassword;
    private final String mysqlTablePrefix;
    private final int mysqlPoolSize;
    private final String mysqlJdbcParams;
    private final boolean mcmmoEnabled;
    private final String mcmmoTablePrefix;

    private RootStatConfig(
            String apiBase,
            String serverId,
            String serverSecret,
            int syncIntervalMinutes,
            String statsUrlBase,
            boolean mysqlEnabled,
            String mysqlHost,
            int mysqlPort,
            String mysqlDatabase,
            String mysqlUsername,
            String mysqlPassword,
            String mysqlTablePrefix,
            int mysqlPoolSize,
            String mysqlJdbcParams,
            boolean mcmmoEnabled,
            String mcmmoTablePrefix) {
        this.apiBase = apiBase;
        this.serverId = serverId;
        this.serverSecret = serverSecret;
        this.syncIntervalMinutes = syncIntervalMinutes;
        this.statsUrlBase = statsUrlBase;
        this.mysqlEnabled = mysqlEnabled;
        this.mysqlHost = mysqlHost;
        this.mysqlPort = mysqlPort;
        this.mysqlDatabase = mysqlDatabase;
        this.mysqlUsername = mysqlUsername;
        this.mysqlPassword = mysqlPassword;
        this.mysqlTablePrefix = mysqlTablePrefix;
        this.mysqlPoolSize = mysqlPoolSize;
        this.mysqlJdbcParams = mysqlJdbcParams;
        this.mcmmoEnabled = mcmmoEnabled;
        this.mcmmoTablePrefix = mcmmoTablePrefix;
    }

    public static RootStatConfig from(JavaPlugin plugin, FileConfiguration cfg) {
        RootRecordCloudConfig.CloudSettings cloud = RootRecordCloudConfig.resolve(plugin, cfg);
        String apiBase = cloud.apiBase().isBlank() ? "https://rootrecord.info" : cloud.apiBase();
        return new RootStatConfig(
                trimSlash(apiBase),
                cloud.serverId(),
                cloud.serverSecret(),
                Math.max(1, cfg.getInt("cloud.sync-interval-minutes", 5)),
                trimSlash(cfg.getString("cloud.stats-url-base", "https://rootrecord.info/realm/player")),
                cfg.getBoolean("mysql.enabled", true),
                cfg.getString("mysql.host", "127.0.0.1"),
                cfg.getInt("mysql.port", 3306),
                cfg.getString("mysql.database", "minecraft"),
                cfg.getString("mysql.username", "root"),
                cfg.getString("mysql.password", ""),
                cfg.getString("mysql.table-prefix", ""),
                Math.max(1, cfg.getInt("mysql.pool-size", 5)),
                cfg.getString("mysql.jdbc-params", "useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"),
                cfg.getBoolean("mcmmo.enabled", true),
                cfg.getString("mcmmo.table-prefix", "mcmmo_"));
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

    public int syncIntervalMinutes() {
        return syncIntervalMinutes;
    }

    public String statsUrlBase() {
        return statsUrlBase;
    }

    public boolean isMysqlEnabled() {
        return mysqlEnabled;
    }

    public String mysqlHost() {
        return mysqlHost;
    }

    public int mysqlPort() {
        return mysqlPort;
    }

    public String mysqlDatabase() {
        return mysqlDatabase;
    }

    public String mysqlUsername() {
        return mysqlUsername;
    }

    public String mysqlPassword() {
        return mysqlPassword;
    }

    public String mysqlTablePrefix() {
        return mysqlTablePrefix;
    }

    public int mysqlPoolSize() {
        return mysqlPoolSize;
    }

    public String mysqlJdbcParams() {
        return mysqlJdbcParams;
    }

    public String playersTable() {
        return mysqlTablePrefix + "rootstat_players";
    }

    public String playtimeTable() {
        return mysqlTablePrefix + "blocknotes_playtime";
    }

    public String jdbcUrl() {
        String params = mysqlJdbcParams == null || mysqlJdbcParams.isBlank() ? "" : "?" + mysqlJdbcParams;
        return "jdbc:mysql://" + mysqlHost + ":" + mysqlPort + "/" + mysqlDatabase + params;
    }

    public boolean isMcmmoEnabled() {
        return mcmmoEnabled;
    }

    public String mcmmoTablePrefix() {
        return mcmmoTablePrefix == null ? "mcmmo_" : mcmmoTablePrefix;
    }
}
