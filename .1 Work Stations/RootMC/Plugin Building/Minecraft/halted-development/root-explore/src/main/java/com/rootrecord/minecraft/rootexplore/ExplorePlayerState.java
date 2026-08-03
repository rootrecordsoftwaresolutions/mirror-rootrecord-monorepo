package com.rootrecord.minecraft.rootexplore;

import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Per-player exploration state (in-memory). */
final class ExplorePlayerState {

    private final Map<UUID, NamespacedBiome> lastBiome = new ConcurrentHashMap<>();
    private final Map<UUID, Map<String, Long>> structureCooldownUntil = new ConcurrentHashMap<>();

    record NamespacedBiome(String worldUid, String biomeKey) {}

    NamespacedBiome lastBiome(UUID uuid) {
        return lastBiome.get(uuid);
    }

    void setLastBiome(UUID uuid, NamespacedBiome biome) {
        if (biome == null) {
            lastBiome.remove(uuid);
        } else {
            lastBiome.put(uuid, biome);
        }
    }

    void clear(UUID uuid) {
        lastBiome.remove(uuid);
        structureCooldownUntil.remove(uuid);
    }

    boolean onStructureCooldown(UUID uuid, String structureKey, long nowMillis) {
        Map<String, Long> map = structureCooldownUntil.get(uuid);
        if (map == null) {
            return false;
        }
        Long until = map.get(structureKey);
        return until != null && until > nowMillis;
    }

    void markStructureNotified(UUID uuid, String structureKey, long untilMillis) {
        structureCooldownUntil
                .computeIfAbsent(uuid, ignored -> new ConcurrentHashMap<>())
                .put(structureKey, untilMillis);
    }

    static String structureKey(String worldUid, String registryKey, Location found) {
        int cx = found.getBlockX() >> 4;
        int cz = found.getBlockZ() >> 4;
        return worldUid + ":" + registryKey + ":" + cx + ":" + cz;
    }
}
