package com.rootrecord.minecraft.rootblueprints.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashMap;
import java.util.Map;

public final class BlueprintMessages {

    private final String prefix;
    private final Map<String, String> templates;

    private BlueprintMessages(String prefix, Map<String, String> templates) {
        this.prefix = prefix;
        this.templates = templates;
    }

    public static BlueprintMessages from(FileConfiguration cfg) {
        Map<String, String> map = new HashMap<>();
        if (cfg != null && cfg.isConfigurationSection("messages")) {
            for (String key : cfg.getConfigurationSection("messages").getKeys(false)) {
                map.put(key, cfg.getString("messages." + key, ""));
            }
        }
        return new BlueprintMessages(map.getOrDefault("prefix", ""), map);
    }

    public String prefix() {
        return prefix;
    }

    public String get(String key) {
        return templates.getOrDefault(key, "");
    }

    public String format(String key, Map<String, String> vars) {
        String out = get(key);
        if (vars != null) {
            for (Map.Entry<String, String> entry : vars.entrySet()) {
                out = out.replace("{" + entry.getKey() + "}", entry.getValue() == null ? "" : entry.getValue());
            }
        }
        return prefix + out;
    }
}
