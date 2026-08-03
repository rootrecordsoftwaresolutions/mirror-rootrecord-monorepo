package com.rootrecord.minecraft.rootexplore;

import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.block.Biome;
import org.bukkit.generator.structure.Structure;

import java.util.Locale;

public final class ExploreFormat {

    private ExploreFormat() {}

    public static String formatBiome(Biome biome) {
        if (biome == null) {
            return "Unknown";
        }
        NamespacedKey key = biome.getKey();
        String raw = key != null ? key.getKey() : "unknown";
        return titleCase(raw.replace('_', ' '));
    }

    public static Structure resolveStructure(String registryKey) {
        if (registryKey == null || registryKey.isBlank()) {
            return null;
        }
        NamespacedKey key = NamespacedKey.minecraft(registryKey.toLowerCase(Locale.ROOT));
        return Registry.STRUCTURE.get(key);
    }

    private static String titleCase(String input) {
        if (input == null || input.isBlank()) {
            return "Unknown";
        }
        String[] parts = input.trim().split("\\s+");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                out.append(' ');
            }
            String part = parts[i];
            if (part.length() == 1) {
                out.append(Character.toUpperCase(part.charAt(0)));
            } else {
                out.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
            }
        }
        return out.toString();
    }
}
