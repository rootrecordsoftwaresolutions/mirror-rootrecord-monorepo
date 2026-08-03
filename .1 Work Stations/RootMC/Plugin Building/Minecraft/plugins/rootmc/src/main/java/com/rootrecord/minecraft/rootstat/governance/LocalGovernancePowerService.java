package com.rootrecord.minecraft.rootstat.governance;

import com.rootrecord.minecraft.common.RootMcEnderChestResolver;
import com.rootrecord.minecraft.common.RootMcEnderChestService;
import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.mysql.MySqlPlayerStore;
import org.bukkit.Bukkit;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.Plugin;

import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Local governance share: Vote Shard power in double /ec × Pro → % of 100.
 * Playtime no longer multiplies weight.
 */
public final class LocalGovernancePowerService {

    private final RootStatBridge bridge;

    public LocalGovernancePowerService(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    public CloudApiClient.GovernanceVotingPower resolve(UUID uuid) {
        if (uuid == null) {
            return unavailable();
        }
        try {
            CloudApiClient.GovernanceVotingPower local = computeLocal(uuid);
            if (local != null) {
                return local;
            }
        } catch (Exception ex) {
            bridge.getPlugin()
                    .getLogger()
                    .log(Level.FINE, "Local governance failed: " + ex.getMessage());
        }
        try {
            if (bridge.config().hasServerCredentials()) {
                return bridge.cloud().fetchGovernanceVotingPower(uuid.toString());
            }
        } catch (Exception ignored) {
        }
        return unavailable();
    }

    private CloudApiClient.GovernanceVotingPower computeLocal(UUID uuid) throws Exception {
        MySqlPlayerStore players = bridge.players();
        if (players == null) {
            return null;
        }
        String playersTable = bridge.config().playersTable();

        record Row(String uuid, boolean eligible) {}
        List<Row> rows = new ArrayList<>();
        try (Connection c = players.openConnection();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT uuid, (verified = 1 AND account_id IS NOT NULL AND account_id <> '') AS eligible FROM "
                             + playersTable)) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new Row(rs.getString("uuid"), rs.getBoolean("eligible")));
                }
            }
        }

        String target = uuid.toString().toLowerCase(Locale.ROOT);
        String targetCompact = target.replace("-", "");
        boolean linked = players.findByUuid(uuid).map(p -> p.verified()).orElse(false);

        Object voteItems = voteShardItems();
        Method sumPower = voteItems == null ? null : voteItems.getClass().getMethod("sumPower", ItemStack[].class);
        RootMcEnderChestService ec = RootMcEnderChestResolver.resolve(bridge.getPlugin());

        double totalRaw = 0;
        double selfRaw = 0;
        int selfPower = 0;
        boolean foundSelf = false;

        for (Row r : rows) {
            if (r.uuid == null || !r.eligible) {
                continue;
            }
            UUID id;
            try {
                id = UUID.fromString(r.uuid.contains("-") ? r.uuid : insertDashes(r.uuid));
            } catch (Exception ex) {
                continue;
            }
            int power = ecPower(id, ec, voteItems, sumPower);
            if (power <= 0) {
                continue;
            }
            int proMult = 1; // local path: Pro applied on cloud when synced
            double raw = (double) power * (double) proMult;
            totalRaw += raw;
            String ru = r.uuid.toLowerCase(Locale.ROOT);
            if (ru.equals(target) || ru.replace("-", "").equals(targetCompact)) {
                selfRaw = raw;
                selfPower = power;
                foundSelf = true;
            }
        }

        if (!foundSelf && linked) {
            selfPower = ecPower(uuid, ec, voteItems, sumPower);
            selfRaw = selfPower;
            totalRaw += selfRaw;
            foundSelf = true;
        }

        if (!linked) {
            return new CloudApiClient.GovernanceVotingPower(
                    true, false, 0, "link account", "", "https://rootmc.net/wiki/constitution/");
        }
        if (!foundSelf || selfPower <= 0) {
            return new CloudApiClient.GovernanceVotingPower(
                    true,
                    false,
                    0,
                    "put Vote Shards in /ec",
                    "",
                    "https://rootmc.net/wiki/constitution/");
        }
        double share = totalRaw > 0 ? (selfRaw / totalRaw) * 100.0 : 0;
        return new CloudApiClient.GovernanceVotingPower(
                true,
                true,
                share,
                String.format(Locale.US, "local %.3f%% · %d Vote Shard power in /ec", share, selfPower),
                "",
                "https://rootmc.net/wiki/constitution/");
    }

    private static int ecPower(UUID uuid, RootMcEnderChestService ec, Object voteItems, Method sumPower) {
        if (voteItems == null || sumPower == null) {
            return 0;
        }
        try {
            ItemStack[] contents;
            if (ec != null) {
                contents = ec.contents(uuid);
            } else {
                var p = Bukkit.getPlayer(uuid);
                contents = p != null ? p.getEnderChest().getContents() : new ItemStack[0];
            }
            Object n = sumPower.invoke(voteItems, (Object) contents);
            return n instanceof Number ? ((Number) n).intValue() : 0;
        } catch (Exception ex) {
            return 0;
        }
    }

    private Object voteShardItems() {
        try {
            Plugin app = Bukkit.getPluginManager().getPlugin("Root-Appreciation");
            if (app == null || !app.isEnabled()) {
                return null;
            }
            return app.getClass().getMethod("voteShards").invoke(app);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String insertDashes(String compact) {
        String c = compact.replace("-", "");
        if (c.length() != 32) {
            return compact;
        }
        return c.substring(0, 8) + "-" + c.substring(8, 12) + "-" + c.substring(12, 16)
                + "-" + c.substring(16, 20) + "-" + c.substring(20);
    }

    public long voteCount(UUID uuid) {
        if (uuid == null) {
            return 0L;
        }
        try {
            Object items = voteShardItems();
            if (items == null) {
                return readVotes(uuid);
            }
            Method sumPower = items.getClass().getMethod("sumPower", ItemStack[].class);
            RootMcEnderChestService ec = RootMcEnderChestResolver.resolve(bridge.getPlugin());
            return ecPower(uuid, ec, items, sumPower);
        } catch (Exception ex) {
            return 0L;
        }
    }

    private long readVotes(UUID uuid) {
        try {
            MySqlPlayerStore players = bridge.players();
            if (players == null) {
                return 0L;
            }
            String prefix = bridge.config().mysqlTablePrefix();
            if (prefix == null || prefix.isBlank()) {
                prefix = "root_";
            }
            String votesTable = prefix + "rewards_votes";
            try (Connection c = players.openConnection();
                 PreparedStatement ps = c.prepareStatement(
                         "SELECT COUNT(*) FROM " + votesTable
                                 + " WHERE LOWER(REPLACE(uuid, '-', '')) = LOWER(REPLACE(?, '-', ''))")) {
                ps.setString(1, uuid.toString());
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next() ? rs.getLong(1) : 0L;
                }
            }
        } catch (Exception ex) {
            return 0L;
        }
    }

    private static CloudApiClient.GovernanceVotingPower unavailable() {
        return new CloudApiClient.GovernanceVotingPower(
                false, false, 0, "unavailable", "", "https://rootmc.net/wiki/constitution/");
    }
}
