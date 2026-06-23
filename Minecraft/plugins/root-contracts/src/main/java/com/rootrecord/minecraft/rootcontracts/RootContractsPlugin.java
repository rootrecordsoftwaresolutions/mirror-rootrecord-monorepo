package com.rootrecord.minecraft.rootcontracts;

import com.rootrecord.minecraft.common.RootMcEconomyResolver;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import com.rootrecord.minecraft.rootcontracts.command.ContractCommand;
import com.rootrecord.minecraft.rootcontracts.command.RootContractsAdminCommand;
import com.rootrecord.minecraft.rootcontracts.config.ContractsConfig;
import com.rootrecord.minecraft.rootcontracts.config.ContractsMessages;
import com.rootrecord.minecraft.rootcontracts.data.ContractsStore;
import com.rootrecord.minecraft.rootcontracts.service.ContractService;
import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.text.DecimalFormat;

public final class RootContractsPlugin extends JavaPlugin {

    private RootRecordYamlConfig yamlConfig;
    private ContractsConfig contractsConfig;
    private ContractsMessages messages;
    private ContractsStore store;
    private ContractService contracts;
    private final DecimalFormat moneyFmt = new DecimalFormat("0.00");

    @Override
    public void onEnable() {
        RootRecordFolders.ensureDir(this);
        yamlConfig = new RootRecordYamlConfig(this, RootRecordFolders.ROOT_CONTRACTS_CONFIG, "root-contracts.yml");
        yamlConfig.load();
        contracts = new ContractService(this);
        reloadLocalConfig();

        if (!contracts.enabled()) {
            getLogger().severe("Root-Contracts could not start — check MySQL and Root-Essentials economy.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        registerCommands();
        getLogger().info("Root-Contracts enabled.");
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
        }
        FileConfiguration cfg = yamlConfig != null ? yamlConfig.config() : null;
        contractsConfig = ContractsConfig.from(cfg);
        contractsConfig = withMysqlFallback(contractsConfig, cfg);
        messages = ContractsMessages.from(cfg);
        store = new ContractsStore(contractsConfig);
        try {
            store.initSchema();
        } catch (Exception ex) {
            getLogger().severe("MySQL init failed: " + ex.getMessage());
        }
        contracts.reload(contractsConfig, store, resolveEconomy());
    }

    private ContractsConfig withMysqlFallback(ContractsConfig base, FileConfiguration cfg) {
        if (!needsMysqlFallback(base)) {
            return base;
        }
        File essentials = RootRecordFolders.configFile(this, RootRecordFolders.ROOT_ESSENTIALS_CONFIG);
        if (essentials.isFile()) {
            ContractsConfig fromEssentials = mysqlFrom(YamlConfiguration.loadConfiguration(essentials), cfg);
            if (!needsMysqlFallback(fromEssentials)) {
                return fromEssentials;
            }
        }
        File rootmc = RootRecordFolders.configFile(this, RootRecordFolders.ROOTMC_CONFIG);
        if (rootmc.isFile()) {
            ContractsConfig fromRootMc = mysqlFrom(YamlConfiguration.loadConfiguration(rootmc), cfg);
            if (!needsMysqlFallback(fromRootMc)) {
                return fromRootMc;
            }
        }
        return base;
    }

    private static ContractsConfig mysqlFrom(FileConfiguration mysqlSource, FileConfiguration contractCfg) {
        ContractsConfig base = ContractsConfig.from(contractCfg);
        String prefix = mysqlSource.getString("mysql.table-prefix", base.mysqlTablePrefix()).trim();
        return new ContractsConfig(
                base.mysqlEnabled(),
                mysqlSource.getString("mysql.host", base.mysqlHost()).trim(),
                mysqlSource.getInt("mysql.port", base.mysqlPort()),
                mysqlSource.getString("mysql.database", base.mysqlDatabase()).trim(),
                mysqlSource.getString("mysql.username", base.mysqlUsername()).trim(),
                mysqlSource.getString("mysql.password", base.mysqlPassword()),
                prefix.isBlank() ? base.mysqlTablePrefix() : prefix,
                mysqlSource.getString("mysql.jdbc-params", base.mysqlJdbcParams()),
                base.enabled(),
                base.minAmount(),
                base.maxAmount(),
                base.maxOpenPerPlayer());
    }

    private static boolean needsMysqlFallback(ContractsConfig cfg) {
        return cfg.mysqlHost().isBlank() || cfg.mysqlDatabase().isBlank() || cfg.mysqlUsername().isBlank();
    }

    private void registerCommands() {
        var contract = getCommand("contract");
        if (contract != null) {
            contract.setExecutor(new ContractCommand(this));
        }
        var admin = getCommand("rootcontracts");
        if (admin != null) {
            admin.setExecutor(new RootContractsAdminCommand(this));
        }
    }

    private com.rootrecord.minecraft.common.RootMcEconomyService resolveEconomy() {
        return RootMcEconomyResolver.resolve(this);
    }

    public ContractsConfig contractsConfig() {
        return contractsConfig;
    }

    public ContractService contracts() {
        return contracts;
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
