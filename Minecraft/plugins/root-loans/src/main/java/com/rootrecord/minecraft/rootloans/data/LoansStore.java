package com.rootrecord.minecraft.rootloans.data;

import com.rootrecord.minecraft.rootloans.config.LoansConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class LoansStore {

    private final LoansConfig config;

    public LoansStore(LoansConfig config) {
        this.config = config;
    }

    public void initSchema() throws SQLException {
        if (!config.mysqlEnabled()) {
            return;
        }
        try (Connection c = open(); Statement st = c.createStatement()) {
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      minecraft_uuid CHAR(36) PRIMARY KEY,
                      minecraft_username VARCHAR(32) NOT NULL,
                      principal DOUBLE NOT NULL,
                      amount_owed DOUBLE NOT NULL,
                      taken_at DATETIME NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(config.activeTable()));
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      minecraft_uuid CHAR(36) PRIMARY KEY,
                      max_loan DOUBLE NOT NULL,
                      successful_repayments INT NOT NULL DEFAULT 0,
                      updated_at DATETIME NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(config.creditTable()));
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY,
                      minecraft_uuid CHAR(36) NOT NULL,
                      taken_at DATETIME NOT NULL,
                      INDEX idx_loans_take_uuid_time (minecraft_uuid, taken_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(config.takeLogTable()));
        }
    }

    public Optional<ActiveLoan> findActive(UUID uuid) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT minecraft_username, principal, amount_owed, taken_at FROM "
                                + config.activeTable() + " WHERE minecraft_uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(new ActiveLoan(
                        uuid,
                        rs.getString("minecraft_username"),
                        rs.getDouble("principal"),
                        rs.getDouble("amount_owed"),
                        rs.getTimestamp("taken_at").toInstant()));
            }
        }
    }

    public double maxLoan(UUID uuid) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT max_loan FROM " + config.creditTable() + " WHERE minecraft_uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getDouble("max_loan");
                }
            }
        }
        return config.startingMaxLoan();
    }

    public int countTakesInRolling24h(UUID uuid) throws SQLException {
        Instant cutoff = Instant.now().minus(24, ChronoUnit.HOURS);
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT COUNT(*) FROM " + config.takeLogTable()
                                + " WHERE minecraft_uuid = ? AND taken_at >= ?")) {
            ps.setString(1, uuid.toString());
            ps.setTimestamp(2, Timestamp.from(cutoff));
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    public Optional<Instant> oldestTakeInRolling24h(UUID uuid) throws SQLException {
        Instant cutoff = Instant.now().minus(24, ChronoUnit.HOURS);
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT taken_at FROM " + config.takeLogTable()
                                + " WHERE minecraft_uuid = ? AND taken_at >= ? ORDER BY taken_at ASC LIMIT 1")) {
            ps.setString(1, uuid.toString());
            ps.setTimestamp(2, Timestamp.from(cutoff));
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(rs.getTimestamp(1).toInstant());
                }
            }
        }
        return Optional.empty();
    }

    public void createLoan(UUID uuid, String username, double principal, double amountOwed) throws SQLException {
        Instant now = Instant.now();
        try (Connection c = open()) {
            c.setAutoCommit(false);
            try {
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + config.activeTable()
                                + " (minecraft_uuid, minecraft_username, principal, amount_owed, taken_at) "
                                + "VALUES (?, ?, ?, ?, ?)")) {
                    ps.setString(1, uuid.toString());
                    ps.setString(2, username);
                    ps.setDouble(3, principal);
                    ps.setDouble(4, amountOwed);
                    ps.setTimestamp(5, Timestamp.from(now));
                    ps.executeUpdate();
                }
                try (PreparedStatement log = c.prepareStatement(
                        "INSERT INTO " + config.takeLogTable() + " (minecraft_uuid, taken_at) VALUES (?, ?)")) {
                    log.setString(1, uuid.toString());
                    log.setTimestamp(2, Timestamp.from(now));
                    log.executeUpdate();
                }
                ensureCreditRow(c, uuid);
                c.commit();
            } catch (Exception ex) {
                c.rollback();
                throw ex;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public RepayResult repay(UUID uuid, String username, double payment) throws SQLException {
        if (payment <= 0) {
            return new RepayResult(0, Optional.empty());
        }
        try (Connection c = open()) {
            c.setAutoCommit(false);
            try {
                ActiveLoan loan;
                try (PreparedStatement s = c.prepareStatement(
                        "SELECT minecraft_username, principal, amount_owed, taken_at FROM "
                                + config.activeTable() + " WHERE minecraft_uuid = ? FOR UPDATE")) {
                    s.setString(1, uuid.toString());
                    try (ResultSet rs = s.executeQuery()) {
                        if (!rs.next()) {
                            c.rollback();
                            return new RepayResult(0, Optional.empty());
                        }
                        loan = new ActiveLoan(
                                uuid,
                                rs.getString("minecraft_username"),
                                rs.getDouble("principal"),
                                rs.getDouble("amount_owed"),
                                rs.getTimestamp("taken_at").toInstant());
                    }
                }
                double applied = Math.min(payment, loan.amountOwed());
                double remaining = loan.amountOwed() - applied;
                if (remaining <= 0.0001d) {
                    try (PreparedStatement del = c.prepareStatement(
                            "DELETE FROM " + config.activeTable() + " WHERE minecraft_uuid = ?")) {
                        del.setString(1, uuid.toString());
                        del.executeUpdate();
                    }
                    double newMax = bumpCreditAfterRepayment(c, uuid);
                    c.commit();
                    return new RepayResult(applied, Optional.of(new PayoffResult(newMax)));
                }
                try (PreparedStatement u = c.prepareStatement(
                        "UPDATE " + config.activeTable()
                                + " SET amount_owed = ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
                    u.setDouble(1, remaining);
                    u.setString(2, username);
                    u.setString(3, uuid.toString());
                    u.executeUpdate();
                }
                c.commit();
                return new RepayResult(applied, Optional.empty());
            } catch (Exception ex) {
                c.rollback();
                throw ex;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public List<ActiveLoan> listActive() throws SQLException {
        List<ActiveLoan> rows = new ArrayList<>();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT minecraft_uuid, minecraft_username, principal, amount_owed, taken_at FROM "
                                + config.activeTable() + " ORDER BY amount_owed DESC");
                ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                rows.add(new ActiveLoan(
                        UUID.fromString(rs.getString("minecraft_uuid")),
                        rs.getString("minecraft_username"),
                        rs.getDouble("principal"),
                        rs.getDouble("amount_owed"),
                        rs.getTimestamp("taken_at").toInstant()));
            }
        }
        return rows;
    }

    private double bumpCreditAfterRepayment(Connection c, UUID uuid) throws SQLException {
        ensureCreditRow(c, uuid);
        double currentMax = config.startingMaxLoan();
        int repayments = 0;
        try (PreparedStatement s = c.prepareStatement(
                "SELECT max_loan, successful_repayments FROM " + config.creditTable()
                        + " WHERE minecraft_uuid = ? FOR UPDATE")) {
            s.setString(1, uuid.toString());
            try (ResultSet rs = s.executeQuery()) {
                if (rs.next()) {
                    currentMax = rs.getDouble("max_loan");
                    repayments = rs.getInt("successful_repayments");
                }
            }
        }
        double newMax = Math.min(config.hardCap(), currentMax * config.maxLoanMultiplier());
        try (PreparedStatement u = c.prepareStatement(
                "UPDATE " + config.creditTable()
                        + " SET max_loan = ?, successful_repayments = ?, updated_at = ? WHERE minecraft_uuid = ?")) {
            u.setDouble(1, newMax);
            u.setInt(2, repayments + 1);
            u.setTimestamp(3, Timestamp.from(Instant.now()));
            u.setString(4, uuid.toString());
            u.executeUpdate();
        }
        return newMax;
    }

    private void ensureCreditRow(Connection c, UUID uuid) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO " + config.creditTable()
                        + " (minecraft_uuid, max_loan, successful_repayments, updated_at) VALUES (?, ?, 0, ?) "
                        + "ON DUPLICATE KEY UPDATE minecraft_uuid = minecraft_uuid")) {
            ps.setString(1, uuid.toString());
            ps.setDouble(2, config.startingMaxLoan());
            ps.setTimestamp(3, Timestamp.from(Instant.now()));
            ps.executeUpdate();
        }
    }

    private Connection open() throws SQLException {
        if (!config.mysqlEnabled()) {
            throw new SQLException("MySQL disabled in root-loans.yml");
        }
        String host = config.mysqlHost();
        if (host.isBlank()) {
            throw new SQLException("mysql.host not configured in root-loans.yml");
        }
        String url = "jdbc:mysql://" + host + ":" + config.mysqlPort() + "/" + config.mysqlDatabase()
                + "?" + config.mysqlJdbcParams();
        return DriverManager.getConnection(url, config.mysqlUsername(), config.mysqlPassword());
    }

    public record ActiveLoan(UUID uuid, String username, double principal, double amountOwed, Instant takenAt) {}

    public record RepayResult(double applied, Optional<PayoffResult> payoff) {}

    public record PayoffResult(double newMaxLoan) {}
}
