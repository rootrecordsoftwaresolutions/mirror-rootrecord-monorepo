package com.rootrecord.minecraft.rootmcshops;

import org.bukkit.Bukkit;
import org.bukkit.plugin.Plugin;

/** Ask RootMC to push fresh shop listings to the web/API after in-game sales. */
final class EconomySyncNotify {

    private EconomySyncNotify() {}

    static void afterShopSale(RootMcShopsPlugin plugin) {
        Plugin rootMc = Bukkit.getPluginManager().getPlugin("RootMC");
        if (rootMc == null || !rootMc.isEnabled()) {
            return;
        }
        try {
            rootMc.getClass().getMethod("requestEconomySync").invoke(rootMc);
        } catch (ReflectiveOperationException ex) {
            plugin.getLogger().fine("RootMC requestEconomySync unavailable: " + ex.getMessage());
        }
    }
}
