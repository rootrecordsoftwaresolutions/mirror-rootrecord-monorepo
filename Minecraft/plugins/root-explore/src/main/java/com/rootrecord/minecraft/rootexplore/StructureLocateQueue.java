package com.rootrecord.minecraft.rootexplore;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.generator.structure.Structure;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;

/** Spreads structure lookups across ticks — one locate per tick on the main thread. */
final class StructureLocateQueue {

    private record WorkItem(Player player, ExploreConfig.StructureHintEntry hint) {}

    private final RootExplorePlugin plugin;
    private final ExplorePlayerState state;
    private BukkitTask task;
    private int cursor;

    StructureLocateQueue(RootExplorePlugin plugin, ExplorePlayerState state) {
        this.plugin = plugin;
        this.state = state;
    }

    void start() {
        stop();
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 40L, 1L);
    }

    void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        ExploreConfig config = plugin.exploreConfig();
        if (!plugin.isEnabled() || !config.enabled() || !config.structureHintsEnabled()) {
            return;
        }
        List<WorkItem> queue = buildQueue(config);
        if (queue.isEmpty()) {
            return;
        }
        if (cursor >= queue.size()) {
            cursor = 0;
        }
        WorkItem item = queue.get(cursor++);
        runLocate(item.player(), item.hint(), config);
    }

    private List<WorkItem> buildQueue(ExploreConfig config) {
        List<WorkItem> out = new ArrayList<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (!player.isOnline() || !plugin.hintsEnabledFor(player)) {
                continue;
            }
            for (ExploreConfig.StructureHintEntry hint : config.hintsForWorld(player.getWorld())) {
                out.add(new WorkItem(player, hint));
            }
        }
        return out;
    }

    private void runLocate(Player player, ExploreConfig.StructureHintEntry hint, ExploreConfig config) {
        World world = player.getWorld();
        Structure structure = ExploreFormat.resolveStructure(hint.registryKey());
        if (structure == null) {
            return;
        }
        Location origin = player.getLocation();
        org.bukkit.util.StructureSearchResult result;
        try {
            result = world.locateNearestStructure(origin, structure, config.structureSearchRadius(), false);
        } catch (Exception ex) {
            plugin.getLogger().fine("Structure locate failed for " + hint.registryKey() + ": " + ex.getMessage());
            return;
        }
        if (result == null) {
            return;
        }
        Location found = result.getLocation();
        if (found == null) {
            return;
        }
        if (origin.getWorld() == null || !origin.getWorld().getUID().equals(found.getWorld().getUID())) {
            return;
        }
        double dx = origin.getX() - found.getX();
        double dz = origin.getZ() - found.getZ();
        double horizontal = Math.sqrt(dx * dx + dz * dz);
        if (horizontal > config.structureNotifyWithin()) {
            return;
        }

        long now = System.currentTimeMillis();
        String key = ExplorePlayerState.structureKey(world.getUID().toString(), hint.registryKey(), found);
        if (state.onStructureCooldown(player.getUniqueId(), key, now)) {
            return;
        }
        long until = now + config.structureCooldownMinutes() * 60_000L;
        state.markStructureNotified(player.getUniqueId(), key, until);
        player.sendMessage(plugin.format(hint.message()));
    }
}
