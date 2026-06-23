package com.rootrecord.minecraft.rootrewards.listener;

import com.rootrecord.minecraft.rootrewards.RootRewardsPlugin;
import com.rootrecord.minecraft.rootrewards.data.RewardsStore;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Session tracking fallback when RootMC playtime table is unavailable. */
public final class PlaytimeSessionListener implements Listener {

    private final RootRewardsPlugin plugin;
    private final RewardsStore store;
    private final Map<UUID, Long> sessionStartMs = new ConcurrentHashMap<>();

    public PlaytimeSessionListener(RootRewardsPlugin plugin, RewardsStore store) {
        this.plugin = plugin;
        this.store = store;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        sessionStartMs.put(event.getPlayer().getUniqueId(), System.currentTimeMillis());
        plugin.playtimeRewards().checkPlayerAsync(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        UUID uuid = event.getPlayer().getUniqueId();
        Long started = sessionStartMs.remove(uuid);
        if (started == null || !plugin.rewardsConfig().mysqlEnabled()) {
            return;
        }
        long seconds = Math.max(0L, (System.currentTimeMillis() - started) / 1000L);
        if (seconds <= 0) {
            return;
        }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                if (!plugin.rewardsConfig().useRootMcPlaytime()) {
                    store.addFallbackPlaytime(uuid, seconds);
                }
            } catch (Exception ex) {
                plugin.getLogger().warning("Failed to record fallback playtime: " + ex.getMessage());
            }
        });
    }
}
