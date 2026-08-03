package com.rootrecord.minecraft.rootgamble.store;

import com.rootrecord.minecraft.common.config.RootMcDatabaseConfig;
import com.rootrecord.minecraft.common.mysql.MysqlConnections;
import com.rootrecord.minecraft.rootgamble.RootGamblePlugin;
import org.bukkit.plugin.java.JavaPlugin;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Level;

/** Jackpot, tickets, free-play, pending challenges. */
public final class GambleStore {

    public record LottoTicket(UUID uuid, String name, int number) {}

    public record Challenge(
            long id,
            String game,
            UUID challenger,
            String challengerName,
            UUID target,
            String targetName,
            double amount,
            boolean challengerFree,
            long createdAtMs) {}

    private final JavaPlugin plugin;
    private final String stateTable;
    private final String ticketTable;
    private final String freeTable;
    private final String challengeTable;
    private volatile boolean ready;

    public GambleStore(JavaPlugin plugin, String tablePrefix) {
        this.plugin = plugin;
        String prefix = tablePrefix == null || tablePrefix.isBlank() ? "root_" : tablePrefix;
        this.stateTable = prefix + "gamble_state";
        this.ticketTable = prefix + "gamble_lotto_ticket";
        this.freeTable = prefix + "gamble_free_play";
        this.challengeTable = prefix + "gamble_challenge";
    }

    public boolean ready() {
        return ready;
    }

    public void initSchema(double startingJackpot) {
        RootMcDatabaseConfig.DatabaseSettings db = database();
        if (db == null || !db.isConfigured()) {
            plugin.getLogger().warning("Root-Gamble: MySQL not configured — lotto/free-play will not persist.");
            ready = false;
            return;
        }
        try (Connection c = MysqlConnections.open(db); Statement st = c.createStatement()) {
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      id TINYINT NOT NULL PRIMARY KEY,
                      jackpot DOUBLE NOT NULL DEFAULT 0,
                      last_drawn_mc_day_id BIGINT NOT NULL DEFAULT -1
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(stateTable));
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT IGNORE INTO " + stateTable + " (id, jackpot, last_drawn_mc_day_id) VALUES (1, ?, -1)")) {
                ps.setDouble(1, startingJackpot);
                ps.executeUpdate();
            }
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY,
                      player_uuid CHAR(36) NOT NULL,
                      player_name VARCHAR(16) NOT NULL,
                      number INT NOT NULL,
                      created_at DATETIME NOT NULL,
                      INDEX idx_lotto_num (number),
                      INDEX idx_lotto_player (player_uuid)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(ticketTable));
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      player_uuid CHAR(36) NOT NULL,
                      game_id VARCHAR(16) NOT NULL,
                      used_at DATETIME NOT NULL,
                      PRIMARY KEY (player_uuid, game_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(freeTable));
            st.executeUpdate("""
                    CREATE TABLE IF NOT EXISTS %s (
                      id BIGINT AUTO_INCREMENT PRIMARY KEY,
                      game VARCHAR(16) NOT NULL,
                      challenger_uuid CHAR(36) NOT NULL,
                      challenger_name VARCHAR(16) NOT NULL,
                      target_uuid CHAR(36) NOT NULL,
                      target_name VARCHAR(16) NOT NULL,
                      amount DOUBLE NOT NULL,
                      challenger_free TINYINT NOT NULL DEFAULT 0,
                      created_at DATETIME NOT NULL,
                      INDEX idx_chal_target (target_uuid)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """.formatted(challengeTable));
            ready = true;
            plugin.getLogger().info("Root-Gamble MySQL ready.");
        } catch (SQLException ex) {
            ready = false;
            plugin.getLogger().log(Level.SEVERE, "Root-Gamble schema failed: " + ex.getMessage());
        }
    }

    public double jackpot() {
        if (!ready) {
            return 0;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement("SELECT jackpot FROM " + stateTable + " WHERE id = 1");
                ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                return rs.getDouble(1);
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "jackpot read: " + ex.getMessage());
        }
        return 0;
    }

    public void addJackpot(double amount) {
        if (!ready || amount <= 0) {
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE " + stateTable + " SET jackpot = jackpot + ? WHERE id = 1")) {
            ps.setDouble(1, amount);
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "jackpot add: " + ex.getMessage());
        }
    }

    public void setJackpot(double amount) {
        if (!ready) {
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE " + stateTable + " SET jackpot = ? WHERE id = 1")) {
            ps.setDouble(1, Math.max(0, amount));
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "jackpot set: " + ex.getMessage());
        }
    }

    public long lastDrawnMcDayId() {
        if (!ready) {
            return -1;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT last_drawn_mc_day_id FROM " + stateTable + " WHERE id = 1");
                ResultSet rs = ps.executeQuery()) {
            if (rs.next()) {
                return rs.getLong(1);
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "lastDrawn read: " + ex.getMessage());
        }
        return -1;
    }

    public void setLastDrawnMcDayId(long dayId) {
        if (!ready) {
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "UPDATE " + stateTable + " SET last_drawn_mc_day_id = ? WHERE id = 1")) {
            ps.setLong(1, dayId);
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "lastDrawn set: " + ex.getMessage());
        }
    }

    private final java.util.Set<String> memoryFreeUsed = java.util.concurrent.ConcurrentHashMap.newKeySet();

    public boolean hasFreePlay(UUID uuid, String gameId) {
        if (uuid == null || gameId == null) {
            return false;
        }
        if (!ready) {
            return !memoryFreeUsed.contains(uuid + ":" + gameId);
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT 1 FROM " + freeTable + " WHERE player_uuid = ? AND game_id = ?")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, gameId);
            try (ResultSet rs = ps.executeQuery()) {
                return !rs.next();
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "freePlay check: " + ex.getMessage());
            return false;
        }
    }

    public void markFreeUsed(UUID uuid, String gameId) {
        if (uuid == null || gameId == null) {
            return;
        }
        if (!ready) {
            memoryFreeUsed.add(uuid + ":" + gameId);
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "INSERT IGNORE INTO " + freeTable + " (player_uuid, game_id, used_at) VALUES (?,?,?)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, gameId);
            ps.setTimestamp(3, Timestamp.from(Instant.now()));
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "freePlay mark: " + ex.getMessage());
        }
    }

    /** Restore free-play eligibility (same as first unused free) by clearing the used row. */
    public void clearFreeUsed(UUID uuid, String gameId) {
        if (uuid == null || gameId == null) {
            return;
        }
        if (!ready) {
            memoryFreeUsed.remove(uuid + ":" + gameId);
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "DELETE FROM " + freeTable + " WHERE player_uuid = ? AND game_id = ?")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, gameId);
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "freePlay clear: " + ex.getMessage());
        }
    }

    public int ticketCount(UUID uuid) {
        if (!ready || uuid == null) {
            return 0;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT COUNT(*) FROM " + ticketTable + " WHERE player_uuid = ?")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        } catch (SQLException ex) {
            return 0;
        }
    }

    public String ticketsSummary(UUID uuid) {
        if (!ready || uuid == null) {
            return "none";
        }
        List<Integer> nums = new ArrayList<>();
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT number FROM " + ticketTable + " WHERE player_uuid = ? ORDER BY id ASC LIMIT 40")) {
            ps.setString(1, uuid.toString());
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    nums.add(rs.getInt(1));
                }
            }
        } catch (SQLException ex) {
            return "none";
        }
        if (nums.isEmpty()) {
            return "none";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < nums.size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(nums.get(i));
        }
        return sb.toString();
    }

    public void addTicket(UUID uuid, String name, int number) {
        if (!ready) {
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + ticketTable
                                + " (player_uuid, player_name, number, created_at) VALUES (?,?,?,?)")) {
            ps.setString(1, uuid.toString());
            ps.setString(2, name == null ? "player" : name);
            ps.setInt(3, number);
            ps.setTimestamp(4, Timestamp.from(Instant.now()));
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "ticket add: " + ex.getMessage());
        }
    }

    public List<LottoTicket> ticketsForNumber(int number) {
        List<LottoTicket> out = new ArrayList<>();
        if (!ready) {
            return out;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT player_uuid, player_name, number FROM " + ticketTable + " WHERE number = ?")) {
            ps.setInt(1, number);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(new LottoTicket(
                            UUID.fromString(rs.getString(1)),
                            rs.getString(2),
                            rs.getInt(3)));
                }
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "ticketsForNumber: " + ex.getMessage());
        }
        return out;
    }

    public void clearTickets() {
        if (!ready) {
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                Statement st = c.createStatement()) {
            st.executeUpdate("DELETE FROM " + ticketTable);
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "clearTickets: " + ex.getMessage());
        }
    }

    private final java.util.concurrent.atomic.AtomicLong memoryChallengeSeq =
            new java.util.concurrent.atomic.AtomicLong(0);
    private final java.util.Map<UUID, Challenge> memoryChallengesByTarget =
            new java.util.concurrent.ConcurrentHashMap<>();

    public long createChallenge(
            String game,
            UUID challenger,
            String challengerName,
            UUID target,
            String targetName,
            double amount,
            boolean challengerFree) {
        if (!ready) {
            long id = memoryChallengeSeq.incrementAndGet();
            Challenge ch = new Challenge(
                    id,
                    game,
                    challenger,
                    challengerName,
                    target,
                    targetName,
                    amount,
                    challengerFree,
                    System.currentTimeMillis());
            memoryChallengesByTarget.put(target, ch);
            return id;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO " + challengeTable
                                + " (game, challenger_uuid, challenger_name, target_uuid, target_name, amount, challenger_free, created_at)"
                                + " VALUES (?,?,?,?,?,?,?,?)",
                        Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, game);
            ps.setString(2, challenger.toString());
            ps.setString(3, challengerName);
            ps.setString(4, target.toString());
            ps.setString(5, targetName);
            ps.setDouble(6, amount);
            ps.setInt(7, challengerFree ? 1 : 0);
            ps.setTimestamp(8, Timestamp.from(Instant.now()));
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) {
                    return keys.getLong(1);
                }
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "createChallenge: " + ex.getMessage());
        }
        return -1;
    }

    public Challenge pendingForTarget(UUID target) {
        if (target == null) {
            return null;
        }
        if (!ready) {
            return memoryChallengesByTarget.get(target);
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement(
                        "SELECT id, game, challenger_uuid, challenger_name, target_uuid, target_name, amount, challenger_free, created_at"
                                + " FROM " + challengeTable + " WHERE target_uuid = ? ORDER BY id DESC LIMIT 1")) {
            ps.setString(1, target.toString());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    return null;
                }
                Timestamp ts = rs.getTimestamp(9);
                return new Challenge(
                        rs.getLong(1),
                        rs.getString(2),
                        UUID.fromString(rs.getString(3)),
                        rs.getString(4),
                        UUID.fromString(rs.getString(5)),
                        rs.getString(6),
                        rs.getDouble(7),
                        rs.getInt(8) == 1,
                        ts != null ? ts.getTime() : 0L);
            }
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "pendingForTarget: " + ex.getMessage());
            return null;
        }
    }

    public void deleteChallenge(long id) {
        if (id <= 0) {
            return;
        }
        if (!ready) {
            memoryChallengesByTarget.entrySet().removeIf(e -> e.getValue().id() == id);
            return;
        }
        try (Connection c = MysqlConnections.open(database());
                PreparedStatement ps = c.prepareStatement("DELETE FROM " + challengeTable + " WHERE id = ?")) {
            ps.setLong(1, id);
            ps.executeUpdate();
        } catch (SQLException ex) {
            plugin.getLogger().log(Level.WARNING, "deleteChallenge: " + ex.getMessage());
        }
    }

    private RootMcDatabaseConfig.DatabaseSettings database() {
        if (plugin instanceof RootGamblePlugin gamble) {
            return RootMcDatabaseConfig.resolve(plugin, gamble.yaml().config());
        }
        return RootMcDatabaseConfig.resolve(plugin, null);
    }
}
