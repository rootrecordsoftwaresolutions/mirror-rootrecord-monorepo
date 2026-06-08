package com.rootrecord.minecraft.rootstat.util;

import java.util.UUID;

public final class RootStatUrls {

    public static final String DEFAULT_STATS_BASE = "https://rootrecord.info/realm/player";

    private RootStatUrls() {}

    public static String statsUrl(UUID uuid, String base) {
        String root = (base == null || base.isBlank()) ? DEFAULT_STATS_BASE : base.trim();
        root = root.replaceAll("/+$", "");
        return root + "?uuid=" + uuid;
    }
}
