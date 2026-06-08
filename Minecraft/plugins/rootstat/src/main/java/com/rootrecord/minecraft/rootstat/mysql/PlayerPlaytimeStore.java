package com.rootrecord.minecraft.rootstat.mysql;

import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.model.PlayerPlaytimeRecord;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

public final class PlayerPlaytimeStore {

    private final RootStatConfig config;
    private final Supplier<Connection> connectionSupplier;

    public PlayerPlaytimeStore(RootStatConfig config, Supplier<Connection> connectionSupplier) {
        this.config = config;
        this.connectionSupplier = connectionSupplier;
    }

    public void initSchema() throws SQLException {
        String table = config.playtimeTable();
        try (Connection c = connectionSupplier.get();
                PreparedStatement ps = c.prepareStatement(
                        """
                        CREATE TABLE IF NOT EXISTS %s (
                          uuid CHAR(36) PRIMARY KEY,
                          username VARCHAR(16) NOT NULL,
                          total_playtime_seconds BIGINT NOT NULL DEFAULT 0,
                          first_join_at DATETIME NOT NULL,
                          last_login_at DATETIME NOT NULL,
                          updated_at DATETIME NOT NULL,
                          INDEX idx_playtime_username (username)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                        """
                                .formatted(table))) {
            ps.executeUpdate();
        }
    }

    public void recordLogin(UUID uuid, String username) throws SQLException {
        String table = config.playtimeTable();
        Timestamp now = Timestamp.from(Instant.now());
        try (Connection c = connectionSupplier.get();
                PreparedStatement ps = c.prepareStatement(
                        """
                        INSERT INTO %s (uuid, username, total_playtime_seconds, first_join_at, last_login_at, updated_at)
                        VALUES (?, ?, 0, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                          username = VALUES(username),
                          last_login_at = VALUES(last_login_at),
                          updated_at = VALUES(updated_at)
                        """
                                .formatted(table))) {
            ps.setString(1, uuid.toString());
            ps.setString(2, username == null ? "Unknown" : username);
            ps.setTimestamp(3, now);
            ps.setTimestamp(4, now);
            ps.setTimestamp(5, now);
            ps.executeUpdate();
        }
    }

    public void addSession(UUID uuid, long sessionSeconds) throws SQLException {
        if (sessionSeconds <= 0) {
            return;
        }
        String table = config.playtimeTable();
        Timestamp now = Timestamp.from(Instant.now());
        try (Connection c = connectionSupplier.get();
                PreparedStatement ps = c.prepareStatement(
                        """
                        UPDATE %s
                        SET total_playtime_seconds = total_playtime_seconds + ?,
                            updated_at = ?
                        WHERE uuid = ?
                        """
                                .formatted(table))) {
            ps.setLong(1, sessionSeconds);
            ps.setTimestamp(2, now);
            ps.setString(3, uuid.toString());
            ps.executeUpdate();
        }
    }

    public List<PlayerPlaytimeRecord> readAll() throws SQLException {
        String table = config.playtimeTable();
        List<PlayerPlaytimeRecord> out = new ArrayList<>();
        try (Connection c = connectionSupplier.get();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT uuid, username, total_playtime_seconds, first_join_at, last_login_at FROM "
                                + table);
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                out.add(
                        new PlayerPlaytimeRecord(
                                rs.getString("uuid"),
                                rs.getString("username"),
                                rs.getLong("total_playtime_seconds"),
                                toIso(rs.getTimestamp("first_join_at")),
                                toIso(rs.getTimestamp("last_login_at"))));
            }
        }
        return out;
    }

    public Optional<PlayerPlaytimeRecord> findByUuid(UUID uuid) throws SQLException {
        String table = config.playtimeTable();
        try (Connection c = connectionSupplier.get();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT uuid, username, total_playtime_seconds, first_join_at, last_login_at FROM "
                                + table
                                + " WHERE uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(
                        new PlayerPlaytimeRecord(
                                rs.getString("uuid"),
                                rs.getString("username"),
                                rs.getLong("total_playtime_seconds"),
                                toIso(rs.getTimestamp("first_join_at")),
                                toIso(rs.getTimestamp("last_login_at"))));
            }
        }
    }

    private static String toIso(Timestamp ts) {
        return ts == null ? null : ts.toInstant().toString();
    }
}
