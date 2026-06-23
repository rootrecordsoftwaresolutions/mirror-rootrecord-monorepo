package com.rootrecord.minecraft.rootmc.sync;

import com.rootrecord.minecraft.rootmc.RootMcPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.logging.Level;

public final class HeartbeatTask {

    private final RootMcPlugin plugin;
    private BukkitTask repeatingTask;

    public HeartbeatTask(RootMcPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        stop();
        long intervalTicks = plugin.rootMcConfig().heartbeatIntervalMinutes() * 60L * 20L;
        repeatingTask = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
                plugin, this::runSafe, 60L, intervalTicks);
    }

    public void stop() {
        if (repeatingTask != null) {
            repeatingTask.cancel();
            repeatingTask = null;
        }
    }

    public void runSafe() {
        if (!plugin.rootMcConfig().hasServerCredentials()) {
            return;
        }
        try {
            String body = plugin.heartbeatClient().sendHeartbeat();
            plugin.updates().apply(HeartbeatResultParser.parse(body));
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "RootMC heartbeat failed: " + ex.getMessage(), ex);
        }
    }
}
