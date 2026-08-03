package com.rootrecord.minecraft.rootask.config;

import org.bukkit.configuration.file.FileConfiguration;

public final class AskMessages {

    private final String prefix;
    private final FileConfiguration cfg;

    private AskMessages(String prefix, FileConfiguration cfg) {
        this.prefix = prefix == null ? "" : prefix;
        this.cfg = cfg;
    }

    public static AskMessages from(FileConfiguration cfg) {
        String prefix = cfg != null ? cfg.getString("messages.prefix", "&6[Guide]&r ") : "&6[Guide]&r ";
        return new AskMessages(prefix, cfg);
    }

    public String prefix() {
        return prefix;
    }

    public String get(String key) {
        if (cfg == null) {
            return "";
        }
        return cfg.getString("messages." + key, "");
    }
}
