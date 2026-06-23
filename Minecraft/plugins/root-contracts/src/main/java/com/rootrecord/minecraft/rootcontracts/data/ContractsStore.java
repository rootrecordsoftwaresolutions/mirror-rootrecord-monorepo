package com.rootrecord.minecraft.rootcontracts.data;

import com.rootrecord.minecraft.rootcontracts.config.ContractsConfig;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ContractsStore {

    public enum Status {
        OFFERED, ACTIVE, COMPLETED, CANCELLED
    }

    private final ContractsConfig config;

    public ContractsStore(ContractsConfig config) {
        this.config = config;
    }

    public void initSchema() throws SQLException {
        if (!config.mysqlEnabled()) {
            return;
        }
        try (Connection c = open(); Statement st = c.createStatement()) {
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      id CHAR(8) PRIMARY KEY,
                      client_uuid CHAR(36) NOT NULL,
                      client_username VARCHAR(32) NOT NULL,
                      worker_uuid CHAR(36) NOT NULL,
                      worker_username VARCHAR(32) NOT NULL,
                      amount DOUBLE NOT NULL,
                      terms VARCHAR(512) NOT NULL,
                      status VARCHAR(16) NOT NULL,
                      created_at DATETIME NOT NULL,
                      accepted_at DATETIME,
                      closed_at DATETIME
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(config.contractsTable()));
        }
    }

    public int countOpenFor(UUID uuid) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT COUNT(*) FROM " + config.contractsTable()
                                + " WHERE status IN ('OFFERED','ACTIVE') AND (client_uuid = ? OR worker_uuid = ?)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    public void insert(ContractRow row) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + config.contractsTable()
                                + " (id, client_uuid, client_username, worker_uuid, worker_username, amount, terms, status, created_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")) {
            ps.setString(1, row.id());
            ps.setString(2, row.clientUuid().toString());
            ps.setString(3, row.clientUsername());
            ps.setString(4, row.workerUuid().toString());
            ps.setString(5, row.workerUsername());
            ps.setDouble(6, row.amount());
            ps.setString(7, row.terms());
            ps.setString(8, row.status().name());
            ps.setTimestamp(9, Timestamp.from(row.createdAt()));
            ps.executeUpdate();
        }
    }

    public Optional<ContractRow> findById(String id) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT id, client_uuid, client_username, worker_uuid, worker_username, amount, terms, status, created_at, accepted_at, closed_at FROM "
                                + config.contractsTable() + " WHERE id = ? LIMIT 1")) {
            ps.setString(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return Optional.empty();
                }
                return Optional.of(mapRow(rs));
            }
        }
    }

    public List<ContractRow> listOpenFor(UUID uuid) throws SQLException {
        List<ContractRow> rows = new ArrayList<>();
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "SELECT id, client_uuid, client_username, worker_uuid, worker_username, amount, terms, status, created_at, accepted_at, closed_at FROM "
                                + config.contractsTable()
                                + " WHERE status IN ('OFFERED','ACTIVE') AND (client_uuid = ? OR worker_uuid = ?) ORDER BY created_at DESC LIMIT 20")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    rows.add(mapRow(rs));
                }
            }
        }
        return rows;
    }

    public boolean accept(String id) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE " + config.contractsTable()
                                + " SET status = 'ACTIVE', accepted_at = ? WHERE id = ? AND status = 'OFFERED'")) {
            ps.setTimestamp(1, Timestamp.from(Instant.now()));
            ps.setString(2, id);
            return ps.executeUpdate() > 0;
        }
    }

    public boolean close(String id, ContractsStore.Status from, ContractsStore.Status to) throws SQLException {
        try (Connection c = open();
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE " + config.contractsTable()
                                + " SET status = ?, closed_at = ? WHERE id = ? AND status = ?")) {
            ps.setString(1, to.name());
            ps.setTimestamp(2, Timestamp.from(Instant.now()));
            ps.setString(3, id);
            ps.setString(4, from.name());
            return ps.executeUpdate() > 0;
        }
    }

    public boolean cancelOffered(String id) throws SQLException {
        return close(id, Status.OFFERED, Status.CANCELLED);
    }

    public boolean complete(String id) throws SQLException {
        return close(id, Status.ACTIVE, Status.COMPLETED);
    }

    private ContractRow mapRow(ResultSet rs) throws SQLException {
        return new ContractRow(
                rs.getString("id"),
                UUID.fromString(rs.getString("client_uuid")),
                rs.getString("client_username"),
                UUID.fromString(rs.getString("worker_uuid")),
                rs.getString("worker_username"),
                rs.getDouble("amount"),
                rs.getString("terms"),
                Status.valueOf(rs.getString("status")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("accepted_at") != null ? rs.getTimestamp("accepted_at").toInstant() : null,
                rs.getTimestamp("closed_at") != null ? rs.getTimestamp("closed_at").toInstant() : null);
    }

    private Connection open() throws SQLException {
        if (!config.mysqlEnabled()) {
            throw new SQLException("MySQL disabled in root-contracts.yml");
        }
        if (config.mysqlHost().isBlank()) {
            throw new SQLException("mysql.host not configured in root-contracts.yml");
        }
        String url = "jdbc:mysql://" + config.mysqlHost() + ":" + config.mysqlPort() + "/" + config.mysqlDatabase()
                + "?" + config.mysqlJdbcParams();
        return DriverManager.getConnection(url, config.mysqlUsername(), config.mysqlPassword());
    }

    public record ContractRow(
            String id,
            UUID clientUuid,
            String clientUsername,
            UUID workerUuid,
            String workerUsername,
            double amount,
            String terms,
            Status status,
            Instant createdAt,
            Instant acceptedAt,
            Instant closedAt) {}
}
