package com.rootrecord.minecraft.rootstat.listener;

import com.rootrecord.minecraft.rootstat.RootStatPlugin;
import com.rootrecord.minecraft.rootstat.model.LinkedPlayer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

public final class PlayerJoinListener implements Listener {

    private final RootStatPlugin plugin;

    public PlayerJoinListener(RootStatPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            plugin.syncTask().runSyncSafe();
            try {
                var status = plugin.cloud().linkStatus(event.getPlayer().getUniqueId().toString());
                if (status.linked() && plugin.players() != null) {
                    plugin.players().upsert(new LinkedPlayer(
                            event.getPlayer().getUniqueId().toString(),
                            event.getPlayer().getName(),
                            status.accountId(),
                            null,
                            null,
                            java.time.Instant.now().toString()));
                }
            } catch (Exception ignored) {
                // join should not fail on cloud errors
            }
        });
    }
}
