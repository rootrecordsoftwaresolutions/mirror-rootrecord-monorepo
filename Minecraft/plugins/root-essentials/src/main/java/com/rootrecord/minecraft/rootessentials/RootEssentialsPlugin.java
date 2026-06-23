package com.rootrecord.minecraft.rootessentials;

import com.rootrecord.minecraft.common.RootMcEconomyBridge;
import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootMcIncomeSweepResult;
import com.rootrecord.minecraft.common.RootMcLoanService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootessentials.command.*;
import com.rootrecord.minecraft.rootessentials.config.RootEssentialsConfig;
import com.rootrecord.minecraft.rootessentials.data.*;
import com.rootrecord.minecraft.rootessentials.listener.EssentialsListener;
import com.rootrecord.minecraft.rootessentials.util.Permissions;
import com.rootrecord.minecraft.rootessentials.service.PlayerStateService;
import com.rootrecord.minecraft.rootessentials.service.TeleportWarmupService;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.ServicePriority;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.text.DecimalFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

public final class RootEssentialsPlugin extends JavaPlugin implements RootMcEconomyService {

    private RootRecordYamlConfig yaml;
    private RootEssentialsConfig config;
    private EconomyStore economy;
    private HomeStore homes;
    private MailStore mail;
    private ModerationStore moderation;
    private KitClaimStore kitClaims;
    private SpawnStore spawnStore;
    private WarpStore warps;
    private PlayerPrefsStore playerPrefs;
    private final PlayerStateService playerState = new PlayerStateService();
    private TeleportWarmupService teleportWarmup;
    private final DecimalFormat moneyFmt = new DecimalFormat("0.00");
    private com.rootrecord.minecraft.rootessentials.economy.RootEssentialsVaultEconomy vaultEconomy;

    @Override
    public void onEnable() {
        yaml = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_ESSENTIALS_CONFIG, RootRecordFolders.ROOT_ESSENTIALS_CONFIG);
        yaml.load();
        reloadLocalConfig();
        try {
            MySqlSupport sql = new MySqlSupport(config);
            economy = new EconomyStore(sql, config.mysqlTablePrefix(), config.startingBalance());
            homes = new HomeStore(sql, config.mysqlTablePrefix());
            mail = new MailStore(sql, config.mysqlTablePrefix());
            moderation = new ModerationStore(sql, config.mysqlTablePrefix());
            kitClaims = new KitClaimStore(sql, config.mysqlTablePrefix());
            spawnStore = new SpawnStore(sql, config.mysqlTablePrefix());
            warps = new WarpStore(sql, config.mysqlTablePrefix());
            playerPrefs = new PlayerPrefsStore(sql, config.mysqlTablePrefix());
            economy.initSchema();
            homes.initSchema();
            mail.initSchema();
            moderation.initSchema();
            kitClaims.initSchema();
            spawnStore.initSchema();
            warps.initSchema();
            playerPrefs.initSchema();
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        registerCommands();
        teleportWarmup = new TeleportWarmupService(this);
        reloadTeleportSettings();
        getServer().getPluginManager().registerEvents(new EssentialsListener(this), this);
        getServer().getServicesManager().register(RootMcEconomyService.class, this, this, ServicePriority.Normal);
        registerVaultEconomy();
        getLogger().info("Root Essentials enabled (full EssentialsX parity set).");
    }

    private void registerVaultEconomy() {
        if (Bukkit.getPluginManager().getPlugin("Vault") == null) {
            getLogger().warning("Vault not found — Towny economy bridge not registered (install Vault.jar).");
            return;
        }
        vaultEconomy = new com.rootrecord.minecraft.rootessentials.economy.RootEssentialsVaultEconomy(this);
        getServer().getServicesManager().register(
                net.milkbowl.vault.economy.Economy.class,
                vaultEconomy,
                this,
                ServicePriority.High);
        getLogger().info("Registered RootMC economy with Vault (Towny-compatible).");
    }

    private void registerCommands() {
        bind("balance", new BalanceCommand(this));
        bind("bal", new BalanceCommand(this));
        bind("pay", new PayCommand(this));
        bind("paytoggle", new EconomyCommands.Paytoggle(this));
        bind("baltop", new EconomyCommands.Baltop(this));
        bind("balancetop", new EconomyCommands.Baltop(this));
        bind("sell", new SellCommand(this));
        bind("mint", new MintCommand(this));
        bind("spawn", new SpawnCommand(this));
        bind("sethome", new HomeCommands(this, "set"));
        bind("home", new HomeCommands(this, "go"));
        bind("delhome", new HomeCommands(this, "del"));
        bind("renamehome", new RenameHomeCommand(this));
        bind("homes", new HomesCommand(this));
        bind("tpa", new TeleportCommands.Tpa(this));
        bind("tpaccept", new TeleportCommands.TpAccept(this));
        bind("tpdeny", new TeleportCommands.TpDeny(this));
        bind("tpahere", new TeleportCommands.TpaHere(this));
        bind("back", new TeleportCommands.Back(this));
        bind("msg", new SocialCommands.Msg(this));
        bind("reply", new SocialCommands.Reply(this));
        bind("r", new SocialCommands.Reply(this));
        bind("mail", new SocialCommands.Mail(this));
        bind("me", new SocialCommands.Me(this));
        bind("ignore", new SocialCommands.Ignore(this));
        bind("unignore", new SocialCommands.Unignore(this));
        bind("kit", new KitCommand(this));
        bind("worth", new InfoCommands.Worth(this));
        bind("help", new InfoCommands.Help(this));
        bind("list", new InfoCommands.List(this));
        bind("motd", new InfoCommands.Motd(this));
        bind("rules", new InfoCommands.Rules(this));
        bind("ping", new InfoCommands.Ping(this));
        bind("compass", new InfoCommands.Compass(this));
        bind("depth", new InfoCommands.Depth(this));
        bind("getpos", new InfoCommands.GetPos(this));
        bind("near", new InfoCommands.Near(this));
        bind("afk", new InfoCommands.Afk(this));
        bind("nick", new CosmeticCommands.Nick(this));
        bind("hat", new CosmeticCommands.Hat(this));
        var warpCmd = new WarpCommands.Warp(this);
        bind("warp", warpCmd);
        var warpCommand = getCommand("warp");
        if (warpCommand != null) warpCommand.setTabCompleter(warpCmd);
        bind("warps", new WarpCommands.Warps(this));
        bind("feed", new PlayerUtilCommands.Feed(this));
        bind("heal", new PlayerUtilCommands.Heal(this));
        bind("repair", new PlayerUtilCommands.Repair(this));
        bind("top", new PlayerUtilCommands.Top(this));
        bind("clear", new PlayerUtilCommands.Clear(this));
        bind("clearinventory", new PlayerUtilCommands.Clear(this));
        bind("trash", new PlayerUtilCommands.Trash(this));
        bind("disposal", new PlayerUtilCommands.Trash(this));
        bind("suicide", new PlayerUtilCommands.Suicide(this));
        bind("kill", new PlayerUtilCommands.Suicide(this));
        bind("seen", new PlayerUtilCommands.Seen(this));
        bind("ptime", new ExtraCommands.Ptime(this));
        bind("more", new ExtraCommands.More(this));
        bind("workbench", new ExtraCommands.Workbench(this));
        bind("craft", new ExtraCommands.Workbench(this));
        bind("anvil", new ExtraCommands.Anvil(this));
        bind("jump", new ExtraCommands.Jump(this));
        bind("tpauto", new TeleportCommands.TpAuto(this));
        bind("show", new ShowCommands.ShowHand(this));
        bind("showhand", new ShowCommands.ShowHand(this));
    }

    private void bind(String name, org.bukkit.command.CommandExecutor executor) {
        var cmd = getCommand(name);
        if (cmd != null) cmd.setExecutor(executor);
    }

    @Override
    public void onDisable() {
        if (vaultEconomy != null) {
            getServer().getServicesManager().unregister(net.milkbowl.vault.economy.Economy.class, vaultEconomy);
            vaultEconomy = null;
        }
        getServer().getServicesManager().unregister(RootMcEconomyService.class, this);
    }

    public void reloadLocalConfig() {
        yaml.reload();
        config = RootEssentialsConfig.from(yaml.config());
        reloadTeleportSettings();
        if (shouldUseRootMcMysql(config)) {
            var fallback = loadRootMcMysql();
            if (fallback != null) {
                config = fallback;
            }
        }
    }

    /** Legacy host templates used localhost/CHANGE_ME; inherit Shockbyte creds from rootmc.yml. */
    private static boolean shouldUseRootMcMysql(RootEssentialsConfig cfg) {
        if (cfg.mysqlHost().isBlank() || cfg.mysqlDatabase().isBlank() || cfg.mysqlUsername().isBlank()) {
            return true;
        }
        String pass = cfg.mysqlPassword();
        if (pass.isBlank() || "CHANGE_ME".equalsIgnoreCase(pass)) {
            return true;
        }
        if ("localhost".equalsIgnoreCase(cfg.mysqlHost()) || "127.0.0.1".equals(cfg.mysqlHost())) {
            return true;
        }
        return "minecraft".equalsIgnoreCase(cfg.mysqlDatabase())
                || "minecraft_user".equalsIgnoreCase(cfg.mysqlUsername());
    }

    private RootEssentialsConfig loadRootMcMysql() {
        File rootmc = RootRecordFolders.configFile(this, RootRecordFolders.ROOTMC_CONFIG);
        if (!rootmc.isFile()) return null;
        var bn = YamlConfiguration.loadConfiguration(rootmc);
        String host = bn.getString("mysql.host", "").trim();
        String db = bn.getString("mysql.database", "").trim();
        String user = bn.getString("mysql.username", "").trim();
        String pass = bn.getString("mysql.password", "").trim();
        if (host.isBlank() || db.isBlank() || user.isBlank()) return null;
        return new RootEssentialsConfig(host, bn.getInt("mysql.port", 3306), db, user, pass,
                bn.getString("mysql.table-prefix", "root_").trim(),
                bn.getString("mysql.jdbc-params",
                        "verifyServerCertificate=false&useSSL=false&useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC").trim(),
                config.startingBalance(), config.currencySymbol(), config.worthFile(),
                config.defaultHomeName(), config.maxHomesDefault(), config.maxHomesPro(), config.maxHomesLifetime(),
                config.spawnWorld(), config.motdLines(), config.rulesLines(),
                config.kitItems(), config.kitOneTime(), config.newbieKit(), config.worthByMaterial());
    }

    public WarpStore warps() { return warps; }

    public PlayerStateService playerState() { return playerState; }
    public TeleportWarmupService teleportWarmup() { return teleportWarmup; }

    public boolean teleportPlayer(Player player, Location destination, Runnable onSuccess) {
        return teleportWarmup.request(player, destination, onSuccess);
    }

    public boolean teleportPlayer(Player player, java.util.function.Supplier<Location> destination, Runnable onSuccess) {
        return teleportWarmup.request(player, destination, onSuccess);
    }

    private void reloadTeleportSettings() {
        if (teleportWarmup == null) {
            return;
        }
        int warmup = yaml.config().getInt("teleport.warmup-seconds", 3);
        int combat = yaml.config().getInt("teleport.combat-tag-seconds", 30);
        teleportWarmup.reload(warmup, combat);
    }
    public MailStore mail() { return mail; }
    public ModerationStore moderation() { return moderation; }
    public KitClaimStore kitClaims() { return kitClaims; }
    public SpawnStore spawnStore() { return spawnStore; }

    public List<String> motdLines() { return config.motdLines(); }
    public List<String> rulesLines() { return config.rulesLines(); }

    public List<String> kitItems(String kit) { return config.kitItems().getOrDefault(kit.toLowerCase(Locale.ROOT), List.of()); }
    public boolean kitOneTime(String kit) { return config.kitOneTime().getOrDefault(kit.toLowerCase(Locale.ROOT), true); }
    public java.util.Set<String> kitNames() { return config.kitItems().keySet(); }

    public void ensureBalanceRow(Player player) throws Exception {
        economy.balance(player.getUniqueId(), player.getName());
    }

    public void grantNewbieKit(Player player) {
        String kit = config.newbieKit();
        if (kit == null || kit.isBlank()) return;
        try {
            if (kitClaims.hasClaimed(player.getUniqueId(), kit)) return;
            for (String entry : kitItems(kit)) {
                String[] parts = entry.trim().split("\\s+");
                if (parts.length < 2) continue;
                Material mat = Material.matchMaterial(parts[0].toUpperCase(Locale.ROOT));
                if (mat == null || mat.isAir()) continue;
                int amount = Integer.parseInt(parts[1]);
                var leftover = player.getInventory().addItem(new org.bukkit.inventory.ItemStack(mat, amount));
                leftover.values().forEach(i -> player.getWorld().dropItemNaturally(player.getLocation(), i));
            }
            if (kitOneTime(kit)) kitClaims.markClaimed(player.getUniqueId(), kit);
        } catch (Exception ex) {
            getLogger().warning("Newbie kit failed for " + player.getName() + ": " + ex.getMessage());
        }
    }

    public void spyMessage(String from, String to, String body) {
        String line = "&8▎ &5Spy&8│ &f" + from + " &7→ &f" + to + "&8 &7»&f " + body;
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (playerState.isSocialSpy(online.getUniqueId())) {
                online.sendMessage(colorize(line));
            }
        }
    }

    public String msg(String key) {
        String p = yaml.config().getString("messages.prefix", "&8[&2Root Essentials&8]&r ");
        String body = yaml.config().getString("messages." + key, key);
        return colorize(p + body);
    }

    public String colorize(String input) {
        return input == null ? "" : input.replace('&', '\u00A7');
    }

    public String money(double value) {
        synchronized (moneyFmt) { return moneyFmt.format(value); }
    }

    public String currency() { return config.currencySymbol(); }
    public String defaultHomeName() { return config.defaultHomeName(); }
    public Double worth(Material material) { return config.worthByMaterial().get(material); }

    /** Shop rolling average when RootMC is online; else static worth.yml fallback. */
    public Double itemPrice(Material material) {
        if (material == null || material.isAir()) return null;
        RootMcEconomyBridge bridge = marketBridge();
        if (bridge != null) {
            double avg = bridge.averagePrice(material.name());
            if (avg > 0) return avg;
        }
        return worth(material);
    }

    public Double mintRate(Material material) {
        if (material == null) return null;
        return switch (material) {
            case GOLD_NUGGET -> 1.0 / 9.0;
            case GOLD_INGOT -> 1.0;
            case GOLD_BLOCK -> 9.0;
            default -> null;
        };
    }

    private RootMcEconomyBridge marketBridge() {
        var bn = getServer().getPluginManager().getPlugin("RootMC");
        if (bn instanceof RootMcEconomyBridge bridge) return bridge;
        return null;
    }

    public boolean marketBridgeAvailable() {
        return marketBridge() != null;
    }

    public double balance(UUID uuid, String username) throws Exception { return economy.balance(uuid, username); }

    public RootMcIncomeSweepResult depositIncome(UUID uuid, String username, double amount) throws Exception {
        if (amount <= 0) {
            return RootMcIncomeSweepResult.allToWallet(0);
        }
        RootMcLoanService loan = resolveLoanService();
        if (loan != null) {
            RootMcIncomeSweepResult sweep = loan.applyIncome(uuid, username, amount);
            if (sweep.toWallet() > 0) {
                economy.deposit(uuid, username, sweep.toWallet());
            }
            return sweep;
        }
        economy.deposit(uuid, username, amount);
        return RootMcIncomeSweepResult.allToWallet(amount);
    }

    public void deposit(UUID uuid, String username, double amount) throws Exception { economy.deposit(uuid, username, amount); }

    public boolean transfer(Player from, Player to, double amount) throws Exception {
        if (amount <= 0) {
            return false;
        }
        boolean ok = economy.withdraw(from.getUniqueId(), from.getName(), amount);
        if (!ok) {
            return false;
        }
        depositIncome(to.getUniqueId(), to.getName(), amount);
        return true;
    }

    public int maxHomes(Player player) {
        if (player.hasPermission("essentials.sethome.multiple.lifetime")) return config.maxHomesLifetime();
        if (player.hasPermission("essentials.sethome.multiple.pro")) return config.maxHomesPro();
        return config.maxHomesDefault();
    }

    public int homeCount(UUID uuid) throws Exception { return homes.count(uuid); }
    public boolean hasHome(UUID uuid, String name) throws Exception { return homes.get(uuid, name.toLowerCase(Locale.ROOT)) != null; }
    public void setHome(UUID uuid, String name, Location loc) throws Exception { homes.upsert(uuid, name.toLowerCase(Locale.ROOT), loc); }
    public Location getHome(UUID uuid, String name) throws Exception { return homes.get(uuid, name.toLowerCase(Locale.ROOT)); }
    public boolean deleteHome(UUID uuid, String name) throws Exception { return homes.delete(uuid, name.toLowerCase(Locale.ROOT)); }
    public boolean renameHome(UUID uuid, String from, String to) throws Exception { return homes.rename(uuid, from, to); }
    public List<String> listHomeNames(UUID uuid) throws Exception { return homes.listNames(uuid); }

    public boolean acceptsPay(UUID uuid) throws Exception { return playerPrefs.acceptsPay(uuid); }
    public boolean toggleAcceptsPay(UUID uuid) throws Exception { return playerPrefs.togglePay(uuid); }

    public boolean withdraw(UUID uuid, String username, double amount) throws Exception {
        return economy.withdraw(uuid, username, amount);
    }
    public void setBalance(UUID uuid, String username, double amount) throws Exception {
        economy.setBalance(uuid, username, amount);
    }
    public void resetBalance(UUID uuid, String username) throws Exception {
        economy.resetBalance(uuid, username);
    }
    public List<EconomyStore.BalanceRow> topBalances(int limit) throws Exception {
        return economy.topBalances(limit);
    }

    public Location spawnLocation(Player player) {
        try {
            Location stored = spawnStore.get();
            if (stored != null) return stored;
        } catch (Exception ignored) {}
        String configuredWorld = config.spawnWorld();
        var world = !configuredWorld.isBlank()
                ? getServer().getWorld(configuredWorld)
                : (player.getWorld() != null ? player.getWorld() : getServer().getWorlds().stream().findFirst().orElse(null));
        return world == null ? null : world.getSpawnLocation();
    }

    @Override public double balance(UUID playerId) {
        var p = getServer().getPlayer(playerId);
        try { return economy.balance(playerId, p != null ? p.getName() : "player"); }
        catch (Exception ex) { return 0; }
    }
    @Override public boolean has(UUID playerId, double amount) { return balance(playerId) >= amount; }
    @Override public boolean withdraw(UUID playerId, double amount) {
        var p = getServer().getPlayer(playerId);
        try { return economy.withdraw(playerId, p != null ? p.getName() : "player", amount); }
        catch (Exception ex) { return false; }
    }
    @Override public void deposit(UUID playerId, double amount) {
        var p = getServer().getPlayer(playerId);
        try { deposit(playerId, p != null ? p.getName() : "player", amount); }
        catch (Exception ignored) {}
    }
    @Override public void depositIncome(UUID playerId, double amount) {
        var p = getServer().getPlayer(playerId);
        try { depositIncome(playerId, p != null ? p.getName() : "player", amount); }
        catch (Exception ignored) {}
    }

    public java.util.Optional<RootMcLoanService.LoanBalanceSummary> loanSummary(UUID uuid) {
        RootMcLoanService loan = resolveLoanService();
        return loan != null ? loan.balanceSummary(uuid) : java.util.Optional.empty();
    }

    private RootMcLoanService resolveLoanService() {
        RegisteredServiceProvider<RootMcLoanService> rsp =
                getServer().getServicesManager().getRegistration(RootMcLoanService.class);
        return rsp != null ? rsp.getProvider() : null;
    }
}
