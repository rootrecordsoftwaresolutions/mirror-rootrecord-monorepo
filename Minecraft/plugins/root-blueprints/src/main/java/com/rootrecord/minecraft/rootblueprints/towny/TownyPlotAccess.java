package com.rootrecord.minecraft.rootblueprints.towny;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.util.UUID;

/** Towny plot ownership via reflection — no compile-time Towny dependency. */
public final class TownyPlotAccess {

    private TownyPlotAccess() {}

    public record PlotContext(String townName, int plotX, int plotZ, int chunkX, int chunkZ) {}

    public static boolean isAvailable() {
        return plugin("Towny") != null;
    }

    public static PlotContext plotAt(Location location) {
        Object api = townyApi();
        if (api == null || location == null || location.getWorld() == null) {
            return null;
        }
        Object townBlock = invoke(api, "getTownBlock", new Class<?>[] {Location.class}, location);
        if (townBlock == null) {
            return null;
        }
        Object town = invokeNoArg(townBlock, "getTown");
        if (town == null) {
            return null;
        }
        String townName = stringOrNull(invokeNoArg(town, "getName"));
        if (townName == null) {
            return null;
        }
        int plotX;
        int plotZ;
        Object coord = invokeNoArg(townBlock, "getCoord", "getWorldCoord");
        if (coord != null) {
            plotX = intOrZero(invokeNoArg(coord, "getX"));
            plotZ = intOrZero(invokeNoArg(coord, "getZ"));
        } else {
            plotX = location.getBlockX() >> 4;
            plotZ = location.getBlockZ() >> 4;
        }
        int chunkX = location.getBlockX() >> 4;
        int chunkZ = location.getBlockZ() >> 4;
        return new PlotContext(townName, plotX, plotZ, chunkX, chunkZ);
    }

    public static boolean canSave(Player player, Location location) {
        Object api = townyApi();
        if (api == null) {
            return false;
        }
        Object townBlock = invoke(api, "getTownBlock", new Class<?>[] {Location.class}, location);
        if (townBlock == null) {
            return false;
        }
        Object town = invokeNoArg(townBlock, "getTown");
        if (town == null) {
            return false;
        }
        UUID playerId = player.getUniqueId();
        Object plotOwner = invokeNoArg(townBlock, "getResidentOrNull", "getResident");
        if (plotOwner != null) {
            UUID ownerId = uuidOrNull(invokeNoArg(plotOwner, "getUUID"));
            if (playerId.equals(ownerId)) {
                return true;
            }
        }
        Object mayor = invokeNoArg(town, "getMayor");
        if (mayor != null) {
            UUID mayorId = uuidOrNull(invokeNoArg(mayor, "getUUID"));
            if (playerId.equals(mayorId)) {
                return true;
            }
        }
        return false;
    }

    private static Plugin plugin(String name) {
        Plugin plugin = Bukkit.getPluginManager().getPlugin(name);
        return plugin != null && plugin.isEnabled() ? plugin : null;
    }

    private static Object townyApi() {
        if (plugin("Towny") == null) {
            return null;
        }
        try {
            Class<?> apiClass = Class.forName("com.palmergames.bukkit.towny.TownyAPI");
            Method method = apiClass.getMethod("getInstance");
            return method.invoke(null);
        } catch (Throwable ex) {
            return null;
        }
    }

    private static Object invokeNoArg(Object target, String... methodNames) {
        if (target == null) {
            return null;
        }
        for (String name : methodNames) {
            try {
                Method method = target.getClass().getMethod(name);
                method.setAccessible(true);
                return method.invoke(target);
            } catch (Throwable ignored) {
                // try next
            }
        }
        return null;
    }

    private static Object invoke(Object target, String methodName, Class<?>[] paramTypes, Object... args) {
        if (target == null) {
            return null;
        }
        try {
            Method method = target.getClass().getMethod(methodName, paramTypes);
            method.setAccessible(true);
            return method.invoke(target, args);
        } catch (Throwable ex) {
            return null;
        }
    }

    private static String stringOrNull(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    private static UUID uuidOrNull(Object value) {
        if (value instanceof UUID uuid) {
            return uuid;
        }
        String s = stringOrNull(value);
        if (s == null) {
            return null;
        }
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static int intOrZero(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }
}
