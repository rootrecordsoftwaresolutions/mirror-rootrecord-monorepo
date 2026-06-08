package com.rootrecord.minecraft.blocknotes.sync;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class HeartbeatResultParser {

    private static final Pattern PLUGIN_BLOCK =
            Pattern.compile("\\{\\s*\"plugin\"\\s*:\\s*\"([^\"]*)\"[^}]*\"version\"\\s*:\\s*\"([^\"]*)\"[^}]*\"filename\"\\s*:\\s*\"([^\"]*)\"[^}]*\"url\"\\s*:\\s*\"([^\"]*)\"");

    private HeartbeatResultParser() {}

    static PluginUpdateService.HeartbeatResult parse(String json) {
        Map<String, Object> configDefaults = parseConfigDefaults(json);

        List<PluginUpdateService.PluginUpdate> updates = new ArrayList<>();
        Matcher m = PLUGIN_BLOCK.matcher(json);
        while (m.find()) {
            updates.add(new PluginUpdateService.PluginUpdate(
                    m.group(1), m.group(2), m.group(3), m.group(4)));
        }
        return new PluginUpdateService.HeartbeatResult(configDefaults, updates);
    }

    private static Map<String, Object> parseConfigDefaults(String json) {
        Map<String, Object> defaults = new HashMap<>();
        int key = json.indexOf("\"rootstat_config_defaults\"");
        if (key < 0) {
            return defaults;
        }
        int brace = json.indexOf('{', key);
        if (brace < 0) {
            return defaults;
        }
        int depth = 0;
        for (int i = brace; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    Matcher entry = Pattern.compile("\"([^\"]+)\"\\s*:\\s*([^,}]+)").matcher(json.substring(brace, i + 1));
                    while (entry.find()) {
                        String name = entry.group(1);
                        String raw = entry.group(2).trim();
                        if (raw.startsWith("\"") && raw.endsWith("\"")) {
                            defaults.put(name, raw.substring(1, raw.length() - 1));
                        } else {
                            try {
                                defaults.put(name, Integer.parseInt(raw));
                            } catch (NumberFormatException ignored) {
                                defaults.put(name, raw);
                            }
                        }
                    }
                    break;
                }
            }
        }
        return defaults;
    }
}
