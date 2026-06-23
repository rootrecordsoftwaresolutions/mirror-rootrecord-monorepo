package com.rootrecord.minecraft.rootloans;

import com.rootrecord.minecraft.common.RootMcEconomyResolver;
import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootMcLoanService;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootloans.command.LoanCommand;
import com.rootrecord.minecraft.rootloans.command.RootLoansAdminCommand;
import com.rootrecord.minecraft.rootloans.config.LoansConfig;
import com.rootrecord.minecraft.rootloans.config.LoansMessages;
import com.rootrecord.minecraft.rootloans.data.LoansStore;
import com.rootrecord.minecraft.rootloans.listener.GoldOreLoanListener;
import com.rootrecord.minecraft.rootloans.service.LoanService;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.ServicePriority;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.text.DecimalFormat;

public final class RootLoansPlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private LoansConfig loansConfig;
    private LoansMessages messages;
    private LoansStore store;
    private LoanService loans;
    private final DecimalFormat moneyFmt = new DecimalFormat("0.00");

    private boolean mysqlReady;
    private boolean finishScheduled;
    private boolean commandsRegistered;

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_LOANS_CONFIG, "root-loans.yml");
        yamlConfig.load();
        loans = new LoanService(this);
        reloadLocalConfig();

        if (tryFinishEnable()) {
            return;
        }
        scheduleFinishEnable();
    }

    private void scheduleFinishEnable() {
        if (finishScheduled) {
            return;
        }
        finishScheduled = true;
        getServer().getScheduler().runTaskLater(this, () -> {
            loans.reload(loansConfig, store, resolveEconomy());
            if (tryFinishEnable()) {
                return;
            }
            getServer().getScheduler().runTaskLater(this, () -> {
                loans.reload(loansConfig, store, resolveEconomy());
                if (!tryFinishEnable()) {
                    logStartupFailure();
                    getServer().getPluginManager().disablePlugin(this);
                }
            }, 40L);
        }, 1L);
    }

    /** @return true when fully enabled */
    private boolean tryFinishEnable() {
        if (!loansConfig.enabled()) {
            return false;
        }
        if (!mysqlReady) {
            return false;
        }
        if (!loans.enabled()) {
            return false;
        }
        if (!commandsRegistered) {
            registerCommands();
            getServer().getPluginManager().registerEvents(new GoldOreLoanListener(this), this);
            getServer().getServicesManager().register(RootMcLoanService.class, loans, this, ServicePriority.Normal);
            commandsRegistered = true;
            getLogger().info("Root-Loans enabled.");
        }
        return true;
    }

    private void logStartupFailure() {
        if (!loansConfig.enabled()) {
            getLogger().severe("Root-Loans disabled — set loan.enabled: true in root-loans.yml.");
            return;
        }
        if (!mysqlReady) {
            getLogger().severe("Root-Loans disabled — MySQL schema init failed (see earlier log line).");
            return;
        }
        if (resolveEconomy() == null) {
            getLogger().severe(
                    "Root-Loans disabled — no economy. Ensure Root-Essentials started and Vault.jar is installed.");
            return;
        }
        getLogger().severe("Root-Loans could not start — check MySQL and Root-Essentials economy.");
    }

    @Override
    public void onDisable() {
        getServer().getServicesManager().unregister(RootMcLoanService.class, loans);
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        loansConfig = LoansConfig.from(cfg);
        loansConfig = withMysqlFallback(loansConfig, cfg);
        messages = LoansMessages.from(cfg);
        store = new LoansStore(loansConfig);
        mysqlReady = true;
        try {
            store.initSchema();
        } catch (Exception ex) {
            mysqlReady = false;
            getLogger().severe("MySQL init failed: " + ex.getMessage());
        }
        loans.reload(loansConfig, store, resolveEconomy());
    }

    private LoansConfig withMysqlFallback(LoansConfig base, FileConfiguration cfg) {
        if (!needsMysqlFallback(base)) {
            return base;
        }
        File essentials = RootRecordFolders.configFile(this, RootRecordFolders.ROOT_ESSENTIALS_CONFIG);
        if (essentials.isFile()) {
            LoansConfig fromEssentials = mysqlFrom(YamlConfiguration.loadConfiguration(essentials), cfg);
            if (!needsMysqlFallback(fromEssentials)) {
                return fromEssentials;
            }
        }
        File rootmc = RootRecordFolders.configFile(this, RootRecordFolders.ROOTMC_CONFIG);
        if (rootmc.isFile()) {
            LoansConfig fromRootMc = mysqlFrom(YamlConfiguration.loadConfiguration(rootmc), cfg);
            if (!needsMysqlFallback(fromRootMc)) {
                return fromRootMc;
            }
        }
        return base;
    }

    private static LoansConfig mysqlFrom(FileConfiguration mysqlSource, FileConfiguration loanCfg) {
        LoansConfig loan = LoansConfig.from(loanCfg);
        String prefix = mysqlSource.getString("mysql.table-prefix", loan.mysqlTablePrefix()).trim();
        return new LoansConfig(
                loan.mysqlEnabled(),
                mysqlSource.getString("mysql.host", loan.mysqlHost()).trim(),
                mysqlSource.getInt("mysql.port", loan.mysqlPort()),
                mysqlSource.getString("mysql.database", loan.mysqlDatabase()).trim(),
                mysqlSource.getString("mysql.username", loan.mysqlUsername()).trim(),
                mysqlSource.getString("mysql.password", loan.mysqlPassword()),
                prefix.isBlank() ? loan.mysqlTablePrefix() : prefix,
                mysqlSource.getString("mysql.jdbc-params", loan.mysqlJdbcParams()),
                loan.enabled(),
                loan.interestRate(),
                loan.startingMaxLoan(),
                loan.maxLoanMultiplier(),
                loan.hardCap(),
                loan.maxTakesPer24h(),
                loan.incomeSweepPercent(),
                loan.goldOreRepayment());
    }

    private static boolean needsMysqlFallback(LoansConfig cfg) {
        return cfg.mysqlHost().isBlank() || cfg.mysqlDatabase().isBlank() || cfg.mysqlUsername().isBlank();
    }

    private void registerCommands() {
        var loan = getCommand("loan");
        if (loan != null) {
            loan.setExecutor(new LoanCommand(this));
        }
        var admin = getCommand("rootloans");
        if (admin != null) {
            admin.setExecutor(new RootLoansAdminCommand(this));
        }
    }

    private RootMcEconomyService resolveEconomy() {
        return RootMcEconomyResolver.resolve(this);
    }

    public LoansConfig loansConfig() {
        return loansConfig;
    }

    public LoansStore store() {
        return store;
    }

    public LoanService loans() {
        return loans;
    }

    public String money(double value) {
        synchronized (moneyFmt) {
            return moneyFmt.format(value);
        }
    }

    public String colorize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        return ChatColor.translateAlternateColorCodes('&', raw);
    }

    public String msg(String key) {
        String body = yamlConfig.config().getString("messages." + key, key);
        return colorize(messages.prefix() + body);
    }
}
