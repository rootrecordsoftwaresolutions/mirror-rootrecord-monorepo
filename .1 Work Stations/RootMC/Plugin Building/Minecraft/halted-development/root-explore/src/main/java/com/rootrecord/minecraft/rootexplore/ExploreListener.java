package com.rootrecord.minecraft.rootexplore;

import org.bukkit.NamespacedKey;
import org.bukkit.block.Biome;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

final class ExploreListener implements Listener {

    private final RootExplorePlugin plugin;
    private final ExplorePlayerState state;

    ExploreListener(RootExplorePlugin plugin, ExplorePlayerState state) {
        this.plugin = plugin;
        this.state = state;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        ExploreConfig config = plugin.exploreConfig();
        if (!config.enabled() || !config.biomeHintsEnabled()) {
            return;
        }
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }
        Player player = event.getPlayer();
        if (!plugin.hintsEnabledFor(player)) {
            return;
        }
        Biome biome = event.getTo().getBlock().getBiome();
        NamespacedKey biomeKey = biome.getKey();
        String biomeId = biomeKey != null ? biomeKey.getKey() : "unknown";
        String worldUid = event.getTo().getWorld().getUID().toString();
        ExplorePlayerState.NamespacedBiome previous = state.lastBiome(player.getUniqueId());
        ExplorePlayerState.NamespacedBiome current =
                new ExplorePlayerState.NamespacedBiome(worldUid, biomeId);
        if (previous != null && previous.equals(current)) {
            return;
        }
        state.setLastBiome(player.getUniqueId(), current);
        if (previous == null) {
            return;
        }
        String label = ExploreFormat.formatBiome(biome);
        player.sendMessage(plugin.format(config.biomeMessage().replace("{biome}", label)));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        state.clear(event.getPlayer().getUniqueId());
    }
}
