package com.rootrecord.minecraft.rootavacore;

import org.bukkit.configuration.file.FileConfiguration;

/** Settings from plugins/RootMC/root-ava-core.yml. */
public final class AvaConfig {

    private final boolean enabled;
    private final String prefix;
    private final String statusLine;
    private final String disabled;
    private final String noPermission;
    private final String reloaded;

    public AvaConfig(FileConfiguration cfg) {
        this.enabled = cfg.getBoolean("enabled", true);
        this.prefix = cfg.getString("messages.prefix", "&dAva &8· ");
        this.statusLine = cfg.getString(
                "messages.status-line",
                "&7v{version} &8· &f{online} online &8· &f{tps} TPS &8· &aAva companion online");
        this.disabled = cfg.getString("messages.disabled", "&cRoot-Ava-Core is disabled.");
        this.noPermission = cfg.getString("messages.no-permission", "&cNo permission.");
        this.reloaded = cfg.getString("messages.reloaded", "&aRoot-Ava-Core reloaded.");
    }

    public boolean enabled() {
        return enabled;
    }

    public String prefix() {
        return prefix;
    }

    public String statusLine() {
        return statusLine;
    }

    public String disabled() {
        return disabled;
    }

    public String noPermission() {
        return noPermission;
    }

    public String reloaded() {
        return reloaded;
    }
}
