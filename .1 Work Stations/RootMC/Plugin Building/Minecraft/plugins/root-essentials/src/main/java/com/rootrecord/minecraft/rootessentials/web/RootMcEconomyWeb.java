package com.rootrecord.minecraft.rootessentials.web;

import org.bukkit.Bukkit;

/**
 * In-game web links for the local host economy landing page.
 * Towny host → {@code /economy/towny/}; Claims host → {@code /economy/claims/}.
 */
public final class RootMcEconomyWeb {

    private static final String BASE = "https://rootmc.net";

    private RootMcEconomyWeb() {}

    /** Towny plugin present → Towny host; otherwise Claims (or generic). */
    public static boolean townyHost() {
        return Bukkit.getPluginManager().getPlugin("Towny") != null;
    }

    public static boolean claimsHost() {
        return !townyHost();
    }

    public static String economy() {
        return townyHost() ? BASE + "/economy/towny/" : BASE + "/economy/claims/";
    }

    public static String reserve() {
        return economy() + "#server-reserve";
    }

    public static String market() {
        return townyHost() ? BASE + "/market/" : BASE + "/g2/market/";
    }

    public static String leaderboard() {
        return townyHost() ? BASE + "/leaderboard/" : BASE + "/g2/leaderboard/";
    }

    public static String bonds() {
        return townyHost() ? BASE + "/economy/bonds/" : BASE + "/g2/economy/bonds/";
    }

    public static String list() {
        return economy();
    }

    public static String constitution() {
        return BASE + "/wiki/constitution/";
    }
}
