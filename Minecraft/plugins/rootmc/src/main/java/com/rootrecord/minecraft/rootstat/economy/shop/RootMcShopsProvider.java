package com.rootrecord.minecraft.rootstat.economy.shop;

import com.rootrecord.minecraft.rootstat.economy.EconomySnapshot;
import org.bukkit.plugin.Plugin;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public final class RootMcShopsProvider implements ShopProvider {

    public static final String ID = "rootmc-shops";

    private final Logger logger;

    public RootMcShopsProvider(Logger logger) {
        this.logger = logger;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String displayName() {
        return "RootMC Shops";
    }

    @Override
    public boolean requiresMainThread() {
        return true;
    }

    @Override
    public boolean probe() {
        Plugin plugin = rootShopsPlugin();
        if (plugin == null) {
            return false;
        }
        try {
            plugin.getClass().getMethod("collectListings");
            return true;
        } catch (NoSuchMethodException ex) {
            logger.warning("RootMC-Shops is loaded but missing collectListings() — update the RootMC-Shops jar.");
            return false;
        }
    }

    @Override
    public List<EconomySnapshot.ShopListingRow> collectListings() {
        Plugin plugin = rootShopsPlugin();
        if (plugin == null) {
            return List.of();
        }
        Object result = ReflectionShopSupport.invokeNoArg(plugin, "collectListings");
        List<EconomySnapshot.ShopListingRow> out = new ArrayList<>();
        for (Object dto : ReflectionShopSupport.asCollection(result)) {
            EconomySnapshot.ShopListingRow row = mapListingDto(dto);
            if (row != null) {
                out.add(row);
            }
        }
        logger.info("RootMC-Shops exporter returned " + out.size() + " listing(s).");
        return out;
    }

    private static Plugin rootShopsPlugin() {
        return ReflectionShopSupport.pluginByNames("RootMC-Shops");
    }

    private static EconomySnapshot.ShopListingRow mapListingDto(Object dto) {
        if (dto == null) {
            return null;
        }
        String shopId = stringAccessor(dto, "shopId");
        String itemKey = stringAccessor(dto, "itemKey");
        if (shopId == null || shopId.isBlank() || itemKey == null || itemKey.isBlank()) {
            return null;
        }
        return new EconomySnapshot.ShopListingRow(
                shopId,
                stringAccessor(dto, "ownerUuid"),
                stringAccessor(dto, "ownerUsername"),
                stringAccessor(dto, "worldName"),
                intAccessor(dto, "x"),
                intAccessor(dto, "y"),
                intAccessor(dto, "z"),
                itemKey,
                doubleAccessor(dto, "price"),
                stringAccessor(dto, "listingType"),
                intAccessor(dto, "stockQuantity"));
    }

    private static String stringAccessor(Object dto, String method) {
        Object value = ReflectionShopSupport.invokeNoArg(dto, method);
        return value == null ? null : String.valueOf(value);
    }

    private static int intAccessor(Object dto, String method) {
        Object value = ReflectionShopSupport.invokeNoArg(dto, method);
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static double doubleAccessor(Object dto, String method) {
        Object value = ReflectionShopSupport.invokeNoArg(dto, method);
        return value instanceof Number number ? number.doubleValue() : 0;
    }
}
