package com.rootrecord.minecraft.rootavacore;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Settings from plugins/RootMC/root-ava-core.yml. */
public final class AvaConfig {

    public record ArmyDept(String id, String name, String blurb) {}

    private final boolean enabled;
    private final String prefix;
    private final String statusLine;
    private final String disabled;
    private final String noPermission;
    private final String reloaded;
    private final String armyHeader;
    private final String armyFooter;
    private final String armyUnknown;
    private final Map<String, ArmyDept> armyDepts;
    private final List<String> tips;
    private final List<String> pulseLines;
    private final String tipHeader;
    private final String pulseHeader;

    public AvaConfig(FileConfiguration cfg) {
        this.enabled = cfg.getBoolean("enabled", true);
        this.prefix = cfg.getString("messages.prefix", "&dAva &8· ");
        this.statusLine = cfg.getString(
                "messages.status-line",
                "&7v{version} &8· &f{online} online &8· &f{tps} TPS &8· &aAva companion online");
        this.disabled = cfg.getString("messages.disabled", "&cRoot-Ava-Core is disabled.");
        this.noPermission = cfg.getString("messages.no-permission", "&cNo permission.");
        this.reloaded = cfg.getString("messages.reloaded", "&aRoot-Ava-Core reloaded.");
        this.armyHeader = cfg.getString(
                "messages.army-header",
                "&dAva's Army &8· &7my internal RootMC departments (not a player faction)");
        this.armyFooter = cfg.getString(
                "messages.army-footer",
                "&8Tip: &7/ava army <dept> &8· &7ask Ava on Discord/Slack for digs");
        this.armyUnknown = cfg.getString(
                "messages.army-unknown",
                "&cUnknown department. Try &f/ava army");
        this.tipHeader = cfg.getString("messages.tip-header", "&dVoice &8· &7RootMC tip");
        this.pulseHeader = cfg.getString(
                "messages.pulse-header",
                "&dWatch &8· &7army pulse");
        this.armyDepts = loadArmy(cfg);
        this.tips = loadStringList(cfg, "voice.tips", defaultTips());
        this.pulseLines = loadStringList(cfg, "watch.pulse-lines", defaultPulse());
    }

    private static List<String> loadStringList(FileConfiguration cfg, String path, List<String> fallback) {
        List<String> raw = cfg.getStringList(path);
        if (raw == null || raw.isEmpty()) return fallback;
        List<String> out = new ArrayList<>();
        for (String s : raw) {
            if (s != null && !s.isBlank()) out.add(s);
        }
        return out.isEmpty() ? fallback : Collections.unmodifiableList(out);
    }

    private static List<String> defaultTips() {
        return List.of(
                "Currency is Gold (G). Check /bal — never dollars in-game.",
                "Link Discord with /link · finish at https://rootmc.net/verify/",
                "Map: https://map.rootmc.net — find towns & claims at a glance.",
                "Feature ideas: /proposal <idea> (costs Gold) — Ava formalizes when online.",
                "Vote Shards live in /ec — more say on what we build.",
                "Pro is pay-to-steer, not pay-to-win: https://rootmc.net/pro/",
                "Try /ava army — peek Ava's internal departments.");
    }

    private static List<String> defaultPulse() {
        return List.of(
                "Watch is scanning clocks · solar · chat.",
                "Engineering keeps jars honest.",
                "Relations is in the whisper lane with you.",
                "Continuity is collecting training crumbs.",
                "Voice keeps the lore clean + RootMC-centric.",
                "Treasury Advisory: no Gold mint for vanity.");
    }

    private static Map<String, ArmyDept> loadArmy(FileConfiguration cfg) {
        Map<String, ArmyDept> out = new LinkedHashMap<>();
        ConfigurationSection sec = cfg.getConfigurationSection("army.departments");
        if (sec != null) {
            for (String id : sec.getKeys(false)) {
                ConfigurationSection row = sec.getConfigurationSection(id);
                if (row == null) continue;
                String name = row.getString("name", id);
                String blurb = row.getString("blurb", "");
                String key = id.toLowerCase(Locale.ROOT);
                out.put(key, new ArmyDept(key, name, blurb));
            }
        }
        if (out.isEmpty()) {
            // Sensible defaults if yml missing section
            put(out, "engineering", "Engineering Corps", "plugins · Workers · site · app rails");
            put(out, "watch", "Watch", "solar · votes · Gold weirdness · uptime clocks");
            put(out, "continuity", "Continuity", "independence · failover · training");
            put(out, "relations", "Relations", "Discord players · Slack staff digs");
            put(out, "voice", "Voice & Lore", "persona · dream-pack · appearance");
            put(out, "treasury", "Treasury Advisory", "Ava slice · income ideas (no Gold mint)");
        }
        return Collections.unmodifiableMap(out);
    }

    private static void put(Map<String, ArmyDept> out, String id, String name, String blurb) {
        out.put(id, new ArmyDept(id, name, blurb));
    }

    public boolean enabled() {
        return enabled;
    }

    public String prefix() {
        return prefix;
    }

    public String statusLine() {
        return statusLine;
    }

    public String disabled() {
        return disabled;
    }

    public String noPermission() {
        return noPermission;
    }

    public String reloaded() {
        return reloaded;
    }

    public String armyHeader() {
        return armyHeader;
    }

    public String armyFooter() {
        return armyFooter;
    }

    public String armyUnknown() {
        return armyUnknown;
    }

    public String tipHeader() {
        return tipHeader;
    }

    public String pulseHeader() {
        return pulseHeader;
    }

    public List<String> tips() {
        return tips;
    }

    public List<String> pulseLines() {
        return pulseLines;
    }

    public String randomTip() {
        if (tips.isEmpty()) return "RootMC tip: /ava army";
        return tips.get((int) (Math.random() * tips.size()));
    }

    public String randomPulse() {
        if (pulseLines.isEmpty()) return "Army pulse: Ava is online.";
        return pulseLines.get((int) (Math.random() * pulseLines.size()));
    }

    public Map<String, ArmyDept> armyDepartments() {
        return armyDepts;
    }

    public ArmyDept armyDept(String idOrAlias) {
        if (idOrAlias == null || idOrAlias.isBlank()) return null;
        String key = idOrAlias.toLowerCase(Locale.ROOT).trim();
        ArmyDept direct = armyDepts.get(key);
        if (direct != null) return direct;
        for (ArmyDept d : armyDepts.values()) {
            if (d.name().toLowerCase(Locale.ROOT).contains(key)) return d;
            if (d.id().startsWith(key)) return d;
        }
        // Friendly aliases
        if (key.startsWith("eng") || key.equals("code") || key.equals("plugins")) {
            return armyDepts.get("engineering");
        }
        if (key.startsWith("watch") || key.equals("solar") || key.equals("metrics")) {
            return armyDepts.get("watch");
        }
        if (key.startsWith("cont") || key.equals("failover")) {
            return armyDepts.get("continuity");
        }
        if (key.startsWith("rel") || key.equals("discord") || key.equals("community")) {
            return armyDepts.get("relations");
        }
        if (key.startsWith("voice") || key.equals("lore") || key.equals("persona")) {
            return armyDepts.get("voice");
        }
        if (key.startsWith("treas") || key.equals("finance") || key.equals("money")) {
            return armyDepts.get("treasury");
        }
        return null;
    }

    public List<String> armyTabIds() {
        return new ArrayList<>(armyDepts.keySet());
    }
}
