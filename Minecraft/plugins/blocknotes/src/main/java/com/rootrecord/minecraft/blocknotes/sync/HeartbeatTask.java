package com.rootrecord.minecraft.blocknotes.sync;

import com.rootrecord.minecraft.blocknotes.BlockNotesPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.logging.Level;

public final class HeartbeatTask {

    private final BlockNotesPlugin plugin;
    private BukkitTask repeatingTask;

    public HeartbeatTask(BlockNotesPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        stop();
        long intervalTicks = plugin.blockNotesConfig().heartbeatIntervalMinutes() * 60L * 20L;
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
        if (!plugin.blockNotesConfig().hasServerCredentials()) {
            return;
        }
        try {
            String body = plugin.heartbeatClient().sendHeartbeat();
            plugin.updates().apply(HeartbeatResultParser.parse(body));
        } catch (Exception ex) {
            plugin.getLogger().log(Level.WARNING, "BlockNotes heartbeat failed: " + ex.getMessage(), ex);
        }
    }
}
