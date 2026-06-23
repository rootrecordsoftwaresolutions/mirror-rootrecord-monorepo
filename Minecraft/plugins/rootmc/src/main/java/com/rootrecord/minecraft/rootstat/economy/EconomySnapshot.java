package com.rootrecord.minecraft.rootstat.economy;

import java.util.Collections;
import java.util.List;
import java.util.Map;

public record EconomySnapshot(
        List<ShopPriceRow> shopPrices,
        List<ShopListingRow> shopListings,
        List<BalanceRow> balances,
        List<PlayerItemsRow> playerItems,
        Map<String, Integer> serverItems) {

    public EconomySnapshot {
        shopPrices = shopPrices == null ? List.of() : List.copyOf(shopPrices);
        shopListings = shopListings == null ? List.of() : List.copyOf(shopListings);
        balances = balances == null ? List.of() : List.copyOf(balances);
        playerItems = playerItems == null ? List.of() : List.copyOf(playerItems);
        serverItems = serverItems == null ? Map.of() : Map.copyOf(serverItems);
    }

    public static EconomySnapshot empty() {
        return new EconomySnapshot(List.of(), List.of(), List.of(), List.of(), Map.of());
    }

    public record ShopPriceRow(String itemKey, List<Double> prices, String source) {
        public ShopPriceRow {
            prices = prices == null ? List.of() : List.copyOf(prices);
        }
    }

    public record ShopListingRow(
            String shopId,
            String ownerUuid,
            String ownerUsername,
            String worldName,
            int x,
            int y,
            int z,
            String itemKey,
            double price,
            String listingType,
            int stockQuantity) {}

    public record BalanceRow(String uuid, String username, double balance, String currency) {}

    public record PlayerItemsRow(String uuid, String username, Map<String, Integer> items, String source) {
        public PlayerItemsRow {
            items = items == null ? Map.of() : Collections.unmodifiableMap(items);
        }
    }
}
