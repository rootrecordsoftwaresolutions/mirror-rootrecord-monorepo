package com.rootrecord.minecraft.rootrewards.data;

import com.rootrecord.minecraft.rootrewards.config.RewardsConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
                      gold_earned DOUBLE NOT NULL DEFAULT 0,
                      INDEX idx_rewards_votes_uuid_service (uuid, service, voted_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(config.votesTable()));
            ensureVoteGoldColumn(st);
        }
    }

    private void ensureVoteGoldColumn(Statement st) throws SQLException {
        try {
            st.executeUpdate(
                    "ALTER TABLE " + config.votesTable() + " ADD COLUMN gold_earned DOUBLE NOT NULL DEFAULT 0");
        } catch (SQLException ex) {
            String msg = ex.getMessage();
            if (msg == null || (!msg.contains("Duplicate column") && !msg.contains("duplicate column name"))) {
                throw ex;
            }
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

    public Optional<PlaytimeRow> findPlaytimeRow(UUID uuid) throws SQLException {
        if (uuid == null) {
            return Optional.empty();
        }
        if (config.mysqlEnabled() && config.useRootMcPlaytime()) {
            Optional<PlaytimeRow> row = readRootMcRow(uuid);
            if (row.isPresent()) {
                return row;
            }
        }
        long seconds = readFallbackPlaytime(uuid);
        if (seconds <= 0L && !config.mysqlEnabled()) {
            return Optional.empty();
        }
        return Optional.of(new PlaytimeRow(uuid, null, seconds));
    }

    public Optional<PlaytimeRow> findByUsername(String username) throws SQLException {
        if (username == null || username.isBlank() || !config.mysqlEnabled()) {
            return Optional.empty();
        }
        if (config.useRootMcPlaytime()) {
            Optional<PlaytimeRow> row = readRootMcRowByUsername(username.trim());
            if (row.isPresent()) {
                return row;
            }
        }
        return Optional.empty();
    }

    public List<PlaytimeRow> topPlaytime(int limit) throws SQLException {
        int capped = Math.max(1, Math.min(50, limit));
        if (!config.mysqlEnabled()) {
            return List.of();
        }
        if (config.useRootMcPlaytime()) {
            List<PlaytimeRow> rows = readTopFromTable(config.playtimeTableFqn(), true, capped);
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return readTopFromTable(config.fallbackPlaytimeTable(), false, capped);
    }

    public int rankForUuid(UUID uuid) throws SQLException {
        if (uuid == null || !config.mysqlEnabled()) {
            return -1;
        }
        Optional<PlaytimeRow> self = findPlaytimeRow(uuid);
        if (self.isEmpty()) {
            return -1;
        }
        String table = config.useRootMcPlaytime()
                ? config.playtimeTableFqn()
                : config.fallbackPlaytimeTable();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT COUNT(*) + 1 FROM " + table + " WHERE total_playtime_seconds > ?")) {
            ps.setLong(1, self.get().totalSeconds());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : -1;
            }
        } catch (SQLException ex) {
            if (isMissingTable(ex)) {
                return -1;
            }
            throw ex;
        }
    }

    private Optional<PlaytimeRow> readRootMcRow(UUID uuid) throws SQLException {
        String table = config.playtimeTableFqn();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        SELECT uuid, username, total_playtime_seconds FROM %s
                        WHERE uuid = ? LIMIT 1
                        """
                                .formatted(table))) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapPlaytimeRow(rs, true));
            }
        } catch (SQLException ex) {
            if (isMissingTable(ex)) {
                return Optional.empty();
            }
            throw ex;
        }
    }

    private Optional<PlaytimeRow> readRootMcRowByUsername(String username) throws SQLException {
        String table = config.playtimeTableFqn();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        SELECT uuid, username, total_playtime_seconds FROM %s
                        WHERE LOWER(username) = LOWER(?) LIMIT 1
                        """
                                .formatted(table))) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapPlaytimeRow(rs, true));
            }
        } catch (SQLException ex) {
            if (isMissingTable(ex)) {
                return Optional.empty();
            }
            throw ex;
        }
    }

    private List<PlaytimeRow> readTopFromTable(String table, boolean hasUsername, int limit) throws SQLException {
        String sql = hasUsername
                ? "SELECT uuid, username, total_playtime_seconds FROM " + table
                        + " ORDER BY total_playtime_seconds DESC LIMIT ?"
                : "SELECT uuid, total_playtime_seconds FROM " + table
                        + " ORDER BY total_playtime_seconds DESC LIMIT ?";
        List<PlaytimeRow> out = new ArrayList<>();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(mapPlaytimeRow(rs, hasUsername));
                }
            }
        } catch (SQLException ex) {
            if (isMissingTable(ex)) {
                return List.of();
            }
            throw ex;
        }
        return out;
    }

    private static PlaytimeRow mapPlaytimeRow(ResultSet rs, boolean hasUsername) throws SQLException {
        UUID uuid = UUID.fromString(rs.getString("uuid"));
        String username = hasUsername ? rs.getString("username") : null;
        long seconds = rs.getLong("total_playtime_seconds");
        return new PlaytimeRow(uuid, username, seconds);
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

    /** Latest vote timestamp per Votifier service name for a player. */
    public java.util.Map<String, Instant> lastVotesByService(UUID uuid) throws SQLException {
        if (!config.mysqlEnabled() || uuid == null) {
            return java.util.Map.of();
        }
        java.util.Map<String, Instant> out = new java.util.HashMap<>();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        SELECT service, MAX(voted_at) AS last_vote FROM %s
                        WHERE uuid = ?
                        GROUP BY service
                        """
                                .formatted(config.votesTable()))) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String service = rs.getString("service");
                    java.sql.Timestamp ts = rs.getTimestamp("last_vote");
                    if (service != null && !service.isBlank() && ts != null) {
                        out.put(service, ts.toInstant());
                    }
                }
            }
        }
        return out;
    }

    public Optional<Instant> lastVoteAtAny(UUID uuid) throws SQLException {
        if (!config.mysqlEnabled()) {
            return Optional.empty();
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT MAX(voted_at) AS last_vote FROM " + config.votesTable() + " WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next() && rs.getTimestamp("last_vote") != null) {
                    return Optional.of(rs.getTimestamp("last_vote").toInstant());
                }
            }
        }
        return Optional.empty();
    }

    public VoteTotals recordVote(UUID uuid, String service, double goldEarned) throws SQLException {
        if (!config.mysqlEnabled()) {
            return VoteTotals.empty();
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + config.votesTable()
                                + " (uuid, service, voted_at, gold_earned) VALUES (?, ?, NOW(), ?)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, service);
            ps.setDouble(3, Math.max(0.0, goldEarned));
            ps.executeUpdate();
        }
        return readVoteTotals(uuid);
    }

    public VoteTotals readVoteTotals(UUID uuid) throws SQLException {
        if (!config.mysqlEnabled()) {
            return VoteTotals.empty();
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT COUNT(*), COALESCE(SUM(gold_earned), 0) FROM "
                                + config.votesTable()
                                + " WHERE uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return new VoteTotals(rs.getInt(1), rs.getDouble(2));
                }
            }
        }
        return VoteTotals.empty();
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
