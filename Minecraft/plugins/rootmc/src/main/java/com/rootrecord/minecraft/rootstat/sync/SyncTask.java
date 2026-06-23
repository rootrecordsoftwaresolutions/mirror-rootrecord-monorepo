package com.rootrecord.minecraft.rootstat.sync;

import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;
import com.rootrecord.minecraft.rootstat.model.McMMOPlayerSnapshot;
import com.rootrecord.minecraft.rootstat.model.PlayerPlaytimeRecord;
import com.rootrecord.minecraft.rootstat.model.ServerPlayerSnapshot;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;

public final class SyncTask {

    private final RootStatBridge bridge;
    private BukkitTask repeatingTask;
    private BukkitTask economyDebounceTask;
    private volatile boolean running;

    public SyncTask(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    public void start() {
        stop();
        long intervalTicks = bridge.config().syncIntervalMinutes() * 60L * 20L;
        // Delay first sync so RootMC-Shops and worlds are ready (30s after enable).
        repeatingTask = bridge.getPlugin().getServer().getScheduler().runTaskTimerAsynchronously(
                bridge.getPlugin(), this::runSyncSafe, 600L, intervalTicks);
    }

    public void stop() {
        if (repeatingTask != null) {
            repeatingTask.cancel();
            repeatingTask = null;
        }
        if (economyDebounceTask != null) {
            economyDebounceTask.cancel();
            economyDebounceTask = null;
        }
    }

    /** Debounced economy-only push (e.g. after a chest shop sale). */
    public void requestEconomySync() {
        if (!bridge.config().isEconomyEnabled() || !bridge.config().hasServerCredentials()) {
            return;
        }
        if (economyDebounceTask != null) {
            economyDebounceTask.cancel();
        }
        economyDebounceTask = bridge.getPlugin().getServer().getScheduler().runTaskLaterAsynchronously(
                bridge.getPlugin(),
                () -> {
                    economyDebounceTask = null;
                    if (running) {
                        return;
                    }
                    running = true;
                    try {
                        pushEconomyStats(false);
                    } finally {
                        running = false;
                    }
                },
                60L);
    }

    public void runSyncSafe() {
        if (running) {
            return;
        }
        running = true;
        try {
            runSync(false);
        } finally {
            running = false;
        }
    }

    public int runSync(boolean verbose) {
        if (!bridge.config().hasServerCredentials()) {
            if (verbose) {
                bridge.getPlugin().getLogger().warning("Skipping sync — server credentials not configured.");
            }
            return 0;
        }

        try {
            int count = syncLinkedPlayers(verbose);
            pushServerStats(verbose);
            // Apply Discord pays to Vault before pushing balances — keeps D1 and in-game in sync.
            applyPendingGoldTransfers(verbose);
            pushEconomyStats(verbose);
            pushTownySnapshot(verbose);
            if (bridge.getPlugin() instanceof com.rootrecord.minecraft.rootmc.RootMcPlugin bn) {
                bn.flushIngameEventsAsync();
            }
            return count;
        } catch (Exception ex) {
            bridge.getPlugin().getLogger().log(Level.WARNING, "Cloud sync failed: " + ex.getMessage(), ex);
            return -1;
        }
    }

    private int syncLinkedPlayers(boolean verbose) throws Exception {
        if (skipWhenNoPlayersOnline(verbose, "Cloud link sync")) {
            return 0;
        }
        String since = null;
        if (bridge.players() != null) {
            since = bridge.players().latestUpdatedAtIso();
        }
        List<LinkedPlayer> players = bridge.cloud().sync(since);
        int count = 0;
        if (bridge.players() != null) {
            for (LinkedPlayer player : players) {
                bridge.players().upsert(player);
                count++;
            }
        }
        if (verbose) {
            bridge.getPlugin().getLogger().info("Cloud link sync: " + count + " player(s) updated.");
        }
        return count;
    }

    private boolean skipWhenNoPlayersOnline(boolean verbose, String label) {
        if (!bridge.getPlugin().getServer().getOnlinePlayers().isEmpty()) {
            return false;
        }
        if (verbose) {
            bridge.getPlugin().getLogger().info(label + " skipped — no players online.");
        }
        return true;
    }

    private void pushServerStats(boolean verbose) {
        if (skipWhenNoPlayersOnline(verbose, "Server stats sync")) {
            return;
        }
        try {
            List<ServerPlayerSnapshot> snapshots = buildServerSnapshots();
            if (snapshots.isEmpty()) {
                if (verbose) {
                    bridge.getPlugin().getLogger().info("Server stats sync: no McMMO or playtime data to push.");
                }
                return;
            }
            int pushed = bridge.cloud().syncServerStats(snapshots);
            if (verbose) {
                bridge.getPlugin().getLogger().info("Server stats sync: " + pushed + " player(s) pushed to cloud.");
            }
        } catch (Exception ex) {
            bridge.getPlugin().getLogger().log(Level.WARNING, "Server stats sync failed: " + ex.getMessage(), ex);
        }
    }

    private void applyPendingGoldTransfers(boolean verbose) {
        if (!bridge.config().isEconomyEnabled() || !bridge.config().isEconomyVaultEnabled()) {
            return;
        }
        try {
            int applied = bridge.economy().applyPendingGoldTransfers(bridge.cloud());
            if (verbose && applied > 0) {
                bridge.getPlugin().getLogger().info("Applied " + applied + " Discord gold transfer(s) via Vault.");
            }
        } catch (Exception ex) {
            bridge.getPlugin().getLogger().log(Level.WARNING, "Discord gold transfer apply failed: " + ex.getMessage(), ex);
        }
    }

    private void pushEconomyStats(boolean verbose) {
        if (!bridge.config().isEconomyEnabled()) {
            return;
        }
        if (skipWhenNoPlayersOnline(verbose, "Economy sync")) {
            return;
        }
        try {
            var snapshot = bridge.economy().collect();
            if (snapshot.shopPrices().isEmpty()
                    && snapshot.shopListings().isEmpty()
                    && snapshot.balances().isEmpty()
                    && snapshot.playerItems().isEmpty()
                    && snapshot.serverItems().isEmpty()) {
                bridge.getPlugin().getLogger().info("Economy sync: nothing to push (no shops or balances scanned).");
                return;
            }
            bridge.cloud().syncEconomy(snapshot);
            if (bridge.rootShops() != null) {
                try {
                    bridge.rootShops().replaceSnapshot(snapshot);
                } catch (Exception mysqlEx) {
                    bridge.getPlugin().getLogger().log(Level.WARNING, "Root Shops MySQL cache failed: " + mysqlEx.getMessage());
                }
            }
            bridge.getPlugin().getLogger().info(
                    "Economy sync pushed — listings="
                            + snapshot.shopListings().size()
                            + " shopItems="
                            + snapshot.shopPrices().size()
                            + " balances="
                            + snapshot.balances().size()
                            + " players="
                            + snapshot.playerItems().size());
        } catch (Exception ex) {
            if (isChunkAccessFailure(ex)) {
                bridge.getPlugin().getLogger().warning(
                        "Economy sync skipped world scan (stale chunk data): " + ex.getMessage());
            } else {
                bridge.getPlugin().getLogger().log(Level.WARNING, "Economy sync failed: " + ex.getMessage(), ex);
            }
        }
    }

    private void pushTownySnapshot(boolean verbose) {
        if (!com.rootrecord.minecraft.rootstat.towny.TownySnapshotCollector.isAvailable()) {
            return;
        }
        if (skipWhenNoPlayersOnline(verbose, "Towny sync")) {
            return;
        }
        try {
            var snapshot = com.rootrecord.minecraft.rootstat.towny.TownySnapshotCollector.collectSnapshot(
                    bridge.getPlugin().getLogger());
            bridge.cloud().syncTownySnapshot(snapshot);
            if (verbose) {
                int towns = ((java.util.List<?>) snapshot.getOrDefault("towns", java.util.List.of())).size();
                int nations = ((java.util.List<?>) snapshot.getOrDefault("nations", java.util.List.of())).size();
                bridge.getPlugin().getLogger().info("Towny Discord sync pushed — towns=" + towns + " nations=" + nations);
            }
        } catch (Exception ex) {
            bridge.getPlugin().getLogger().log(Level.WARNING, "Towny sync failed: " + ex.getMessage(), ex);
        }
    }

    private static boolean isChunkAccessFailure(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof IllegalStateException && t.getMessage() != null
                    && t.getMessage().contains("Block entity is null")) {
                return true;
            }
        }
        return false;
    }

    private List<ServerPlayerSnapshot> buildServerSnapshots() throws Exception {
        Map<String, SnapshotBuilder> merged = new LinkedHashMap<>();

        if (bridge.config().isMcmmoEnabled() && bridge.mcmmo() != null) {
            for (McMMOPlayerSnapshot row : bridge.mcmmo().readAll()) {
                merged.computeIfAbsent(row.uuid(), SnapshotBuilder::new)
                        .username(row.username())
                        .powerLevel(row.powerLevel())
                        .skills(row.skills());
            }
        }

        if (bridge.playtime() != null) {
            for (PlayerPlaytimeRecord row : bridge.playtime().readAll()) {
                merged.computeIfAbsent(row.uuid(), SnapshotBuilder::new)
                        .username(row.username())
                        .playtimeSeconds(row.totalPlaytimeSeconds())
                        .firstJoinAt(row.firstJoinAt())
                        .lastLoginAt(row.lastLoginAt());
            }
        }

        List<ServerPlayerSnapshot> out = new ArrayList<>();
        for (SnapshotBuilder builder : merged.values()) {
            out.add(builder.build());
        }
        return out;
    }

    private static final class SnapshotBuilder {
        private final String uuid;
        private String username;
        private Integer powerLevel;
        private Map<String, Integer> skills;
        private Long playtimeSeconds;
        private String firstJoinAt;
        private String lastLoginAt;

        SnapshotBuilder(String uuid) {
            this.uuid = uuid;
        }

        SnapshotBuilder username(String value) {
            if (value != null && !value.isBlank()) {
                username = value;
            }
            return this;
        }

        SnapshotBuilder powerLevel(int value) {
            powerLevel = value;
            return this;
        }

        SnapshotBuilder skills(Map<String, Integer> value) {
            skills = value;
            return this;
        }

        SnapshotBuilder playtimeSeconds(long value) {
            playtimeSeconds = value;
            return this;
        }

        SnapshotBuilder firstJoinAt(String value) {
            if (value != null) {
                firstJoinAt = value;
            }
            return this;
        }

        SnapshotBuilder lastLoginAt(String value) {
            if (value != null) {
                lastLoginAt = value;
            }
            return this;
        }

        ServerPlayerSnapshot build() {
            return new ServerPlayerSnapshot(
                    uuid, username, powerLevel, skills, playtimeSeconds, firstJoinAt, lastLoginAt);
        }
    }
}
