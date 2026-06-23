package com.rootrecord.minecraft.rootstat.economy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory market prices — median of live shop listings (updated each economy collect). */
public final class ShopPriceRegistry {

    private final Map<String, Double> avgByItem = new ConcurrentHashMap<>();

    public void updateFromShopPrices(List<EconomySnapshot.ShopPriceRow> rows) {
        avgByItem.clear();
        if (rows == null) {
            return;
        }
        for (EconomySnapshot.ShopPriceRow row : rows) {
            if (row == null || row.itemKey() == null || row.itemKey().isBlank() || row.prices().isEmpty()) {
                continue;
            }
            double median = medianPrice(row.prices());
            if (median > 0) {
                avgByItem.put(row.itemKey().toUpperCase(Locale.ROOT), median);
            }
        }
    }

    public double averagePrice(String itemKey) {
        if (itemKey == null || itemKey.isBlank()) {
            return 0;
        }
        return avgByItem.getOrDefault(itemKey.toUpperCase(Locale.ROOT), 0.0);
    }

    /** Kept for API compat — price caps are disabled; returns unlimited. */
    public double maxAllowedPrice(String itemKey, double capPercentOverAvg) {
        return Double.MAX_VALUE;
    }

    private static double medianPrice(List<Double> prices) {
        List<Double> sorted = new ArrayList<>();
        for (double price : prices) {
            if (price > 0) {
                sorted.add(price);
            }
        }
        if (sorted.isEmpty()) {
            return 0;
        }
        Collections.sort(sorted);
        int mid = sorted.size() / 2;
        if (sorted.size() % 2 == 1) {
            return sorted.get(mid);
        }
        return (sorted.get(mid - 1) + sorted.get(mid)) / 2.0;
    }
}
