package com.rootrecord.minecraft.rootessentials.towny;

import com.rootrecord.minecraft.common.RootMcClaimTerritoryService;
import com.rootrecord.minecraft.common.ShadedServiceBridge;
import org.bukkit.Location;
import org.bukkit.plugin.Plugin;

/** Wilderness = unclaimed land (RootClaims + Towny when present). */
public final class WildernessAccess {

    private WildernessAccess() {}

    public static boolean isWilderness(Plugin plugin, Location location) {
        if (location == null || location.getWorld() == null) {
            return false;
        }
        String world = location.getWorld().getName();
        int x = location.getBlockX();
        int z = location.getBlockZ();
        RootMcClaimTerritoryService claims = ShadedServiceBridge.resolveClaimTerritory(plugin);
        if (claims != null && claims.isClaimed(world, x, z)) {
            return false;
        }
        if (TownyWildernessAccess.isAvailable()) {
            return TownyWildernessAccess.isTownyWilderness(location);
        }
        return true;
    }
}
