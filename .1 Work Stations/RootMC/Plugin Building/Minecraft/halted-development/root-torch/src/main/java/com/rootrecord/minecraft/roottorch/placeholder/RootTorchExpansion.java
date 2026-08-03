package com.rootrecord.minecraft.roottorch.placeholder;

import com.rootrecord.minecraft.roottorch.RootTorchPlugin;
import com.rootrecord.minecraft.roottorch.data.TorchRecordStore;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;

import java.util.Locale;

/** {@code %roottorch_tag%} → {@code [T] } while holding; empty otherwise. */
public final class RootTorchExpansion extends PlaceholderExpansion {

    private final RootTorchPlugin plugin;

    public RootTorchExpansion(RootTorchPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public String getIdentifier() {
        return "roottorch";
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
            return TorchRecordStore.formatDuration(plugin.records().longestMs());
        }
        if (player == null || plugin.sessions() == null) {
            return "";
        }
        boolean holding = plugin.sessions().holderId() != null
                && player.getUniqueId() != null
                && player.getUniqueId().equals(plugin.sessions().holderId());
        return switch (key) {
            case "tag", "prefix", "t", "j" -> holding ? plugin.sessions().chatTagRaw() : "";
            case "holding" -> holding ? "yes" : "no";
            default -> null;
        };
    }
}
