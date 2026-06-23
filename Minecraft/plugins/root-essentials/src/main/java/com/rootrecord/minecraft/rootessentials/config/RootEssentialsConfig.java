package com.rootrecord.minecraft.rootessentials.config;

import org.bukkit.Material;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import com.rootrecord.minecraft.rootessentials.util.WorthLoader;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public record RootEssentialsConfig(
        String mysqlHost,
        int mysqlPort,
        String mysqlDatabase,
        String mysqlUsername,
        String mysqlPassword,
        String mysqlTablePrefix,
        String mysqlJdbcParams,
        double startingBalance,
        String currencySymbol,
        String worthFile,
        String defaultHomeName,
        int maxHomesDefault,
        int maxHomesPro,
        int maxHomesLifetime,
        String spawnWorld,
        List<String> motdLines,
        List<String> rulesLines,
        Map<String, List<String>> kitItems,
        Map<String, Boolean> kitOneTime,
        String newbieKit,
        Map<Material, Double> worthByMaterial) {

    public static RootEssentialsConfig from(FileConfiguration cfg) {
        Map<Material, Double> worth = WorthLoader.load(
                cfg.getConfigurationSection("economy.worth"),
                cfg.getString("economy.worth-file", "").trim());

        Map<String, List<String>> kits = new HashMap<>();
        Map<String, Boolean> oneTime = new HashMap<>();
        ConfigurationSection kitsSec = cfg.getConfigurationSection("kits");
        if (kitsSec != null) {
            for (String kit : kitsSec.getKeys(false)) {
                ConfigurationSection kitSec = kitsSec.getConfigurationSection(kit);
                if (kitSec == null) continue;
                kits.put(kit.toLowerCase(Locale.ROOT), kitSec.getStringList("items"));
                oneTime.put(kit.toLowerCase(Locale.ROOT), kitSec.getInt("delay-seconds", -1) < 0);
            }
        }

        return new RootEssentialsConfig(
                cfg.getString("mysql.host", "").trim(),
                cfg.getInt("mysql.port", 3306),
                cfg.getString("mysql.database", "").trim(),
                cfg.getString("mysql.username", "").trim(),
                cfg.getString("mysql.password", "").trim(),
                cfg.getString("mysql.table-prefix", "root_").trim(),
                cfg.getString("mysql.jdbc-params",
                        "verifyServerCertificate=false&useSSL=false&useUnicode=true&characterEncoding=utf-8&serverTimezone=UTC").trim(),
                cfg.getDouble("economy.starting-balance", 0),
                cfg.getString("economy.currency-symbol", "G").trim(),
                cfg.getString("economy.worth-file", "").trim(),
                cfg.getString("homes.default-name", "home").trim(),
                cfg.getInt("homes.max.default", 3),
                cfg.getInt("homes.max.pro", 5),
                cfg.getInt("homes.max.lifetime", 8),
                cfg.getString("spawn.world", "").trim(),
                cfg.getStringList("server.motd"),
                cfg.getStringList("server.rules"),
                Collections.unmodifiableMap(kits),
                Collections.unmodifiableMap(oneTime),
                cfg.getString("newbie-kit", "starter").trim(),
                worth);
    }
}
