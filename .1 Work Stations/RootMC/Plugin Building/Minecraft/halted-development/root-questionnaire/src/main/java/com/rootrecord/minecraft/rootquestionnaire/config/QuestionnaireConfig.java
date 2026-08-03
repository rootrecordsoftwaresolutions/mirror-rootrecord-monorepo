package com.rootrecord.minecraft.rootquestionnaire.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public record QuestionnaireConfig(
        boolean enabled,
        double rewardGold,
        long minPlaytimeSeconds,
        int sessionTimeoutMinutes,
        boolean mysqlEnabled,
        String jdbcUrl,
        String mysqlUsername,
        String mysqlPassword,
        String tablePrefix,
        String completionsTable,
        String playtimeTableFqn,
        String prefix,
        Map<String, String> messages) {

    public static QuestionnaireConfig from(FileConfiguration cfg) {
        if (cfg == null) {
            return defaults();
        }
        String host = cfg.getString("mysql.host", "");
        int port = cfg.getInt("mysql.port", 3306);
        String database = cfg.getString("mysql.database", "");
        String username = cfg.getString("mysql.username", "");
        String password = cfg.getString("mysql.password", "");
        String prefix = cfg.getString("mysql.table-prefix", "root_");
        String jdbcParams = cfg.getString("mysql.jdbc-params", "");
        String playtimeTable = cfg.getString("mysql.playtime-table", "rootmc_playtime");
        boolean mysqlEnabled = cfg.getBoolean("mysql.enabled", false)
                && host != null && !host.isBlank()
                && database != null && !database.isBlank();

        String jdbcUrl = "jdbc:mysql://" + host + ":" + port + "/" + database
                + (jdbcParams.isBlank() ? "" : "?" + jdbcParams);

        Map<String, String> messages = new HashMap<>();
        if (cfg.isConfigurationSection("messages")) {
            for (String key : cfg.getConfigurationSection("messages").getKeys(false)) {
                messages.put(key, cfg.getString("messages." + key, ""));
            }
        }

        return new QuestionnaireConfig(
                cfg.getBoolean("enabled", true),
                cfg.getDouble("reward-gold", 50),
                cfg.getLong("min-playtime-seconds", 3600),
                cfg.getInt("session-timeout-minutes", 30),
                mysqlEnabled,
                jdbcUrl,
                username,
                password,
                prefix,
                prefix + "questionnaire_completions",
                prefix + playtimeTable,
                cfg.getString("messages.prefix", ""),
                Collections.unmodifiableMap(messages));
    }

    private static QuestionnaireConfig defaults() {
        return new QuestionnaireConfig(
                true, 50, 3600, 30, false, "", "", "", "root_",
                "root_questionnaire_completions", "root_rootmc_playtime", "",
                Map.of());
    }

    public boolean mysqlConfigured() {
        return mysqlEnabled;
    }
}
