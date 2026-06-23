package com.rootrecord.minecraft.rootstat.mysql;

import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.economy.EconomySnapshot;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;

/** Local MySQL cache for Root Shops listings and average prices. */
public final class RootShopsStore {

    private final RootStatConfig config;
    private final HikariConnectionSupplier connections;

    public RootShopsStore(RootStatConfig config, HikariConnectionSupplier connections) {
        this.config = config;
        this.connections = connections;
    }

    public void initSchema() throws SQLException {
        String listings = listingsTable();
        String averages = averagesTable();
        try (Connection c = connections.getConnection();
                PreparedStatement listingsPs = c.prepareStatement(
                        """
                        CREATE TABLE IF NOT EXISTS %s (
                          shop_id VARCHAR(96) PRIMARY KEY,
                          owner_uuid CHAR(36) NULL,
                          owner_username VARCHAR(16) NULL,
                          world_name VARCHAR(64) NOT NULL,
                          x INT NOT NULL,
                          y INT NOT NULL,
                          z INT NOT NULL,
                          item_key VARCHAR(64) NOT NULL,
                          price DOUBLE NOT NULL,
                          listing_type VARCHAR(16) NOT NULL DEFAULT 'sell',
                          synced_at DATETIME NOT NULL,
                          INDEX idx_rootshops_owner (owner_uuid),
                          INDEX idx_rootshops_item (item_key)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                        """
                                .formatted(listings));
                PreparedStatement averagesPs = c.prepareStatement(
                        """
                        CREATE TABLE IF NOT EXISTS %s (
                          item_key VARCHAR(64) PRIMARY KEY,
                          avg_price DOUBLE NOT NULL,
                          sample_count INT NOT NULL DEFAULT 0,
                          updated_at DATETIME NOT NULL
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                        """
                                .formatted(averages))) {
            listingsPs.executeUpdate();
            averagesPs.executeUpdate();
        }
    }

    public void replaceSnapshot(EconomySnapshot snapshot) throws SQLException {
        if (snapshot == null) {
            return;
        }
        String listings = listingsTable();
        String averages = averagesTable();
        try (Connection c = connections.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement clear = c.prepareStatement("DELETE FROM " + listings)) {
                clear.executeUpdate();
            }
            try (PreparedStatement insert = c.prepareStatement(
                    """
                    INSERT INTO %s
                      (shop_id, owner_uuid, owner_username, world_name, x, y, z, item_key, price, listing_type, synced_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                    """
                            .formatted(listings))) {
                for (EconomySnapshot.ShopListingRow row : snapshot.shopListings()) {
                    insert.setString(1, row.shopId());
                    insert.setString(2, row.ownerUuid());
                    insert.setString(3, row.ownerUsername());
                    insert.setString(4, row.worldName());
                    insert.setInt(5, row.x());
                    insert.setInt(6, row.y());
                    insert.setInt(7, row.z());
                    insert.setString(8, row.itemKey());
                    insert.setDouble(9, row.price());
                    insert.setString(10, row.listingType());
                    insert.addBatch();
                }
                insert.executeBatch();
            }
            try (PreparedStatement clearAvg = c.prepareStatement("DELETE FROM " + averages)) {
                clearAvg.executeUpdate();
            }
            try (PreparedStatement insertAvg = c.prepareStatement(
                    """
                    INSERT INTO %s (item_key, avg_price, sample_count, updated_at)
                    VALUES (?, ?, ?, NOW())
                    """
                            .formatted(averages))) {
                for (EconomySnapshot.ShopPriceRow row : snapshot.shopPrices()) {
                    if (row.prices().isEmpty()) {
                        continue;
                    }
                    double sum = 0;
                    for (double price : row.prices()) {
                        sum += price;
                    }
                    insertAvg.setString(1, row.itemKey());
                    insertAvg.setDouble(2, sum / row.prices().size());
                    insertAvg.setInt(3, row.prices().size());
                    insertAvg.addBatch();
                }
                insertAvg.executeBatch();
            }
            c.commit();
        }
    }

    private String listingsTable() {
        return config.mysqlTablePrefix() + "rootstat_shop_listings";
    }

    private String averagesTable() {
        return config.mysqlTablePrefix() + "rootstat_shop_price_avg";
    }

    @FunctionalInterface
    public interface HikariConnectionSupplier {
        Connection getConnection() throws SQLException;
    }
}
