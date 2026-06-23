package com.rootrecord.minecraft.rootmc;

import com.rootrecord.minecraft.rootmc.cloud.CloudHeartbeatClient;
import com.rootrecord.minecraft.rootmc.discord.DiscordChatBridge;
import com.rootrecord.minecraft.rootmc.discord.DiscordChatConfig;
import com.rootrecord.minecraft.rootmc.ingame.IngameEventBuffer;
import com.rootrecord.minecraft.rootmc.ingame.RootMcCommand;
import com.rootrecord.minecraft.common.RootMcEconomyBridge;
import com.rootrecord.minecraft.common.RootMcShopsExporter;
import com.rootrecord.minecraft.rootmc.config.RootMcConfig;
import com.rootrecord.minecraft.rootmc.sync.HeartbeatTask;
import com.rootrecord.minecraft.rootmc.sync.PluginUpdateService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.RootStatExpansion;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.command.RootStatCommand;
import com.rootrecord.minecraft.rootstat.command.ValueCommand;
import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.listener.PlayerSessionListener;
import com.rootrecord.minecraft.rootstat.mysql.McMMOStatsReader;
import com.rootrecord.minecraft.rootstat.mysql.MySqlPlayerStore;
import com.rootrecord.minecraft.rootstat.mysql.PlayerPlaytimeStore;
import com.rootrecord.minecraft.rootstat.economy.EconomyCollector;
import com.rootrecord.minecraft.rootstat.economy.ShopSignListener;
import com.rootrecord.minecraft.rootstat.economy.shop.ShopPriceCapHooks;
import com.rootrecord.minecraft.rootstat.mysql.RootShopsStore;
import com.rootrecord.minecraft.rootstat.sync.SyncTask;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * Unified RootMC plugin - app heartbeat, account linking, McMMO sync, and playtime tracking.
 * Replaces the separate RootStat companion jar.
 */
public final class RootMcPlugin extends JavaPlugin implements RootStatBridge, RootMcEconomyBridge {

    private static final String CONFIG_FILE = RootRecordFolders.ROOTMC_CONFIG;

    private static final Map<String, String> MESSAGE_DEFAULTS = Map.ofEntries(
            Map.entry("link-started", "&aVerification code: &f{code}&a — open &f{url}&a (expires in 15 min)"),
            Map.entry("link-already", "&aYour account is linked to RootRecord (&f{account}&a)."),
            Map.entry("link-not", "&eYou are not linked. Run &f/link &7to verify."),
            Map.entry("stats-link", "&7Public stats: &b{url}"),
            Map.entry("link-success-sync", "&aAccount linked! Syncing profile…"),
            Map.entry("sync-done", "&aSynced &f{count}&a player profile(s) from RootRecord cloud."),
            Map.entry("sync-fail", "&cCloud sync failed: &f{error}"),
            Map.entry("no-permission", "&cYou don't have permission."),
            Map.entry("mysql-disabled", "&cMySQL is disabled in config — local cache unavailable."),
            Map.entry("config-missing", "&cRootRecord credentials missing — edit plugins/RootRecord/cloud.yml"),
            Map.entry("shop-price-too-high", "&cShop price &f{price}&c for &f{item}&c exceeds the server cap (&f{max}&c, avg &f{avg}&c)."),
            Map.entry("shops-link", "&7Root Shops: &b{url}"),
            Map.entry("waypoint-saved", "&aWaypoint saved: &f{label}&a (&7{x}&a, &7{y}&a, &7{z}&a)."),
            Map.entry("note-saved", "&aNote saved at your location."),
            Map.entry("ingame-not-linked", "&eLink your account first: &f/link"),
            Map.entry("vault-claimed", "&aClaimed &f{count}&a vault item(s)."),
            Map.entry("value-line", "&7{item}&7 — &f{each}&7 each · &f{stack}&7 per stack (&7{size}&7) · &7{samples}&7 samples"),
            Map.entry("value-not-found", "&eNo market price for &f{item}&e. Try &fdiamond&7 or &foak_log&e."),
            Map.entry("value-hand-none", "&7In hand: &8(empty) &7— hold an item or use &f/value <item>"),
            Map.entry("value-hand", "&7In hand: &f{item}&7 ×{qty} — &f{each}&7 each · &f{stack}&7 per stack (&7{size}&7)"),
            Map.entry("value-carry-total", "&7Carried market value: &a{total}&7 (&f{stacks}&7 priced items, &f{items}&7 types)"),
            Map.entry("value-carry-line", "&8  &7{item}&7 ×{qty} — &f{each}&7 each → &f{total}"),
            Map.entry("value-carry-more", "&8  &7…and {count} more types (&f{total}&7)"),
            Map.entry("value-carry-empty", "&7No priced items in your inventory."));

    private RootRecordYamlConfig yamlConfig;
    private RootMcConfig rootMcConfig;
    private RootStatConfig rootStatConfig;
    private CloudHeartbeatClient heartbeatClient;
    private CloudApiClient cloudApi;
    private MySqlPlayerStore playerStore;
    private PlayerPlaytimeStore playtimeStore;
    private McMMOStatsReader mcmmoReader;
    private SyncTask syncTask;
    private EconomyCollector economyCollector;
    private RootShopsStore rootShopsStore;
    private HeartbeatTask heartbeatTask;
    private PluginUpdateService updateService;
    private IngameEventBuffer ingameEvents;
    private DiscordChatBridge discordChatBridge;
    private DiscordChatConfig discordChatConfig;

    @Override
    public void onEnable() {
        RootRecordCloudConfig.ensureDefaults(this);
        yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        yamlConfig.load();
        reloadLocalConfig();

        if (!rootStatConfig.hasServerCredentials()) {
            getLogger().warning(
                    "Server credentials missing — set plugins/RootRecord/cloud.yml "
                            + "(register server in plugins/RootRecord/cloud.yml)");
        }

        initMysql();

        cloudApi = new CloudApiClient(rootStatConfig);
        heartbeatClient = new CloudHeartbeatClient(rootMcConfig, getDescription().getVersion());
        updateService = new PluginUpdateService(this);
        economyCollector = new EconomyCollector(this);
        ingameEvents = new IngameEventBuffer(yamlConfig.config().getInt("ingame.max-pending-events", 64));
        syncTask = new SyncTask(this);
        syncTask.start();
        heartbeatTask = new HeartbeatTask(this);
        heartbeatTask.start();
        heartbeatTask.runSafe();

        registerCommands();
        getServer().getPluginManager().registerEvents(new PlayerSessionListener(this), this);
        getServer().getPluginManager().registerEvents(new ShopSignListener(this), this);
        new ShopPriceCapHooks(this).register();

        registerPlaceholderExpansionIfPresent();

        economyCollector.shopListingService().logDetectedProviders();
        startDiscordChatBridge();
        getLogger().info("RootMC enabled — RootMC linking, McMMO, economy, in-game capture, app sync.");
    }

    @Override
    public void onDisable() {
        if (discordChatBridge != null) {
            discordChatBridge.stop();
            discordChatBridge = null;
        }
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

            rootShopsStore = new RootShopsStore(rootStatConfig, () -> playerStore.openConnection());
            rootShopsStore.initSchema();

            getLogger().info("MySQL ready (" + rootStatConfig.mysqlDatabase() + ").");
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
            playerStore = null;
            playtimeStore = null;
            mcmmoReader = null;
            rootShopsStore = null;
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
        var handler = new RootStatCommand(this);
        var valueHandler = new ValueCommand(this);
        var ingameHandler = new RootMcCommand(this, ingameEvents);
        bind("rootstat", handler, handler);
        bind("value", valueHandler, valueHandler);
        for (String name : List.of("rootmc", "link", "waypoint", "note", "notes", "waypoints", "vault")) {
            bind(name, ingameHandler, ingameHandler);
        }
    }

    private void bind(String name, org.bukkit.command.CommandExecutor executor, org.bukkit.command.TabCompleter tab) {
        var cmd = getCommand(name);
        if (cmd != null) {
            cmd.setExecutor(executor);
            cmd.setTabCompleter(tab);
        }
    }

    public IngameEventBuffer ingameEvents() {
        return ingameEvents;
    }

    public void flushIngameEventsAsync() {
        if (cloudApi == null || ingameEvents == null) {
            return;
        }
        var batch = ingameEvents.drain();
        if (batch.isEmpty()) {
            return;
        }
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                cloudApi.syncIngameEvents(batch);
            } catch (Exception ex) {
                getLogger().warning("In-game event sync failed: " + ex.getMessage());
                batch.forEach(ingameEvents::enqueue);
            }
        });
    }

    public void claimVaultAsync(Player player) {
        if (cloudApi == null) {
            return;
        }
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                var result = cloudApi.claimVaultOrders(player.getUniqueId().toString());
                getServer().getScheduler().runTask(this, () -> deliverVaultItems(player, result));
            } catch (Exception ex) {
                getServer().getScheduler().runTask(this, () ->
                        player.sendMessage(colorize("&cVault claim failed: &f" + ex.getMessage())));
            }
        });
    }

    private void deliverVaultItems(Player player, CloudApiClient.VaultClaimResult result) {
        if (result.items().isEmpty()) {
            player.sendMessage(colorize("&7No pending vault items."));
            return;
        }
        int delivered = 0;
        for (CloudApiClient.VaultClaimResult.VaultItem item : result.items()) {
            Material mat = Material.matchMaterial(item.itemKey());
            if (mat == null || mat.isAir()) {
                continue;
            }
            int remaining = item.quantity();
            while (remaining > 0) {
                int stack = Math.min(remaining, mat.getMaxStackSize());
                var leftover = player.getInventory().addItem(new ItemStack(mat, stack));
                if (!leftover.isEmpty()) {
                    leftover.values().forEach(stackItem ->
                            player.getWorld().dropItemNaturally(player.getLocation(), stackItem));
                }
                remaining -= stack;
                delivered += stack;
            }
        }
        player.sendMessage(msg("vault-claimed").replace("{count}", String.valueOf(delivered)));
    }

    @Override
    public double averagePrice(String itemKey) {
        double live = liveInStockMedian(itemKey);
        if (live > 0) {
            return live;
        }
        if (economyCollector == null) {
            return 0;
        }
        return economyCollector.priceRegistry().averagePrice(itemKey);
    }

    private static double liveInStockMedian(String itemKey) {
        var plugin = org.bukkit.Bukkit.getPluginManager().getPlugin("RootMC-Shops");
        if (plugin instanceof RootMcShopsExporter exporter) {
            return exporter.medianInStockSellPrice(itemKey);
        }
        return 0;
    }

    @Override
    public double maxAllowedPrice(String itemKey, double capPercentOverAvg) {
        if (economyCollector == null) {
            return Double.MAX_VALUE;
        }
        return economyCollector.priceRegistry().maxAllowedPrice(itemKey, capPercentOverAvg);
    }

    public void reloadLocalConfig() {
        if (yamlConfig == null) {
            yamlConfig = new RootRecordYamlConfig(this, CONFIG_FILE, CONFIG_FILE);
        }
        yamlConfig.reload();
        rootMcConfig = RootMcConfig.from(this, yamlConfig.config());
        rootStatConfig = RootStatConfig.from(this, yamlConfig.config());
        discordChatConfig = DiscordChatConfig.from(yamlConfig.config());
        if (cloudApi != null) {
            cloudApi.updateConfig(rootStatConfig);
        }
        if (heartbeatClient != null) {
            heartbeatClient.updateConfig(rootMcConfig, getDescription().getVersion());
        }
        if (economyCollector != null) {
            economyCollector = new EconomyCollector(this);
        }
        startDiscordChatBridge();
    }

    private void startDiscordChatBridge() {
        if (discordChatBridge != null) {
            discordChatBridge.stop();
            discordChatBridge = null;
        }
        if (discordChatConfig == null) {
            discordChatConfig = DiscordChatConfig.from(yamlConfig.config());
        }
        if (!discordChatConfig.enabled()) {
            return;
        }
        discordChatBridge = new DiscordChatBridge(this, discordChatConfig);
        discordChatBridge.start();
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

    public RootMcConfig rootMcConfig() {
        return rootMcConfig;
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

    /** Called by RootMC-Shops after a sale so web stock counts refresh without waiting for the 5-min cron. */
    public void requestEconomySync() {
        if (syncTask != null) {
            syncTask.requestEconomySync();
        }
    }

    @Override
    public EconomyCollector economy() {
        return economyCollector;
    }

    @Override
    public RootShopsStore rootShops() {
        return rootShopsStore;
    }

    @Override
    public String msg(String key) {
        String prefix = yamlConfig.config().getString("messages.prefix", "&8[&2RootMC&8]&r ");
        String body = yamlConfig.config().getString("messages." + key);
        if (body == null || body.isBlank() || body.equals(key)) {
            body = MESSAGE_DEFAULTS.getOrDefault(key, key);
        }
        return colorize(prefix + body);
    }

    private void registerPlaceholderExpansionIfPresent() {
        var papi = getServer().getPluginManager().getPlugin("PlaceholderAPI");
        if (papi == null || !papi.isEnabled()) {
            return;
        }
        try {
            Class.forName(
                    "me.clip.placeholderapi.expansion.PlaceholderExpansion",
                    false,
                    papi.getClass().getClassLoader());
            new RootStatExpansion(this, "rootmc").register();
            new RootStatExpansion(this, "rootstat").register();
            getLogger().info("PlaceholderAPI expansions registered (rootmc, rootstat legacy).");
        } catch (Throwable ex) {
            getLogger().info("PlaceholderAPI expansion skipped: " + ex.getMessage());
        }
    }
}
