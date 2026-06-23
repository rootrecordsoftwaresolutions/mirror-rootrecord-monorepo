package com.rootrecord.minecraft.rootessentials.data;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class ModerationStore {

    public record Punishment(String username, String reason, String actor, Instant expiresAt) {}

    private final MySqlSupport db;
    private final String bans;
    private final String mutes;

    public ModerationStore(MySqlSupport db, String tablePrefix) {
        this.db = db;
        this.bans = tablePrefix + "bans";
        this.mutes = tablePrefix + "mutes";
    }

    public void initSchema() throws SQLException {
        try (Connection c = db.open()) {
            try (PreparedStatement ps = c.prepareStatement(
                    "CREATE TABLE IF NOT EXISTS " + bans + " (" +
                            "minecraft_uuid VARCHAR(36) PRIMARY KEY," +
                            "minecraft_username VARCHAR(32) NOT NULL," +
                            "reason VARCHAR(255) NOT NULL," +
                            "banned_by VARCHAR(32) NOT NULL," +
                            "expires_at TIMESTAMP NULL," +
                            "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                            ")")) {
                ps.executeUpdate();
            }
            try (PreparedStatement ps = c.prepareStatement(
                    "CREATE TABLE IF NOT EXISTS " + mutes + " (" +
                            "minecraft_uuid VARCHAR(36) PRIMARY KEY," +
                            "minecraft_username VARCHAR(32) NOT NULL," +
                            "reason VARCHAR(255) NOT NULL," +
                            "muted_by VARCHAR(32) NOT NULL," +
                            "expires_at TIMESTAMP NULL," +
                            "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                            ")")) {
                ps.executeUpdate();
            }
        }
    }

    public void ban(UUID uuid, String username, String reason, String actor, Instant expiresAt) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO " + bans + " (minecraft_uuid, minecraft_username, reason, banned_by, expires_at) VALUES (?, ?, ?, ?, ?) " +
                             "ON DUPLICATE KEY UPDATE minecraft_username=VALUES(minecraft_username), reason=VALUES(reason), banned_by=VALUES(banned_by), expires_at=VALUES(expires_at)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, username);
            ps.setString(3, reason);
            ps.setString(4, actor);
            ps.setTimestamp(5, expiresAt == null ? null : Timestamp.from(expiresAt));
            ps.executeUpdate();
        }
    }

    public void unban(UUID uuid) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement("DELETE FROM " + bans + " WHERE minecraft_uuid = ?")) {
            ps.setString(1, uuid.toString());
            ps.executeUpdate();
        }
    }

    public Optional<Punishment> activeBan(UUID uuid) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT minecraft_username, reason, banned_by, expires_at FROM " + bans + " WHERE minecraft_uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                Instant expires = rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant();
                if (expires != null && expires.isBefore(Instant.now())) {
                    unban(uuid);
                    return Optional.empty();
                }
                return Optional.of(new Punishment(
                        rs.getString("minecraft_username"),
                        rs.getString("reason"),
                        rs.getString("banned_by"),
                        expires));
            }
        }
    }

    public void mute(UUID uuid, String username, String reason, String actor, Instant expiresAt) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO " + mutes + " (minecraft_uuid, minecraft_username, reason, muted_by, expires_at) VALUES (?, ?, ?, ?, ?) " +
                             "ON DUPLICATE KEY UPDATE minecraft_username=VALUES(minecraft_username), reason=VALUES(reason), muted_by=VALUES(muted_by), expires_at=VALUES(expires_at)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, username);
            ps.setString(3, reason);
            ps.setString(4, actor);
            ps.setTimestamp(5, expiresAt == null ? null : Timestamp.from(expiresAt));
            ps.executeUpdate();
        }
    }

    public void unmute(UUID uuid) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement("DELETE FROM " + mutes + " WHERE minecraft_uuid = ?")) {
            ps.setString(1, uuid.toString());
            ps.executeUpdate();
        }
    }

    public Optional<Punishment> activeMute(UUID uuid) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT minecraft_username, reason, muted_by, expires_at FROM " + mutes + " WHERE minecraft_uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                Instant expires = rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toInstant();
                if (expires != null && expires.isBefore(Instant.now())) {
                    unmute(uuid);
                    return Optional.empty();
                }
                return Optional.of(new Punishment(
                        rs.getString("minecraft_username"),
                        rs.getString("reason"),
                        rs.getString("muted_by"),
                        expires));
            }
        }
    }
}
