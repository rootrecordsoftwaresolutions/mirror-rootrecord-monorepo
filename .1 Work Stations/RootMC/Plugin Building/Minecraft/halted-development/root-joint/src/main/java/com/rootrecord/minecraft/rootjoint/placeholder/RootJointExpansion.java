package com.rootrecord.minecraft.rootjoint.placeholder;

import com.rootrecord.minecraft.rootjoint.RootJointPlugin;
import com.rootrecord.minecraft.rootjoint.data.JointRecordStore;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;

import java.util.Locale;

/** {@code %rootjoint_tag%} / {@code %roottorch_tag%} while holding; empty otherwise. */
public final class RootJointExpansion extends PlaceholderExpansion {

    private final RootJointPlugin plugin;
    private final String identifier;

    public RootJointExpansion(RootJointPlugin plugin, String identifier) {
        this.plugin = plugin;
        this.identifier = identifier == null || identifier.isBlank() ? "rootjoint" : identifier;
    }

    @Override
    public String getIdentifier() {
        return identifier;
    }

    @Override
    public String getAuthor() {
        return "Root Record";
    }

    @Override
    public String getVersion() {
        return plugin.getDescription().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, String params) {
        if (params == null) {
            return null;
        }
        String key = params.toLowerCase(Locale.ROOT);
        if ("longest".equals(key) || "record".equals(key)) {
            if (plugin.records() == null) {
                return "0s";
            }
            return JointRecordStore.formatDuration(plugin.records().longestMs());
        }
        if (player == null || plugin.sessions() == null) {
            return "";
        }
        boolean holding = plugin.sessions().holderId() != null
                && player.getUniqueId() != null
                && player.getUniqueId().equals(plugin.sessions().holderId());
        return switch (key) {
            case "tag", "prefix", "j", "t" -> holding ? plugin.sessions().chatTagRaw() : "";
            case "holding" -> holding ? "yes" : "no";
            case "theme" -> plugin.theme().name().toLowerCase(Locale.ROOT);
            default -> null;
        };
    }
}
