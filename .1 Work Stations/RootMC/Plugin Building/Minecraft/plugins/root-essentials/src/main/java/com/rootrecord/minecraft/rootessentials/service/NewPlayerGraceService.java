package com.rootrecord.minecraft.rootessentials.service;

import com.rootrecord.minecraft.common.GoldMoney;
import com.rootrecord.minecraft.common.RootMcClaimTerritoryService;
import com.rootrecord.minecraft.common.RootMcNewPlayerGrace;
import com.rootrecord.minecraft.common.RootMcPermsResolver;
import com.rootrecord.minecraft.common.RootMcPermsService;
import com.rootrecord.minecraft.common.RootMcServerDisplay;
import com.rootrecord.minecraft.common.RootMcTreasuryResolver;
import com.rootrecord.minecraft.common.RootMcTreasuryService;
import com.rootrecord.minecraft.common.RootMcWildernessBlockNotifier;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.ShadedServiceBridge;
import com.rootrecord.minecraft.common.TreasuryLedgerType;
import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import com.rootrecord.minecraft.rootessentials.data.FirstJoinStore;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class NewPlayerGraceService implements RootMcNewPlayerGrace, RootMcWildernessBlockNotifier {

    private static final LegacyComponentSerializer LEGACY = LegacyComponentSerializer.legacySection();

    private final RootEssentialsPlugin plugin;
    private final FirstJoinStore firstJoin;
    private final Map<UUID, Long> rtpCooldownUntil = new ConcurrentHashMap<>();
    private final Map<String, Long> wildernessNotifyCooldowns = new ConcurrentHashMap<>();

    private long graceMs = 24L * 3_600_000L;
    private boolean keepInventory = true;
    private boolean skipDeathTax = true;
    private boolean rtpEnabled = true;
    /** Destination world for /rtp (never the Multiverse spawn hub). */
    private String rtpWorld = "world";
    private long rtpCooldownMs = 15L * 60_000L;
    private int rtpMinRadius = 500;
    private int rtpMaxRadius = 5000;
    private int rtpMaxAttempts = 24;
    /** After grace: Explorer/basic fee; each purchased rank multiplies the prior fee. */
    private boolean rtpPaidAfterGrace = true;
    private double rtpBaseFee = 5.0;
    private double rtpFeeRankMultiplier = 1.5;
    private List<String> rtpRankTrack = List.of(
            "wanderer", "settler", "pioneer", "citizen", "veteran", "elite", "champion");
    private List<String> welcomeLines = List.of(
            "",
            "&6&lWelcome to {server}, {player}.",
            "&7You are arriving at a new world built around towns, nations, land, and a Gold-backed economy.",
            "&eFirst steps: &f/readme &7for the guide, &f/map &7for the live map, &f/rtp &7to explore, and &f/towny &7when you are ready to settle.",
            "&aStarter grace is active for 24 hours: keep-inventory is on, /rtp is available, and early mistakes are protected.",
            "&8Ask questions in chat. The server is meant to teach you as you play.",
            "");

    private boolean wildernessNotifyEnabled = true;
    private double wildernessMinValue = 1.0;
    private long wildernessBaseCooldownMs = 120_000L;
    private double wildernessHighValue = 50.0;
    private long wildernessHighCooldownMs = 30_000L;

    private boolean wildernessFeeEnabled = true;
    private double wildernessFeeRate = 0.10;
    private double wildernessFeeMinWorth = 1.0;
    private String wildernessFeeChannel = "service-fee:wilderness-destroy";

    public NewPlayerGraceService(RootEssentialsPlugin plugin, FirstJoinStore firstJoin) {
        this.plugin = plugin;
        this.firstJoin = firstJoin;
    }

    public void reload(FileConfiguration cfg) {
        graceMs = Math.max(0L, cfg.getLong("new-player.grace-hours", 24)) * 3_600_000L;
        keepInventory = cfg.getBoolean("new-player.keep-inventory", true);
        skipDeathTax = cfg.getBoolean("new-player.skip-death-tax", true);
        rtpEnabled = cfg.getBoolean("new-player.rtp-enabled", true);
        String configuredRtpWorld = cfg.getString("new-player.rtp-world", "world");
        rtpWorld = configuredRtpWorld == null || configuredRtpWorld.isBlank()
                ? "world"
                : configuredRtpWorld.trim();
        rtpCooldownMs = Math.max(0L, cfg.getLong("new-player.rtp-cooldown-minutes", 15)) * 60_000L;
        rtpMinRadius = Math.max(50, cfg.getInt("new-player.rtp-min-radius", 500));
        rtpMaxRadius = Math.max(rtpMinRadius, cfg.getInt("new-player.rtp-max-radius", 5000));
        rtpMaxAttempts = Math.max(8, cfg.getInt("new-player.rtp-max-attempts", 24));
        rtpPaidAfterGrace = cfg.getBoolean("new-player.rtp-paid-after-grace", true);
        rtpBaseFee = Math.max(0, cfg.getDouble("new-player.rtp-base-fee", 5.0));
        rtpFeeRankMultiplier = Math.max(1.0, cfg.getDouble("new-player.rtp-fee-rank-multiplier", 1.5));
        rtpRankTrack = loadRtpRankTrack();
        List<String> configuredWelcome = cfg.getStringList("new-player.welcome");
        if (configuredWelcome != null && !configuredWelcome.isEmpty()) {
            welcomeLines = List.copyOf(configuredWelcome);
        }

        wildernessNotifyEnabled = cfg.getBoolean("wilderness-build-notify.enabled", true);
        wildernessMinValue = Math.max(0, cfg.getDouble("wilderness-build-notify.min-value", 1.0));
        wildernessBaseCooldownMs = Math.max(5_000L, cfg.getLong("wilderness-build-notify.base-cooldown-seconds", 120)) * 1000L;
        wildernessHighValue = Math.max(wildernessMinValue, cfg.getDouble("wilderness-build-notify.high-value-threshold", 50.0));
        wildernessHighCooldownMs = Math.max(5_000L, cfg.getLong("wilderness-build-notify.high-value-cooldown-seconds", 30)) * 1000L;

        wildernessFeeEnabled = cfg.getBoolean("wilderness-destroy-fee.enabled", true);
        wildernessFeeRate = Math.max(0, cfg.getDouble("wilderness-destroy-fee.rate", 0.10));
        wildernessFeeMinWorth = Math.max(0, cfg.getDouble("wilderness-destroy-fee.min-worth", 1.0));
        wildernessFeeChannel = cfg.getString("wilderness-destroy-fee.treasury-channel", "service-fee:wilderness-destroy");
    }

    public void recordJoin(Player player) {
        if (player == null || firstJoin == null) {
            return;
        }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                long firstMs = firstJoin.ensureFirstJoinMs(player.getUniqueId());
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    if (!player.isOnline()) {
                        return;
                    }
                    if (inGracePeriod(player.getUniqueId(), firstMs)) {
                        for (String line : welcomeLines) {
                            String withServer = RootMcServerDisplay.apply(plugin, line);
                            player.sendMessage(plugin.colorize(
                                    withServer.replace("{player}", player.getName())));
                        }
                    }
                });
            } catch (Exception ex) {
                plugin.getLogger().warning("First join record failed for " + player.getName() + ": " + ex.getMessage());
            }
        });
    }

    @Override
    public boolean inGracePeriod(UUID playerId) {
        if (graceMs <= 0 || firstJoin == null) {
            return false;
        }
        try {
            long firstMs = firstJoin.firstJoinMs(playerId);
            return firstMs > 0 && inGracePeriod(playerId, firstMs);
        } catch (Exception ex) {
            return false;
        }
    }

    @Override
    public long graceRemainingMs(UUID playerId) {
        if (graceMs <= 0 || firstJoin == null) {
            return 0L;
        }
        try {
            long firstMs = firstJoin.firstJoinMs(playerId);
            if (firstMs <= 0) {
                return 0L;
            }
            long end = firstMs + graceMs;
            return Math.max(0L, end - System.currentTimeMillis());
        } catch (Exception ex) {
            return 0L;
        }
    }

    @Override
    public boolean exemptFromDeathTax(UUID playerId) {
        return skipDeathTax && inGracePeriod(playerId);
    }

    public boolean keepInventoryEnabled() {
        return keepInventory && graceMs > 0;
    }

    public boolean skipDeathTaxDuringGrace() {
        return skipDeathTax;
    }

    /** When {@code new-player.rtp-enabled} is true, /rtp is available (free in grace, paid after). */
    public boolean rtpAllowed(Player player) {
        return rtpEnabled;
    }

    /**
     * Gold fee for one /rtp. Free during starter grace (and when paid mode is off).
     * Explorer/basic = base fee; each purchased player-track rank multiplies the prior fee
     * ({@code base × multiplier^(rankIndex+1)}).
     */
    public double rtpFeeFor(Player player) {
        if (player == null || !rtpPaidAfterGrace || rtpBaseFee <= 0) {
            return 0;
        }
        if (inGracePeriod(player.getUniqueId())) {
            return 0;
        }
        int idx = -1;
        RootMcPermsService perms = RootMcPermsResolver.resolve(plugin);
        if (perms != null && !rtpRankTrack.isEmpty()) {
            idx = perms.highestTrackIndex(player.getUniqueId(), rtpRankTrack);
        }
        double fee = rtpBaseFee;
        if (idx >= 0) {
            fee = rtpBaseFee * Math.pow(rtpFeeRankMultiplier, idx + 1);
        }
        return GoldMoney.round(fee);
    }

    public long rtpCooldownRemainingMs(UUID playerId) {
        Long until = rtpCooldownUntil.get(playerId);
        if (until == null) {
            return 0L;
        }
        long remaining = until - System.currentTimeMillis();
        if (remaining <= 0) {
            rtpCooldownUntil.remove(playerId);
            return 0L;
        }
        return remaining;
    }

    public void markRtpUsed(UUID playerId) {
        if (rtpCooldownMs > 0) {
            rtpCooldownUntil.put(playerId, System.currentTimeMillis() + rtpCooldownMs);
        }
    }

    public String rtpWorld() {
        return rtpWorld;
    }

    public int rtpMinRadius() {
        return rtpMinRadius;
    }

    public int rtpMaxRadius() {
        return rtpMaxRadius;
    }

    public int rtpMaxAttempts() {
        return rtpMaxAttempts;
    }

    private boolean inGracePeriod(UUID playerId, long firstJoinMs) {
        return System.currentTimeMillis() < firstJoinMs + graceMs;
    }

    private List<String> loadRtpRankTrack() {
        try {
            var file = RootRecordFolders.configFile(plugin, RootRecordFolders.ROOT_RANKS_CONFIG);
            if (file == null || !file.isFile()) {
                return rtpRankTrack;
            }
            List<String> ids = new ArrayList<>();
            for (var map : YamlConfiguration.loadConfiguration(file).getMapList("ranks")) {
                Object idRaw = map.get("id");
                String id = idRaw == null ? "" : String.valueOf(idRaw).trim().toLowerCase(Locale.ROOT);
                if (!id.isEmpty()) {
                    ids.add(id);
                }
            }
            return ids.isEmpty() ? rtpRankTrack : List.copyOf(ids);
        } catch (Exception ex) {
            plugin.getLogger().warning("RTP rank track load failed: " + ex.getMessage());
            return rtpRankTrack;
        }
    }

    /**
     * Charge the wilderness destroy fee for breaking a valued block.
     * Always allows the break (wallet may go negative). Territory fees credit the claim bank;
     * elsewhere fees go to the Server Reserve.
     *
     * @return always {@code true} (break is never cancelled for fee reasons)
     */
    public boolean tryChargeWildernessDestroy(Player player, Material material, Location location) {
        if (!wildernessFeeEnabled || player == null || material == null || material.isAir() || location == null) {
            return true;
        }
        if (player.hasPermission("rootessentials.wilderness-fee.bypass")) {
            return true;
        }
        if (location.getWorld() == null) {
            return true;
        }
        String worldName = location.getWorld().getName();
        int blockX = location.getBlockX();
        int blockZ = location.getBlockZ();
        RootMcClaimTerritoryService claims = ShadedServiceBridge.resolveClaimTerritory(plugin);
        if (claims != null
                && claims.isWildernessFeeExempt(player.getUniqueId(), worldName, blockX, blockZ)) {
            return true;
        }
        Double worth = plugin.itemPrice(material);
        if (worth == null || worth < wildernessFeeMinWorth || wildernessFeeRate <= 0) {
            return true;
        }
        double fee = GoldMoney.round(worth * wildernessFeeRate);
        if (fee < GoldMoney.MIN_AMOUNT) {
            return true;
        }
        try {
            if (!plugin.withdrawAllowingDebt(player.getUniqueId(), player.getName(), fee)) {
                plugin.getLogger().warning("Wilderness destroy fee debit failed for " + player.getName());
                return true;
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Wilderness destroy fee withdraw failed for "
                    + player.getName() + ": " + ex.getMessage());
            return true;
        }

        String claimOwner = claims == null
                ? null
                : claims.creditWildernessDestroyFee(worldName, blockX, blockZ, fee, player.getName());
        if (claimOwner != null) {
            double balance;
            try {
                balance = plugin.balance(player.getUniqueId(), player.getName());
            } catch (Exception ex) {
                balance = 0;
            }
            player.sendActionBar(LEGACY.deserialize(plugin.colorize(plugin.rawMsg("wilderness-destroy-fee-claim")
                    .replace("{fee}", plugin.money(fee))
                    .replace("{item}", formatMaterial(material))
                    .replace("{value}", plugin.money(worth))
                    .replace("{owner}", claimOwner)
                    .replace("{balance}", plugin.money(balance))
                    .replace("{currency}", plugin.currency()))));
            return true;
        }

        RootMcTreasuryService treasury = RootMcTreasuryResolver.resolve(plugin);
        if (treasury != null) {
            try {
                treasury.creditTreasury(
                        fee,
                        TreasuryLedgerType.TOWNY_SINK,
                        player.getUniqueId(),
                        player.getName(),
                        wildernessFeeChannel + ":" + material.name() + ":tax-free");
            } catch (RuntimeException ex) {
                try {
                    plugin.deposit(player.getUniqueId(), player.getName(), fee);
                } catch (Exception refundEx) {
                    plugin.getLogger().warning("Wilderness fee refund failed for "
                            + player.getName() + ": " + refundEx.getMessage());
                }
                plugin.getLogger().warning("Wilderness destroy fee treasury credit failed: " + ex.getMessage());
                return true;
            }
        }

        double balance;
        try {
            balance = plugin.balance(player.getUniqueId(), player.getName());
        } catch (Exception ex) {
            balance = 0;
        }
        player.sendActionBar(LEGACY.deserialize(plugin.colorize(plugin.rawMsg("wilderness-destroy-fee-charged")
                .replace("{fee}", plugin.money(fee))
                .replace("{item}", formatMaterial(material))
                .replace("{value}", plugin.money(worth))
                .replace("{balance}", plugin.money(balance))
                .replace("{currency}", plugin.currency()))));
        return true;
    }

    @Override
    public void onWildernessBlockChange(
            UUID playerId,
            String playerName,
            Material material,
            String worldName,
            int blockX,
            int blockY,
            int blockZ,
            boolean placing) {
        if (!wildernessNotifyEnabled || material == null || material.isAir()) {
            return;
        }
        Player player = plugin.getServer().getPlayer(playerId);
        if (player == null || !player.isOnline()) {
            return;
        }
        Double price = plugin.itemPrice(material);
        if (price == null || price < wildernessMinValue) {
            return;
        }
        long cooldown = price >= wildernessHighValue ? wildernessHighCooldownMs : wildernessBaseCooldownMs;
        String key = playerId + ":" + material.name() + ":" + (placing ? "p" : "b");
        long now = System.currentTimeMillis();
        Long last = wildernessNotifyCooldowns.get(key);
        if (last != null && now - last < cooldown) {
            return;
        }
        wildernessNotifyCooldowns.put(key, now);

        String tier = price >= wildernessHighValue ? "high" : (price >= 10.0 ? "mid" : "low");
        String msgKey = "wilderness-build-" + tier;
        String body = plugin.rawMsg(msgKey)
                .replace("{item}", formatMaterial(material))
                .replace("{value}", plugin.money(price))
                .replace("{action}", placing ? "placing" : "breaking");
        player.sendActionBar(LEGACY.deserialize(plugin.colorize(body)));
        if (price >= wildernessHighValue) {
            player.sendMessage(plugin.msg(msgKey)
                    .replace("{item}", formatMaterial(material))
                    .replace("{value}", plugin.money(price))
                    .replace("{action}", placing ? "placing" : "breaking"));
        }
    }

    private static String formatMaterial(Material material) {
        return material.name().toLowerCase().replace('_', ' ');
    }
}
