package com.rootrecord.minecraft.rootrewards.data;

import com.rootrecord.minecraft.rootrewards.config.RewardsConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class RewardsStore {

    private final RewardsConfig config;

    public RewardsStore(RewardsConfig config) {
        this.config = config;
    }

    public void initSchema() throws SQLException {
        if (!config.mysqlEnabled()) {
            return;
        }
        try (Connection c = open(); Statement st = c.createStatement()) {
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      uuid CHAR(36) PRIMARY KEY,
                      last_claimed_tier INT NOT NULL DEFAULT -1,
                      updated_at DATETIME NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(config.claimsTable()));
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      uuid CHAR(36) PRIMARY KEY,
                      total_playtime_seconds BIGINT NOT NULL DEFAULT 0,
                      updated_at DATETIME NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(config.fallbackPlaytimeTable()));
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY,
                      uuid CHAR(36) NOT NULL,
                      service VARCHAR(64) NOT NULL,
                      voted_at DATETIME NOT NULL,
                      INDEX idx_rewards_votes_uuid_service (uuid, service, voted_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(config.votesTable()));
        }
    }

    public long readTotalPlaytimeSeconds(UUID uuid) throws SQLException {
        if (config.mysqlEnabled() && config.useRootMcPlaytime()) {
            Long fromRootMc = readRootMcPlaytime(uuid);
            if (fromRootMc != null) {
                return fromRootMc;
            }
        }
        return readFallbackPlaytime(uuid);
    }

    private Long readRootMcPlaytime(UUID uuid) throws SQLException {
        String table = config.playtimeTableFqn();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT total_playtime_seconds FROM " + table + " WHERE uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong("total_playtime_seconds");
                }
            }
        } catch (SQLException ex) {
            if (isMissingTable(ex)) {
                return null;
            }
            throw ex;
        }
        return 0L;
    }

    private long readFallbackPlaytime(UUID uuid) throws SQLException {
        if (!config.mysqlEnabled()) {
            return 0L;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT total_playtime_seconds FROM " + config.fallbackPlaytimeTable() + " WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getLong("total_playtime_seconds");
                }
            }
        }
        return 0L;
    }

    public void addFallbackPlaytime(UUID uuid, long deltaSeconds) throws SQLException {
        if (!config.mysqlEnabled() || deltaSeconds <= 0) {
            return;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        INSERT INTO %s (uuid, total_playtime_seconds, updated_at)
                        VALUES (?, ?, NOW())
                        ON DUPLICATE KEY UPDATE
                          total_playtime_seconds = total_playtime_seconds + VALUES(total_playtime_seconds),
                          updated_at = NOW()
                        """
                                .formatted(config.fallbackPlaytimeTable()))) {
            ps.setString(1, uuid.toString());
            ps.setLong(2, deltaSeconds);
            ps.executeUpdate();
        }
    }

    public int lastClaimedTier(UUID uuid) throws SQLException {
        if (!config.mysqlEnabled()) {
            return -1;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT last_claimed_tier FROM " + config.claimsTable() + " WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getInt("last_claimed_tier");
                }
            }
        }
        return -1;
    }

    public void setLastClaimedTier(UUID uuid, int tier) throws SQLException {
        if (!config.mysqlEnabled()) {
            return;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        INSERT INTO %s (uuid, last_claimed_tier, updated_at)
                        VALUES (?, ?, NOW())
                        ON DUPLICATE KEY UPDATE last_claimed_tier = VALUES(last_claimed_tier), updated_at = NOW()
                        """
                                .formatted(config.claimsTable()))) {
            ps.setString(1, uuid.toString());
            ps.setInt(2, tier);
            ps.executeUpdate();
        }
    }

    public Optional<Instant> lastVoteAt(UUID uuid, String service) throws SQLException {
        if (!config.mysqlEnabled()) {
            return Optional.empty();
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        SELECT voted_at FROM %s
                        WHERE uuid = ? AND service = ?
                        ORDER BY voted_at DESC LIMIT 1
                        """
                                .formatted(config.votesTable()))) {
            ps.setString(1, uuid.toString());
            ps.setString(2, service);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(rs.getTimestamp("voted_at").toInstant());
                }
            }
        }
        return Optional.empty();
    }

    public void recordVote(UUID uuid, String service) throws SQLException {
        if (!config.mysqlEnabled()) {
            return;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + config.votesTable() + " (uuid, service, voted_at) VALUES (?, ?, NOW())")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, service);
            ps.executeUpdate();
        }
    }

    private Connection open() throws SQLException {
        String url = "jdbc:mysql://" + config.mysqlHost() + ":" + config.mysqlPort() + "/"
                + config.mysqlDatabase() + "?" + config.mysqlJdbcParams();
        return DriverManager.getConnection(url, config.mysqlUsername(), config.mysqlPassword());
    }

    private static boolean isMissingTable(SQLException ex) {
        String msg = ex.getMessage();
        return msg != null && (msg.contains("doesn't exist") || msg.contains("Unknown table"));
    }
}
