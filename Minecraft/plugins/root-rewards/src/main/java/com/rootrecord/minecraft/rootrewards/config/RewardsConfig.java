package com.rootrecord.minecraft.rootrewards.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

public record RewardsConfig(
        boolean mysqlEnabled,
        String mysqlHost,
        int mysqlPort,
        String mysqlDatabase,
        String mysqlUsername,
        String mysqlPassword,
        String mysqlTablePrefix,
        String mysqlJdbcParams,
        int playtimeCheckIntervalSeconds,
        boolean useRootMcPlaytime,
        String rootmcPlaytimeTable,
        int voteGoldMin,
        int voteGoldMax,
        int voteCooldownHours,
        List<VoteLink> voteLinks) {

    public record VoteLink(String name, String url) {}

    public int rollVoteGold() {
        if (voteGoldMax <= voteGoldMin) {
            return voteGoldMin;
        }
        return ThreadLocalRandom.current().nextInt(voteGoldMin, voteGoldMax + 1);
    }

    public static RewardsConfig from(FileConfiguration cfg) {
        List<VoteLink> links = new ArrayList<>();
        if (cfg.isList("vote.links")) {
            for (var raw : cfg.getMapList("vote.links")) {
                Object nameObj = raw.get("name");
                Object urlObj = raw.get("url");
                String name = nameObj == null ? "" : String.valueOf(nameObj).trim();
                String url = urlObj == null ? "" : String.valueOf(urlObj).trim();
                if (!name.isEmpty() && !url.isEmpty()) {
                    links.add(new VoteLink(name, url));
                }
            }
        }
        int goldMin = Math.max(1, cfg.getInt("vote.gold-min", 1));
        int legacyGold = (int) Math.max(1, Math.rint(cfg.getDouble("vote.gold", 20)));
        int goldMax = Math.max(goldMin, cfg.getInt("vote.gold-max", legacyGold));
        return new RewardsConfig(
                cfg.getBoolean("mysql.enabled", true),
                cfg.getString("mysql.host", "127.0.0.1"),
                cfg.getInt("mysql.port", 3306),
                cfg.getString("mysql.database", "minecraft"),
                cfg.getString("mysql.username", "root"),
                cfg.getString("mysql.password", ""),
                cfg.getString("mysql.table-prefix", "root_"),
                cfg.getString("mysql.jdbc-params", "useSSL=false&serverTimezone=UTC"),
                Math.max(30, cfg.getInt("playtime.check-interval-seconds", 60)),
                cfg.getBoolean("playtime.use-rootmc-playtime", true),
                cfg.getString("playtime.rootmc-playtime-table", "rootmc_playtime"),
                goldMin,
                goldMax,
                Math.max(1, cfg.getInt("vote.cooldown-hours", 24)),
                List.copyOf(links));
    }

    public String playtimeTableFqn() {
        return mysqlTablePrefix + rootmcPlaytimeTable;
    }

    public String claimsTable() {
        return mysqlTablePrefix + "rewards_claims";
    }

    public String fallbackPlaytimeTable() {
        return mysqlTablePrefix + "rewards_playtime";
    }

    public String votesTable() {
        return mysqlTablePrefix + "rewards_votes";
    }
}
