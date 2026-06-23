package com.rootrecord.minecraft.rootloans.config;

import org.bukkit.configuration.file.FileConfiguration;

public record LoansConfig(
        boolean mysqlEnabled,
        String mysqlHost,
        int mysqlPort,
        String mysqlDatabase,
        String mysqlUsername,
        String mysqlPassword,
        String mysqlTablePrefix,
        String mysqlJdbcParams,
        boolean enabled,
        double interestRate,
        double startingMaxLoan,
        double maxLoanMultiplier,
        double hardCap,
        int maxTakesPer24h,
        double incomeSweepPercent,
        boolean goldOreRepayment) {

    public static LoansConfig from(FileConfiguration cfg) {
        return new LoansConfig(
                cfg.getBoolean("mysql.enabled", true),
                cfg.getString("mysql.host", "").trim(),
                cfg.getInt("mysql.port", 3306),
                cfg.getString("mysql.database", "").trim(),
                cfg.getString("mysql.username", "").trim(),
                cfg.getString("mysql.password", ""),
                cfg.getString("mysql.table-prefix", "root_").trim(),
                cfg.getString("mysql.jdbc-params",
                        "verifyServerCertificate=false&useSSL=false&useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC"),
                cfg.getBoolean("loan.enabled", true),
                Math.max(0, cfg.getDouble("loan.interest-rate", 0.10)),
                Math.max(1, cfg.getDouble("loan.starting-max-loan", 50.0)),
                Math.max(1.0, cfg.getDouble("loan.max-loan-multiplier", 1.1)),
                Math.max(1, cfg.getDouble("loan.hard-cap", 500.0)),
                Math.max(1, cfg.getInt("loan.max-takes-per-24h", 3)),
                Math.min(1.0, Math.max(0, cfg.getDouble("loan.income-sweep-percent", 1.0))),
                cfg.getBoolean("loan.gold-ore-repayment", true));
    }

    public String activeTable() {
        return mysqlTablePrefix + "loans_active";
    }

    public String creditTable() {
        return mysqlTablePrefix + "loans_credit";
    }

    public String takeLogTable() {
        return mysqlTablePrefix + "loans_take_log";
    }
}
