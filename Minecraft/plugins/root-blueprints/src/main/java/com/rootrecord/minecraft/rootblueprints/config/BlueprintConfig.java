package com.rootrecord.minecraft.rootblueprints.config;

import org.bukkit.configuration.file.FileConfiguration;

public record BlueprintConfig(boolean enabled, int confirmTimeoutSeconds) {

    public static BlueprintConfig from(FileConfiguration cfg) {
        if (cfg == null) {
            return defaults();
        }
        return new BlueprintConfig(
                cfg.getBoolean("enabled", true),
                Math.max(30, cfg.getInt("confirm-timeout-seconds", 300)));
    }

    private static BlueprintConfig defaults() {
        return new BlueprintConfig(true, 300);
    }
}
