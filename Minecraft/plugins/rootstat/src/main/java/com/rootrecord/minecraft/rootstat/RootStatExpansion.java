package com.rootrecord.minecraft.rootstat;

import com.rootrecord.minecraft.rootstat.RootStatBridge;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;

import java.util.UUID;

public final class RootStatExpansion extends PlaceholderExpansion {

    private final RootStatBridge bridge;

    public RootStatExpansion(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    @Override
    public String getIdentifier() {
        return "rootstat";
    }

    @Override
    public String getAuthor() {
        return "Root Record";
    }

    @Override
    public String getVersion() {
        return bridge.getPlugin().getPluginMeta().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, String params) {
        if (player == null || bridge.players() == null) {
            return "";
        }
        UUID uuid = player.getUniqueId();
        try {
            var row = bridge.players().findByUuid(uuid);
            if (row.isEmpty()) {
                return "verified".equalsIgnoreCase(params) ? "false" : "";
            }
            var linked = row.get();
            return switch (params.toLowerCase()) {
                case "verified" -> linked.verified() ? "true" : "false";
                case "account_id", "account" -> linked.accountId() == null ? "" : linked.accountId();
                case "email" -> linked.email() == null ? "" : linked.email();
                default -> "";
            };
        } catch (Exception ex) {
            return "";
        }
    }
}
