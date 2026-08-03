package com.rootrecord.minecraft.rootcontracts.config;

import org.bukkit.configuration.file.FileConfiguration;

public record ContractsConfig(
        boolean mysqlEnabled,
        String mysqlHost,
        int mysqlPort,
        String mysqlDatabase,
        String mysqlUsername,
        String mysqlPassword,
        String mysqlTablePrefix,
        String mysqlJdbcParams,
        boolean enabled,
        double minAmount,
        double maxAmount,
        int maxOpenPerPlayer) {

    public String contractsTable() {
        return mysqlTablePrefix() + "contracts";
    }

    public static ContractsConfig from(FileConfiguration cfg) {
        if (cfg == null) {
            return defaults();
        }
        return new ContractsConfig(
                cfg.getBoolean("mysql.enabled", true),
                cfg.getString("mysql.host", "").trim(),
                cfg.getInt("mysql.port", 3306),
                cfg.getString("mysql.database", "").trim(),
                cfg.getString("mysql.username", "").trim(),
                cfg.getString("mysql.password", ""),
                cfg.getString("mysql.table-prefix", "root_").trim(),
                cfg.getString("mysql.jdbc-params",
                        "verifyServerCertificate=false&useSSL=false&allowPublicKeyRetrieval=true&useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC"),
                cfg.getBoolean("contracts.enabled", true),
                Math.max(0.01, cfg.getDouble("contracts.min-amount", 1.0)),
                Math.max(1.0, cfg.getDouble("contracts.max-amount", 10000.0)),
                Math.max(1, cfg.getInt("contracts.max-open-per-player", 5)));
    }

    private static ContractsConfig defaults() {
        return new ContractsConfig(true, "", 3306, "", "", "", "root_", "", true, 1.0, 10000.0, 5);
    }
}
