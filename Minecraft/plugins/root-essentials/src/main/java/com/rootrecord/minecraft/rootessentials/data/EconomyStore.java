package com.rootrecord.minecraft.rootessentials.data;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

public final class EconomyStore {

    private final MySqlSupport db;
    private final String table;
    private final double startingBalance;

    public EconomyStore(MySqlSupport db, String tablePrefix, double startingBalance) {
        this.db = db;
        this.table = tablePrefix + "economy_balances";
        this.startingBalance = startingBalance;
    }

    public void initSchema() throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "CREATE TABLE IF NOT EXISTS " + table + " (" +
                             "minecraft_uuid VARCHAR(36) PRIMARY KEY," +
                             "minecraft_username VARCHAR(32) NOT NULL," +
                             "balance DOUBLE NOT NULL DEFAULT 0," +
                             "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" +
                             ")")) {
            ps.executeUpdate();
        }
    }

    public double balance(UUID uuid, String username) throws SQLException {
        ensureRow(uuid, username);
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT balance FROM " + table + " WHERE minecraft_uuid = ? LIMIT 1")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getDouble(1) : startingBalance;
            }
        }
    }

    public boolean transfer(UUID from, String fromName, UUID to, String toName, double amount) throws SQLException {
        if (amount <= 0) return false;
        ensureRow(from, fromName);
        ensureRow(to, toName);
        try (Connection c = db.open()) {
            c.setAutoCommit(false);
            try {
                double bal;
                try (PreparedStatement s = c.prepareStatement(
                        "SELECT balance FROM " + table + " WHERE minecraft_uuid = ? FOR UPDATE")) {
                    s.setString(1, from.toString());
                    try (ResultSet rs = s.executeQuery()) {
                        bal = rs.next() ? rs.getDouble(1) : startingBalance;
                    }
                }
                if (bal < amount) {
                    c.rollback();
                    return false;
                }
                try (PreparedStatement d = c.prepareStatement(
                        "UPDATE " + table + " SET balance = balance - ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
                    d.setDouble(1, amount);
                    d.setString(2, fromName);
                    d.setString(3, from.toString());
                    d.executeUpdate();
                }
                try (PreparedStatement a = c.prepareStatement(
                        "UPDATE " + table + " SET balance = balance + ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
                    a.setDouble(1, amount);
                    a.setString(2, toName);
                    a.setString(3, to.toString());
                    a.executeUpdate();
                }
                c.commit();
                return true;
            } catch (Exception ex) {
                c.rollback();
                throw ex;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public boolean withdraw(UUID uuid, String username, double amount) throws SQLException {
        if (amount <= 0) return false;
        ensureRow(uuid, username);
        try (Connection c = db.open()) {
            c.setAutoCommit(false);
            try {
                double bal;
                try (PreparedStatement s = c.prepareStatement(
                        "SELECT balance FROM " + table + " WHERE minecraft_uuid = ? FOR UPDATE")) {
                    s.setString(1, uuid.toString());
                    try (ResultSet rs = s.executeQuery()) {
                        bal = rs.next() ? rs.getDouble(1) : startingBalance;
                    }
                }
                if (bal < amount) {
                    c.rollback();
                    return false;
                }
                try (PreparedStatement u = c.prepareStatement(
                        "UPDATE " + table + " SET balance = balance - ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
                    u.setDouble(1, amount);
                    u.setString(2, username);
                    u.setString(3, uuid.toString());
                    u.executeUpdate();
                }
                c.commit();
                return true;
            } catch (Exception ex) {
                c.rollback();
                throw ex;
            } finally {
                c.setAutoCommit(true);
            }
        }
    }

    public void deposit(UUID uuid, String username, double amount) throws SQLException {
        if (amount <= 0) return;
        ensureRow(uuid, username);
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "UPDATE " + table + " SET balance = balance + ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
            ps.setDouble(1, amount);
            ps.setString(2, username);
            ps.setString(3, uuid.toString());
            ps.executeUpdate();
        }
    }

    public void setBalance(UUID uuid, String username, double amount) throws SQLException {
        ensureRow(uuid, username);
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "UPDATE " + table + " SET balance = ?, minecraft_username = ? WHERE minecraft_uuid = ?")) {
            ps.setDouble(1, Math.max(0, amount));
            ps.setString(2, username);
            ps.setString(3, uuid.toString());
            ps.executeUpdate();
        }
    }

    public void resetBalance(UUID uuid, String username) throws SQLException {
        setBalance(uuid, username, startingBalance);
    }

    public java.util.List<BalanceRow> topBalances(int limit) throws SQLException {
        java.util.List<BalanceRow> rows = new java.util.ArrayList<>();
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "SELECT minecraft_username, balance FROM " + table + " ORDER BY balance DESC LIMIT ?")) {
            ps.setInt(1, Math.max(1, limit));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(new BalanceRow(rs.getString(1), rs.getDouble(2)));
                }
            }
        }
        return rows;
    }

    public record BalanceRow(String username, double balance) {}

    private void ensureRow(UUID uuid, String username) throws SQLException {
        try (Connection c = db.open();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO " + table + " (minecraft_uuid, minecraft_username, balance) VALUES (?, ?, ?) " +
                             "ON DUPLICATE KEY UPDATE minecraft_username = VALUES(minecraft_username)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, username == null ? "player" : username);
            ps.setDouble(3, startingBalance);
            ps.executeUpdate();
        }
    }
}
