package com.rootrecord.minecraft.rootstat;

import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.command.RootStatCommand;
import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.listener.PlayerSessionListener;
import com.rootrecord.minecraft.rootstat.mysql.McMMOStatsReader;
import com.rootrecord.minecraft.rootstat.mysql.MySqlPlayerStore;
import com.rootrecord.minecraft.rootstat.mysql.PlayerPlaytimeStore;
import com.rootrecord.minecraft.rootstat.sync.SyncTask;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.SQLException;
import java.util.Map;

public final class RootStatPlugin extends JavaPlugin implements RootStatBridge {

    private static final String CONFIG_FILE = RootRecordFolders.ROOTSTAT_CONFIG;

    private static final Map<String, String> MESSAGE_DEFAULTS = Map.of(
            "link-started", "&aVerification code: &f{code}&a — open &f{url}&a (expires in 15 min)",
            "link-already", "&aYour account is linked to RootRecord (&f{account}&a).",
            "link-not", "&eYou are not linked. Run &f/rootstat link&e to verify.",
            "stats-link", "&7Public stats: &b{url}",
            "link-success-sync", "&aAccount linked! Syncing profile…",
            "sync-done", "&aSynced &f{count}&a player profile(s) from RootRecord cloud.",
            "sync-fail", "&cCloud sync failed: &f{error}",
            "no-permission", "&cYou don't have permission.",
            "mysql-disabled", "&cMySQL is disabled in config — local cache unavailable.",
            "config-missing", "&cRootRecord credentials missing — edit plugins/RootRecord/cloud.yml");

    private RootRecordYamlConfig yamlConfig;
    private RootStatConfig pluginConfig;
    private CloudApiClient cloudApi;
    private MySqlPlayerStore playerStore;
    private PlayerPlaytimeStore playtimeStore;
    private McMMOStatsReader mcmmoReader;
    private SyncTask syncTask;

    @Override
    public void onEnable() {
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        yamlConfig.load();
        reloadLocalConfig();

        if (!pluginConfig.hasServerCredentials()) {
            getLogger().warning(
                    "Server credentials missing — set plugins/RootRecord/cloud.yml "
                            + "(register at https://rootrecord.info/realm/servers)");
        }

        initMysql();

        cloudApi = new CloudApiClient(pluginConfig);
        syncTask = new SyncTask(this);
        syncTask.start();

        var cmd = getCommand("rootstat");
        if (cmd != null) {
            var handler = new RootStatCommand(this);
            cmd.setExecutor(handler);
            cmd.setTabCompleter(handler);
        }

        getServer().getPluginManager().registerEvents(new PlayerSessionListener(this), this);

        if (getServer().getPluginManager().getPlugin("PlaceholderAPI") != null) {
            new RootStatExpansion(this).register();
            getLogger().info("PlaceholderAPI expansion registered.");
        }

        getLogger().info("RootStat enabled — https://rootrecord.info/realm/");
    }

    @Override
    public void onDisable() {
        if (syncTask != null) {
            syncTask.stop();
        }
        if (playerStore != null) {
            playerStore.close();
        }
        mcmmoReader = null;
        playtimeStore = null;
    }

    private void initMysql() {
        if (!pluginConfig.isMysqlEnabled()) {
            return;
        }
        try {
            playerStore = new MySqlPlayerStore(pluginConfig);
            playerStore.initSchema();

            playtimeStore = new PlayerPlaytimeStore(pluginConfig, connectionSupplier());
            playtimeStore.initSchema();

            if (pluginConfig.isMcmmoEnabled()) {
                mcmmoReader = new McMMOStatsReader(pluginConfig, connectionSupplier());
                getLogger().info("McMMO reader enabled (prefix: " + pluginConfig.mcmmoTablePrefix() + ").");
            }

            getLogger().info("MySQL ready (" + pluginConfig.mysqlDatabase() + ").");
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
            playerStore = null;
            playtimeStore = null;
            mcmmoReader = null;
        }
    }

    private java.util.function.Supplier<java.sql.Connection> connectionSupplier() {
        return () -> {
            try {
                return playerStore.openConnection();
            } catch (SQLException ex) {
                throw new RuntimeException(ex);
            }
        };
    }

    @Override
    public void reloadRootStatConfig() {
        reloadLocalConfig();
        if (syncTask != null) {
            syncTask.start();
        }
    }

    public void reloadLocalConfig() {
        if (yamlConfig == null) {
            yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        }
        yamlConfig.reload();
        pluginConfig = RootStatConfig.from(this, yamlConfig.config());
        if (cloudApi != null) {
            cloudApi.updateConfig(pluginConfig);
        }
    }

    @Override
    public Plugin getPlugin() {
        return this;
    }

    @Override
    public RootStatConfig config() {
        return pluginConfig;
    }

    @Override
    public CloudApiClient cloud() {
        return cloudApi;
    }

    @Override
    public MySqlPlayerStore players() {
        return playerStore;
    }

    @Override
    public McMMOStatsReader mcmmo() {
        return mcmmoReader;
    }

    @Override
    public PlayerPlaytimeStore playtime() {
        return playtimeStore;
    }

    @Override
    public SyncTask syncTask() {
        return syncTask;
    }

    @Override
    public String msg(String key) {
        String prefix = yamlConfig.config().getString("messages.prefix", "&8[&6RootStat&8]&r ");
        String body = yamlConfig.config().getString("messages." + key);
        if (body == null || body.isBlank() || body.equals(key)) {
            body = MESSAGE_DEFAULTS.getOrDefault(key, key);
        }
        return colorize(prefix + body);
    }
}
