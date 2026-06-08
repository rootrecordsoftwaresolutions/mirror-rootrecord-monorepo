package com.rootrecord.minecraft.blocknotes;

import com.rootrecord.minecraft.blocknotes.cloud.CloudHeartbeatClient;
import com.rootrecord.minecraft.blocknotes.command.BlockNotesCommand;
import com.rootrecord.minecraft.blocknotes.config.BlockNotesConfig;
import com.rootrecord.minecraft.blocknotes.sync.HeartbeatTask;
import com.rootrecord.minecraft.blocknotes.sync.PluginUpdateService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.RootStatExpansion;
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

/**
 * Unified BlockNotes plugin - app heartbeat, account linking, McMMO sync, and playtime tracking.
 * Replaces the separate RootStat companion jar.
 */
public final class BlockNotesPlugin extends JavaPlugin implements RootStatBridge {

    private static final String CONFIG_FILE = RootRecordFolders.BLOCKNOTES_CONFIG;

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
    private BlockNotesConfig blockNotesConfig;
    private RootStatConfig rootStatConfig;
    private CloudHeartbeatClient heartbeatClient;
    private CloudApiClient cloudApi;
    private MySqlPlayerStore playerStore;
    private PlayerPlaytimeStore playtimeStore;
    private McMMOStatsReader mcmmoReader;
    private SyncTask syncTask;
    private HeartbeatTask heartbeatTask;
    private PluginUpdateService updateService;

    @Override
    public void onEnable() {
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        yamlConfig.load();
        reloadLocalConfig();

        if (!rootStatConfig.hasServerCredentials()) {
            getLogger().warning(
                    "Server credentials missing — set plugins/RootRecord/cloud.yml "
                            + "(register at https://rootrecord.info/realm/servers)");
        }

        initMysql();

        cloudApi = new CloudApiClient(rootStatConfig);
        heartbeatClient = new CloudHeartbeatClient(blockNotesConfig, getDescription().getVersion());
        updateService = new PluginUpdateService(this);
        syncTask = new SyncTask(this);
        syncTask.start();
        heartbeatTask = new HeartbeatTask(this);
        heartbeatTask.start();
        heartbeatTask.runSafe();

        registerCommands();
        getServer().getPluginManager().registerEvents(new PlayerSessionListener(this), this);

        if (getServer().getPluginManager().getPlugin("PlaceholderAPI") != null) {
            new RootStatExpansion(this).register();
            getLogger().info("PlaceholderAPI expansion registered.");
        }

        getLogger().info("BlockNotes enabled — linking, McMMO, playtime, and app sync.");
    }

    @Override
    public void onDisable() {
        if (syncTask != null) {
            syncTask.stop();
        }
        if (heartbeatTask != null) {
            heartbeatTask.stop();
        }
        if (playerStore != null) {
            playerStore.close();
        }
        mcmmoReader = null;
        playtimeStore = null;
    }

    private void initMysql() {
        if (!rootStatConfig.isMysqlEnabled()) {
            return;
        }
        try {
            playerStore = new MySqlPlayerStore(rootStatConfig);
            playerStore.initSchema();

            playtimeStore = new PlayerPlaytimeStore(rootStatConfig, connectionSupplier());
            playtimeStore.initSchema();

            if (rootStatConfig.isMcmmoEnabled()) {
                mcmmoReader = new McMMOStatsReader(rootStatConfig, connectionSupplier());
                getLogger().info("McMMO reader enabled (prefix: " + rootStatConfig.mcmmoTablePrefix() + ").");
            }

            getLogger().info("MySQL ready (" + rootStatConfig.mysqlDatabase() + ").");
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

    private void registerCommands() {
        var blocknotes = getCommand("blocknotes");
        if (blocknotes != null) {
            var handler = new BlockNotesCommand(this);
            blocknotes.setExecutor(handler);
            blocknotes.setTabCompleter(handler);
        }
        var rootstat = getCommand("rootstat");
        if (rootstat != null) {
            var handler = new RootStatCommand(this);
            rootstat.setExecutor(handler);
            rootstat.setTabCompleter(handler);
        }
    }

    public void reloadLocalConfig() {
        if (yamlConfig == null) {
            yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        }
        yamlConfig.reload();
        blockNotesConfig = BlockNotesConfig.from(this, yamlConfig.config());
        rootStatConfig = RootStatConfig.from(this, yamlConfig.config());
        if (cloudApi != null) {
            cloudApi.updateConfig(rootStatConfig);
        }
        if (heartbeatClient != null) {
            heartbeatClient.updateConfig(blockNotesConfig, getDescription().getVersion());
        }
    }

    @Override
    public void reloadRootStatConfig() {
        reloadLocalConfig();
        if (syncTask != null) {
            syncTask.start();
        }
        if (heartbeatTask != null) {
            heartbeatTask.start();
        }
    }

    public BlockNotesConfig blockNotesConfig() {
        return blockNotesConfig;
    }

    public CloudHeartbeatClient heartbeatClient() {
        return heartbeatClient;
    }

    public HeartbeatTask heartbeatTask() {
        return heartbeatTask;
    }

    public PluginUpdateService updates() {
        return updateService;
    }

    @Override
    public Plugin getPlugin() {
        return this;
    }

    @Override
    public RootStatConfig config() {
        return rootStatConfig;
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
        String prefix = yamlConfig.config().getString("messages.prefix", "&8[&bBlockNotes&8]&r ");
        String body = yamlConfig.config().getString("messages." + key);
        if (body == null || body.isBlank() || body.equals(key)) {
            body = MESSAGE_DEFAULTS.getOrDefault(key, key);
        }
        return colorize(prefix + body);
    }
}
