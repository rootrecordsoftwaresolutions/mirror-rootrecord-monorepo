package com.rootrecord.minecraft.roothelp.catalog;

import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public final class CommandCatalog {

    public record Line(String section, String command, String description, String permission) {

        public boolean visibleTo(CommandSender sender) {
            if (permission == null || permission.isBlank()) {
                return true;
            }
            return sender.hasPermission(permission);
        }
    }

    private final List<Line> lines;

    private CommandCatalog(List<Line> lines) {
        this.lines = List.copyOf(lines);
    }

    public List<Line> lines() {
        return lines;
    }

    public List<Line> linesFor(CommandSender sender) {
        return lines.stream().filter(line -> line.visibleTo(sender)).toList();
    }

    @SuppressWarnings("unchecked")
    public static CommandCatalog load(FileConfiguration cfg) {
        if (cfg == null) {
            return new CommandCatalog(List.of());
        }
        List<Map<?, ?>> sections = cfg.getMapList("command-list");
        if (sections.isEmpty()) {
            return new CommandCatalog(List.of());
        }
        List<Line> out = new ArrayList<>();
        for (Map<?, ?> section : sections) {
            String sectionTitle = stringVal(section.get("section"));
            Object itemsRaw = section.get("items");
            if (!(itemsRaw instanceof List<?> items)) {
                continue;
            }
            for (Object itemRaw : items) {
                if (!(itemRaw instanceof Map<?, ?> item)) {
                    continue;
                }
                String cmd = stringVal(item.get("cmd"));
                String desc = stringVal(item.get("desc"));
                String permission = stringVal(item.get("permission"));
                if (cmd.isBlank()) {
                    continue;
                }
                out.add(new Line(sectionTitle, cmd, desc, permission.isBlank() ? null : permission));
            }
        }
        return new CommandCatalog(out);
    }

    private static String stringVal(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    public static CommandCatalog empty() {
        return new CommandCatalog(Collections.emptyList());
    }
}
