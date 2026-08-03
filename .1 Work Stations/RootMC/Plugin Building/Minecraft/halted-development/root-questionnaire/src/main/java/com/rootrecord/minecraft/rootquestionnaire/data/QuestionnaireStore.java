package com.rootrecord.minecraft.rootquestionnaire.data;

import com.rootrecord.minecraft.rootquestionnaire.config.QuestionnaireConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class QuestionnaireStore {

    private final QuestionnaireConfig config;

    public QuestionnaireStore(QuestionnaireConfig config) {
        this.config = config;
    }

    public void initSchema() throws SQLException {
        if (!config.mysqlConfigured()) {
            return;
        }
        try (Connection c = open(); Statement st = c.createStatement()) {
            st.executeUpdate(
                    """
                    CREATE TABLE IF NOT EXISTS %s (
                      uuid CHAR(36) PRIMARY KEY,
                      username VARCHAR(32) NOT NULL,
                      answers_json MEDIUMTEXT NOT NULL,
                      completed_at DATETIME NOT NULL,
                      reward_amount DOUBLE NOT NULL,
                      reward_paid TINYINT(1) NOT NULL DEFAULT 0
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """
                            .formatted(config.completionsTable()));
        }
    }

    public boolean isCompleted(UUID uuid) throws SQLException {
        if (!config.mysqlConfigured()) {
            return false;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT 1 FROM " + config.completionsTable() + " WHERE uuid = ? AND reward_paid = 1 LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    public Optional<CompletionRow> findCompletion(UUID uuid) throws SQLException {
        if (!config.mysqlConfigured()) {
            return Optional.empty();
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT username, answers_json, completed_at, reward_amount, reward_paid FROM "
                                + config.completionsTable() + " WHERE uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(new CompletionRow(
                        uuid,
                        rs.getString("username"),
                        rs.getString("answers_json"),
                        rs.getTimestamp("completed_at").toInstant(),
                        rs.getDouble("reward_amount"),
                        rs.getInt("reward_paid") == 1));
            }
        }
    }

    public void saveCompletion(
            UUID uuid,
            String username,
            String answersJson,
            double rewardAmount,
            boolean rewardPaid) throws SQLException {
        if (!config.mysqlConfigured()) {
            throw new SQLException("MySQL not configured");
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        """
                        INSERT INTO %s (uuid, username, answers_json, completed_at, reward_amount, reward_paid)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                          username = VALUES(username),
                          answers_json = VALUES(answers_json),
                          completed_at = VALUES(completed_at),
                          reward_amount = VALUES(reward_amount),
                          reward_paid = VALUES(reward_paid)
                        """
                                .formatted(config.completionsTable()))) {
            ps.setString(1, uuid.toString());
            ps.setString(2, username);
            ps.setString(3, answersJson);
            ps.setTimestamp(4, Timestamp.from(Instant.now()));
            ps.setDouble(5, rewardAmount);
            ps.setInt(6, rewardPaid ? 1 : 0);
            ps.executeUpdate();
        }
    }

    public long readTotalPlaytimeSeconds(UUID uuid) throws SQLException {
        if (!config.mysqlConfigured()) {
            return 0L;
        }
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT total_playtime_seconds FROM " + config.playtimeTableFqn() + " WHERE uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return 0L;
                }
                return rs.getLong("total_playtime_seconds");
            }
        }
    }

    private Connection open() throws SQLException {
        return DriverManager.getConnection(
                config.jdbcUrl(), config.mysqlUsername(), config.mysqlPassword());
    }

    public record CompletionRow(
            UUID uuid,
            String username,
            String answersJson,
            Instant completedAt,
            double rewardAmount,
            boolean rewardPaid) {}
}
