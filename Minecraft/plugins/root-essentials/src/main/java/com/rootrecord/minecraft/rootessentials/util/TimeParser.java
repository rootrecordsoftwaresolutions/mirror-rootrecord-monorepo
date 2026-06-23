package com.rootrecord.minecraft.rootessentials.util;

import java.time.Instant;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class TimeParser {

    private static final Pattern DURATION = Pattern.compile("^(\\d+)([smhdw])$", Pattern.CASE_INSENSITIVE);

    private TimeParser() {}

    public static Instant parseExpiry(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        Matcher m = DURATION.matcher(raw.trim().toLowerCase(Locale.ROOT));
        if (!m.matches()) {
            return null;
        }
        long amount = Long.parseLong(m.group(1));
        long seconds = switch (m.group(2)) {
            case "s" -> amount;
            case "m" -> amount * 60L;
            case "h" -> amount * 3600L;
            case "d" -> amount * 86400L;
            case "w" -> amount * 604800L;
            default -> -1L;
        };
        if (seconds <= 0) {
            return null;
        }
        return Instant.now().plusSeconds(seconds);
    }
}
