package com.rootrecord.minecraft.rootexplore;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public record ExploreConfig(
        boolean enabled,
        String prefix,
        boolean biomeHintsEnabled,
        String biomeMessage,
        boolean structureHintsEnabled,
        int structureSearchRadius,
        int structureNotifyWithin,
        int structureCooldownMinutes,
        Map<String, List<StructureHintEntry>> structureHintsByWorld) {

    public record StructureHintEntry(String registryKey, String message) {}

    public static ExploreConfig from(FileConfiguration cfg) {
        if (cfg == null) {
            cfg = new org.bukkit.configuration.file.YamlConfiguration();
        }
        Map<String, List<StructureHintEntry>> byWorld = new LinkedHashMap<>();
        ConfigurationSection structSec = cfg.getConfigurationSection("structure-hints");
        if (structSec != null) {
            for (String worldKey : List.of("overworld", "nether", "end")) {
                ConfigurationSection group = structSec.getConfigurationSection(worldKey);
                if (group == null) {
                    continue;
                }
                List<StructureHintEntry> entries = new ArrayList<>();
                for (String registryKey : group.getKeys(false)) {
                    String message = group.getString(registryKey, "").trim();
                    if (!message.isBlank()) {
                        entries.add(new StructureHintEntry(registryKey.toLowerCase(Locale.ROOT), message));
                    }
                }
                byWorld.put(worldKey, List.copyOf(entries));
            }
        }

        return new ExploreConfig(
                cfg.getBoolean("enabled", true),
                cfg.getString("prefix", "&8[&bExplore&8]&r "),
                cfg.getBoolean("biome-hints.enabled", true),
                cfg.getString("biome-hints.message", "&7Entering &f{biome}&7."),
                structSec != null && structSec.getBoolean("enabled", true),
                Math.max(64, structSec != null ? structSec.getInt("search-radius-blocks", 256) : 256),
                Math.max(32, structSec != null ? structSec.getInt("notify-within-blocks", 96) : 96),
                Math.max(5, structSec != null ? structSec.getInt("cooldown-minutes", 40) : 40),
                Collections.unmodifiableMap(byWorld));
    }

    public List<StructureHintEntry> hintsForWorld(org.bukkit.World world) {
        if (world == null) {
            return List.of();
        }
        return switch (world.getEnvironment()) {
            case NETHER -> structureHintsByWorld.getOrDefault("nether", List.of());
            case THE_END -> structureHintsByWorld.getOrDefault("end", List.of());
            default -> structureHintsByWorld.getOrDefault("overworld", List.of());
        };
    }
}
