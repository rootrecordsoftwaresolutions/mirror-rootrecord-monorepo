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
    private volatile boolean running;

    public SyncTask(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    public void start() {
        stop();
        long intervalTicks = bridge.config().syncIntervalMinutes() * 60L * 20L;
        repeatingTask = bridge.getPlugin().getServer().getScheduler().runTaskTimerAsynchronously(
                bridge.getPlugin(), this::runSyncSafe, 40L, intervalTicks);
    }

    public void stop() {
        if (repeatingTask != null) {
            repeatingTask.cancel();
            repeatingTask = null;
        }
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
            pushServerStats(verbose);
            return count;
        } catch (Exception ex) {
            bridge.getPlugin().getLogger().log(Level.WARNING, "Cloud sync failed: " + ex.getMessage(), ex);
            return -1;
        }
    }

    private void pushServerStats(boolean verbose) {
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
