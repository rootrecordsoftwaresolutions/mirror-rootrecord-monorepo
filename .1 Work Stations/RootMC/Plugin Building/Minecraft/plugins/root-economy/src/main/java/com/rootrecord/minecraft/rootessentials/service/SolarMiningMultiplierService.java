package com.rootrecord.minecraft.rootessentials.service;

import com.rootrecord.minecraft.common.config.RootMcApiBases;
import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;
import com.rootrecord.minecraft.rooteconomy.RootEconomyPlugin;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitTask;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Polls {@code GET /api/rootmc/solar-mining-multiplier} for live Gold (G) ore/block mine mult.
 * Offline / stale feed → 1.0× (never invents battery %).
 */
public final class SolarMiningMultiplierService {

    private final RootEconomyPlugin plugin;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>(Snapshot.offline());
    private BukkitTask pollTask;
    private volatile boolean enabled = true;
    private volatile long pollSeconds = 60;

    public SolarMiningMultiplierService(RootEconomyPlugin plugin) {
        this.plugin = plugin;
    }

    public void start() {
        reloadFromConfig();
        if (!enabled) {
            plugin.getLogger().info("Solar mining multiplier disabled in config.");
            return;
        }
        long periodTicks = Math.max(20L * 30L, pollSeconds * 20L);
        pollTask = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
                plugin, this::refreshSafe, 40L, periodTicks);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, this::refreshSafe);
        plugin.getLogger().info("Solar mining multiplier polling every " + pollSeconds + "s.");
    }

    public void stop() {
        if (pollTask != null) {
            pollTask.cancel();
            pollTask = null;
        }
    }

    public void reloadFromConfig() {
        FileConfiguration cfg = plugin.economyYaml();
        enabled = cfg.getBoolean("solar-mining.enabled", true);
        pollSeconds = Math.max(30L, cfg.getLong("solar-mining.poll-seconds", 60L));
    }

    public double multiplier() {
        if (!enabled) {
            return 1.0d;
        }
        Snapshot s = snapshot.get();
        return s != null && s.online() ? s.multiplier() : 1.0d;
    }

    public boolean online() {
        Snapshot s = snapshot.get();
        return enabled && s != null && s.online();
    }

    public Snapshot current() {
        return snapshot.get();
    }

    /**
     * Scale stack amounts by multiplier (stochastic fractional remainder).
     * Returns new list; does not mutate inputs.
     */
    public static List<ItemStack> scaleStacks(Collection<ItemStack> stacks, double multiplier) {
        List<ItemStack> out = new ArrayList<>();
        if (stacks == null) {
            return out;
        }
        double mult = multiplier;
        if (!Double.isFinite(mult) || mult <= 1.0000001d) {
            for (ItemStack stack : stacks) {
                if (stack != null && !stack.getType().isAir() && stack.getAmount() > 0) {
                    out.add(stack.clone());
                }
            }
            return out;
        }
        for (ItemStack stack : stacks) {
            if (stack == null || stack.getType().isAir() || stack.getAmount() <= 0) {
                continue;
            }
            ItemStack copy = stack.clone();
            int scaled = scaleAmount(copy.getAmount(), mult);
            if (scaled <= 0) {
                continue;
            }
            int remaining = scaled;
            while (remaining > 0) {
                ItemStack piece = copy.clone();
                int n = Math.min(remaining, piece.getMaxStackSize());
                piece.setAmount(n);
                out.add(piece);
                remaining -= n;
            }
        }
        return out;
    }

    public static int scaleAmount(int base, double multiplier) {
        if (base <= 0) {
            return 0;
        }
        if (!Double.isFinite(multiplier) || multiplier <= 1.0000001d) {
            return base;
        }
        double scaled = base * multiplier;
        int whole = (int) Math.floor(scaled);
        double frac = scaled - whole;
        if (frac > 1e-9 && ThreadLocalRandom.current().nextDouble() < frac) {
            whole++;
        }
        return Math.max(base, whole);
    }

    private void refreshSafe() {
        try {
            refresh();
        } catch (Exception ex) {
            snapshot.set(Snapshot.offline());
            plugin.getLogger().warning("Solar mining multiplier refresh failed: " + ex.getMessage());
        }
    }

    private void refresh() throws Exception {
        FileConfiguration cfg = plugin.economyYaml();
        RootRecordCloudConfig.CloudSettings cloud = RootRecordCloudConfig.resolve(plugin, cfg);
        String configured = RootMcApiBases.normalize(cloud.apiBase());
        // Game hosts (Shockbyte) must hit public Worker first. api-local is OptiPlex tunnel —
        // when down it 502s HTML; never treat that as a live bank feed.
        String primary = configured;
        String secondary =
                RootMcApiBases.PRODUCTION.equalsIgnoreCase(configured)
                        ? RootMcApiBases.LOCAL_EDGE
                        : RootMcApiBases.fallbackBase(configured);

        String json = fetchLiveJson(primary);
        String used = primary;
        if (!isLivePayload(json) && !secondary.equalsIgnoreCase(primary)) {
            String alt = fetchLiveJson(secondary);
            if (isLivePayload(alt)) {
                json = alt;
                used = secondary;
            }
        }
        if (!isLivePayload(json)) {
            snapshot.set(Snapshot.offline());
            return;
        }
        double multiplier = parseNum(json, "multiplier");
        double battery = parseNum(json, "battery_percent");
        multiplier = Math.min(2.0d, Math.max(1.0d, round3(multiplier)));
        Double batteryPct = battery >= 0 ? battery : null;
        Snapshot prev = snapshot.get();
        snapshot.set(new Snapshot(true, batteryPct, multiplier, System.currentTimeMillis()));
        if (prev == null || !prev.online() || Math.abs(prev.multiplier() - multiplier) > 0.0005d) {
            plugin.getLogger().info(String.format(
                    "Solar mining mult live via %s — bank %s%% → %.3fx",
                    used,
                    batteryPct != null ? String.valueOf(Math.round(batteryPct)) : "?",
                    multiplier));
        }
    }

    private static boolean isLivePayload(String json) {
        if (json == null || json.isBlank() || json.trim().startsWith("<")) {
            return false;
        }
        if (!json.contains("\"ok\":true") || !json.contains("\"online\":true")) {
            return false;
        }
        return parseNum(json, "multiplier") > 0;
    }

    /** Returns body on HTTP 2xx JSON-ish success; empty string on miss (no throw for 502 HTML). */
    private String fetchLiveJson(String apiBase) {
        try {
            return getJson(apiBase);
        } catch (Exception ex) {
            plugin.getLogger().fine("Solar mining fetch " + apiBase + ": " + ex.getMessage());
            return "";
        }
    }

    private String getJson(String apiBase) throws Exception {
        String url = apiBase + "/api/rootmc/solar-mining-multiplier";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json")
                .header("User-Agent", "RootEconomy-SolarMining/1.0")
                .GET()
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            throw new IllegalStateException("HTTP " + res.statusCode());
        }
        String body = res.body() == null ? "" : res.body();
        if (body.trim().startsWith("<")) {
            throw new IllegalStateException("non-JSON body from " + apiBase);
        }
        return body;
    }

    private static double parseNum(String json, String key) {
        Matcher m = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)")
                .matcher(json);
        if (!m.find()) {
            return -1;
        }
        try {
            return Double.parseDouble(m.group(1));
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0d) / 1000.0d;
    }

    public record Snapshot(boolean online, Double batteryPercent, double multiplier, long fetchedAtMs) {
        public static Snapshot offline() {
            return new Snapshot(false, null, 1.0d, 0L);
        }
    }
}
