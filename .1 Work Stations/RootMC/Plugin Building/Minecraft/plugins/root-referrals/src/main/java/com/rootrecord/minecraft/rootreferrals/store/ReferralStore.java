package com.rootrecord.minecraft.rootreferrals.store;

import com.rootrecord.minecraft.common.config.RootMcDatabaseConfig;
import com.rootrecord.minecraft.common.mysql.MysqlConnections;
import com.rootrecord.minecraft.rootcore.api.RootCoreApi;
import org.bukkit.Bukkit;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ReferralStore {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_QUALIFIED = "QUALIFIED";
    public static final String STATUS_UNLINKED = "UNLINKED";

    private final JavaPlugin plugin;
    private final String playerTable;
    private final String edgeTable;
    private final String payoutTable;
    private final String milestoneTable;
    private volatile boolean ready;

    public ReferralStore(JavaPlugin plugin, String tablePrefix) {
        this.plugin = plugin;
        String prefix = tablePrefix == null || tablePrefix.isBlank() ? "root_" : tablePrefix;
        this.playerTable = prefix + "referral_player";
        this.edgeTable = prefix + "referral_edge";
        this.payoutTable = prefix + "referral_payout";
        this.milestoneTable = prefix + "referral_milestone";
    }

    public void initSchema() {
        RootMcDatabaseConfig.DatabaseSettings db = database();
        if (db == null || !db.isConfigured()) {
            plugin.getLogger().warning("Root-Referrals: MySQL not configured — data will not persist.");
            ready = false;
            return;
        }
        try (Connection c = MysqlConnections.open(db); Statement st = c.createStatement()) {
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      uuid CHAR(36) NOT NULL,
                      code VARCHAR(16) NOT NULL,
                      discord_id VARCHAR(64) NULL,
                      display_name VARCHAR(32) NOT NULL,
                      total_qualified INT NOT NULL DEFAULT 0,
                      total_earned_g DOUBLE NOT NULL DEFAULT 0,
                      created_at DATETIME NOT NULL,
                      PRIMARY KEY (uuid),
                      UNIQUE KEY uk_referral_code (code)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(playerTable));
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT NOT NULL AUTO_INCREMENT,
                      referrer_uuid CHAR(36) NOT NULL,
                      recruit_uuid CHAR(36) NOT NULL,
                      referrer_discord VARCHAR(64) NULL,
                      recruit_discord VARCHAR(64) NULL,
                      status VARCHAR(16) NOT NULL,
                      claimed_at DATETIME NULL,
                      qualified_at DATETIME NULL,
                      claim_ip VARCHAR(45) NULL,
                      ip_flag TINYINT NOT NULL DEFAULT 0,
                      PRIMARY KEY (id),
                      UNIQUE KEY uk_referral_recruit (recruit_uuid),
                      INDEX idx_referral_referrer (referrer_uuid, status)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(edgeTable));
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT NOT NULL AUTO_INCREMENT,
                      player_uuid CHAR(36) NOT NULL,
                      edge_id BIGINT NULL,
                      kind VARCHAR(32) NOT NULL,
                      amount_g DOUBLE NOT NULL,
                      reason VARCHAR(128) NOT NULL,
                      created_at DATETIME NOT NULL,
                      PRIMARY KEY (id),
                      INDEX idx_referral_payout_player (player_uuid, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(payoutTable));
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      player_uuid CHAR(36) NOT NULL,
                      milestone_key VARCHAR(32) NOT NULL,
                      paid_at DATETIME NOT NULL,
                      PRIMARY KEY (player_uuid, milestone_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(milestoneTable));
            ready = true;
            plugin.getLogger().info("Root-Referrals tables ready.");
        } catch (Exception e) {
            ready = false;
            plugin.getLogger().warning("Root-Referrals schema failed: " + e.getMessage());
        }
    }

    public boolean ready() {
        return ready;
    }

    public Optional<ReferralPlayer> findPlayer(UUID uuid) {
        if (!ready || uuid == null) {
            return Optional.empty();
        }
        String sql = "SELECT uuid, code, discord_id, display_name, total_qualified, total_earned_g, created_at FROM "
                + playerTable + " WHERE uuid = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(readPlayer(rs));
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findPlayer failed: " + e.getMessage());
            return Optional.empty();
        }
    }

    public Optional<ReferralPlayer> findByCode(String code) {
        if (!ready || code == null || code.isBlank()) {
            return Optional.empty();
        }
        String sql = "SELECT uuid, code, discord_id, display_name, total_qualified, total_earned_g, created_at FROM "
                + playerTable + " WHERE code = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, code.trim().toUpperCase());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(readPlayer(rs));
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findByCode failed: " + e.getMessage());
            return Optional.empty();
        }
    }

    public boolean codeExists(String code) {
        return findByCode(code).isPresent();
    }

    public ReferralPlayer ensurePlayer(UUID uuid, String displayName, String discordId, String code) {
        if (!ready || uuid == null) {
            return null;
        }
        Optional<ReferralPlayer> existing = findPlayer(uuid);
        if (existing.isPresent()) {
            updateDisplayName(uuid, displayName);
            if (discordId != null && !discordId.isBlank()) {
                updateDiscordId(uuid, discordId);
            }
            return findPlayer(uuid).orElse(existing.get());
        }
        String sql =
                "INSERT INTO "
                        + playerTable
                        + " (uuid, code, discord_id, display_name, total_qualified, total_earned_g, created_at) VALUES (?, ?, ?, ?, 0, 0, UTC_TIMESTAMP())";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, uuid.toString());
            ps.setString(2, code);
            ps.setString(3, discordId);
            ps.setString(4, displayName == null ? "Unknown" : displayName);
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("ensurePlayer failed: " + e.getMessage());
            return null;
        }
        return findPlayer(uuid).orElse(null);
    }

    public void updateDisplayName(UUID uuid, String displayName) {
        if (!ready || uuid == null || displayName == null || displayName.isBlank()) {
            return;
        }
        String sql = "UPDATE " + playerTable + " SET display_name = ? WHERE uuid = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, displayName);
            ps.setString(2, uuid.toString());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("updateDisplayName failed: " + e.getMessage());
        }
    }

    public void updateDiscordId(UUID uuid, String discordId) {
        if (!ready || uuid == null) {
            return;
        }
        String sql = "UPDATE " + playerTable + " SET discord_id = ? WHERE uuid = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, discordId);
            ps.setString(2, uuid.toString());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("updateDiscordId failed: " + e.getMessage());
        }
    }

    public Optional<ReferralEdge> findEdgeByRecruit(UUID recruitUuid) {
        if (!ready || recruitUuid == null) {
            return Optional.empty();
        }
        String sql =
                "SELECT id, referrer_uuid, recruit_uuid, referrer_discord, recruit_discord, status, claimed_at, qualified_at, claim_ip, ip_flag FROM "
                        + edgeTable
                        + " WHERE recruit_uuid = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, recruitUuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(readEdge(rs));
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findEdgeByRecruit failed: " + e.getMessage());
            return Optional.empty();
        }
    }

    public List<ReferralEdge> pendingEdges() {
        List<ReferralEdge> out = new ArrayList<>();
        if (!ready) {
            return out;
        }
        String sql =
                "SELECT id, referrer_uuid, recruit_uuid, referrer_discord, recruit_discord, status, claimed_at, qualified_at, claim_ip, ip_flag FROM "
                        + edgeTable
                        + " WHERE status = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, STATUS_PENDING);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(readEdge(rs));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("pendingEdges failed: " + e.getMessage());
        }
        return out;
    }

    public List<ReferralEdge> edgesByReferrer(UUID referrerUuid, String status) {
        List<ReferralEdge> out = new ArrayList<>();
        if (!ready || referrerUuid == null) {
            return out;
        }
        String sql =
                "SELECT id, referrer_uuid, recruit_uuid, referrer_discord, recruit_discord, status, claimed_at, qualified_at, claim_ip, ip_flag FROM "
                        + edgeTable
                        + " WHERE referrer_uuid = ?"
                        + (status != null ? " AND status = ?" : "")
                        + " ORDER BY claimed_at ASC";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, referrerUuid.toString());
            if (status != null) {
                ps.setString(2, status);
            }
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(readEdge(rs));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("edgesByReferrer failed: " + e.getMessage());
        }
        return out;
    }

    public int countPendingByReferrer(UUID referrerUuid) {
        if (!ready || referrerUuid == null) {
            return 0;
        }
        String sql = "SELECT COUNT(*) FROM " + edgeTable + " WHERE referrer_uuid = ? AND status = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, referrerUuid.toString());
            ps.setString(2, STATUS_PENDING);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        } catch (Exception e) {
            return 0;
        }
    }

    public boolean insertPendingEdge(
            UUID referrerUuid,
            UUID recruitUuid,
            String referrerDiscord,
            String recruitDiscord,
            String claimIp,
            boolean ipFlag) {
        if (!ready || referrerUuid == null || recruitUuid == null) {
            return false;
        }
        String sql =
                "INSERT INTO "
                        + edgeTable
                        + " (referrer_uuid, recruit_uuid, referrer_discord, recruit_discord, status, claimed_at, claim_ip, ip_flag) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, referrerUuid.toString());
            ps.setString(2, recruitUuid.toString());
            ps.setString(3, referrerDiscord);
            ps.setString(4, recruitDiscord);
            ps.setString(5, STATUS_PENDING);
            ps.setString(6, claimIp);
            ps.setInt(7, ipFlag ? 1 : 0);
            return ps.executeUpdate() > 0;
        } catch (Exception e) {
            plugin.getLogger().warning("insertPendingEdge failed: " + e.getMessage());
            return false;
        }
    }

    public boolean markQualified(long edgeId) {
        if (!ready || edgeId <= 0) {
            return false;
        }
        String sql =
                "UPDATE "
                        + edgeTable
                        + " SET status = ?, qualified_at = UTC_TIMESTAMP() WHERE id = ? AND status = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, STATUS_QUALIFIED);
            ps.setLong(2, edgeId);
            ps.setString(3, STATUS_PENDING);
            return ps.executeUpdate() > 0;
        } catch (Exception e) {
            plugin.getLogger().warning("markQualified failed: " + e.getMessage());
            return false;
        }
    }

    public boolean unlinkEdge(UUID recruitUuid) {
        if (!ready || recruitUuid == null) {
            return false;
        }
        String sql = "UPDATE " + edgeTable + " SET status = ? WHERE recruit_uuid = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, STATUS_UNLINKED);
            ps.setString(2, recruitUuid.toString());
            return ps.executeUpdate() > 0;
        } catch (Exception e) {
            plugin.getLogger().warning("unlinkEdge failed: " + e.getMessage());
            return false;
        }
    }

    public void incrementQualifiedAndEarned(UUID referrerUuid, double earnedDelta) {
        if (!ready || referrerUuid == null) {
            return;
        }
        String sql =
                "UPDATE "
                        + playerTable
                        + " SET total_qualified = total_qualified + 1, total_earned_g = total_earned_g + ? WHERE uuid = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setDouble(1, Math.max(0, earnedDelta));
            ps.setString(2, referrerUuid.toString());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("incrementQualifiedAndEarned failed: " + e.getMessage());
        }
    }

    /** Add lifetime earned Gold without changing qualified count (milestones). */
    public void addEarned(UUID referrerUuid, double earnedDelta) {
        if (!ready || referrerUuid == null || earnedDelta <= 0) {
            return;
        }
        String sql = "UPDATE " + playerTable + " SET total_earned_g = total_earned_g + ? WHERE uuid = ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setDouble(1, earnedDelta);
            ps.setString(2, referrerUuid.toString());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("addEarned failed: " + e.getMessage());
        }
    }

    public void recordPayout(UUID playerUuid, Long edgeId, String kind, double amountG, String reason) {
        if (!ready || playerUuid == null) {
            return;
        }
        String sql =
                "INSERT INTO "
                        + payoutTable
                        + " (player_uuid, edge_id, kind, amount_g, reason, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, playerUuid.toString());
            if (edgeId == null) {
                ps.setNull(2, java.sql.Types.BIGINT);
            } else {
                ps.setLong(2, edgeId);
            }
            ps.setString(3, kind);
            ps.setDouble(4, amountG);
            ps.setString(5, reason);
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("recordPayout failed: " + e.getMessage());
        }
    }

    public boolean hasMilestone(UUID playerUuid, String milestoneKey) {
        if (!ready || playerUuid == null || milestoneKey == null) {
            return false;
        }
        String sql = "SELECT 1 FROM " + milestoneTable + " WHERE player_uuid = ? AND milestone_key = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, playerUuid.toString());
            ps.setString(2, milestoneKey);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public void markMilestonePaid(UUID playerUuid, String milestoneKey) {
        if (!ready || playerUuid == null || milestoneKey == null) {
            return;
        }
        String sql =
                "INSERT IGNORE INTO "
                        + milestoneTable
                        + " (player_uuid, milestone_key, paid_at) VALUES (?, ?, UTC_TIMESTAMP())";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, playerUuid.toString());
            ps.setString(2, milestoneKey);
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("markMilestonePaid failed: " + e.getMessage());
        }
    }

    public boolean referrerHasClaimIp(UUID referrerUuid, String ip) {
        if (!ready || referrerUuid == null || ip == null || ip.isBlank()) {
            return false;
        }
        String sql = "SELECT 1 FROM " + edgeTable + " WHERE referrer_uuid = ? AND claim_ip = ? LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, referrerUuid.toString());
            ps.setString(2, ip);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public boolean hasIpFlagForReferrer(UUID referrerUuid, String ip) {
        if (!ready || referrerUuid == null || ip == null || ip.isBlank()) {
            return false;
        }
        String sql =
                "SELECT 1 FROM "
                        + edgeTable
                        + " WHERE referrer_uuid = ? AND claim_ip = ? AND ip_flag = 1 LIMIT 1";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, referrerUuid.toString());
            ps.setString(2, ip);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public List<TopReferrerRow> topReferrers(int limit) {
        List<TopReferrerRow> out = new ArrayList<>();
        if (!ready) {
            return out;
        }
        int capped = Math.max(1, Math.min(20, limit));
        String sql =
                "SELECT display_name, total_qualified, total_earned_g FROM "
                        + playerTable
                        + " WHERE total_qualified > 0 ORDER BY total_qualified DESC, total_earned_g DESC LIMIT ?";
        try (Connection c = open(); PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, capped);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(new TopReferrerRow(
                            rs.getString(1),
                            rs.getInt(2),
                            rs.getDouble(3)));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("topReferrers failed: " + e.getMessage());
        }
        return out;
    }

    public void purgePlayer(UUID uuid) {
        if (!ready || uuid == null) {
            return;
        }
        try (Connection c = open()) {
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + edgeTable + " WHERE referrer_uuid = ? OR recruit_uuid = ?")) {
                ps.setString(1, uuid.toString());
                ps.setString(2, uuid.toString());
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + payoutTable + " WHERE player_uuid = ?")) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + milestoneTable + " WHERE player_uuid = ?")) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement("DELETE FROM " + playerTable + " WHERE uuid = ?")) {
                ps.setString(1, uuid.toString());
                ps.executeUpdate();
            }
        } catch (Exception e) {
            plugin.getLogger().warning("purgePlayer failed: " + e.getMessage());
        }
    }

    private ReferralPlayer readPlayer(ResultSet rs) throws Exception {
        Timestamp created = rs.getTimestamp("created_at");
        return new ReferralPlayer(
                UUID.fromString(rs.getString("uuid")),
                rs.getString("code"),
                rs.getString("discord_id"),
                rs.getString("display_name"),
                rs.getInt("total_qualified"),
                rs.getDouble("total_earned_g"),
                created != null ? created.toInstant() : Instant.now());
    }

    private ReferralEdge readEdge(ResultSet rs) throws Exception {
        Timestamp claimed = rs.getTimestamp("claimed_at");
        Timestamp qualified = rs.getTimestamp("qualified_at");
        return new ReferralEdge(
                rs.getLong("id"),
                UUID.fromString(rs.getString("referrer_uuid")),
                UUID.fromString(rs.getString("recruit_uuid")),
                rs.getString("referrer_discord"),
                rs.getString("recruit_discord"),
                rs.getString("status"),
                claimed != null ? claimed.toInstant() : null,
                qualified != null ? qualified.toInstant() : null,
                rs.getString("claim_ip"),
                rs.getInt("ip_flag") != 0);
    }

    private Connection open() throws Exception {
        RootMcDatabaseConfig.DatabaseSettings db = database();
        if (db == null) {
            throw new IllegalStateException("database unavailable");
        }
        return MysqlConnections.open(db);
    }

    private RootMcDatabaseConfig.DatabaseSettings database() {
        RegisteredServiceProvider<RootCoreApi> rsp =
                Bukkit.getServicesManager().getRegistration(RootCoreApi.class);
        if (rsp == null || rsp.getProvider() == null) {
            return null;
        }
        return rsp.getProvider().databaseSettings();
    }

    public record ReferralPlayer(
            UUID uuid,
            String code,
            String discordId,
            String displayName,
            int totalQualified,
            double totalEarnedG,
            Instant createdAt) {}

    public record ReferralEdge(
            long id,
            UUID referrerUuid,
            UUID recruitUuid,
            String referrerDiscord,
            String recruitDiscord,
            String status,
            Instant claimedAt,
            Instant qualifiedAt,
            String claimIp,
            boolean ipFlag) {}

    public record TopReferrerRow(String displayName, int totalQualified, double totalEarnedG) {}
}
