package com.rootrecord.minecraft.common;

import java.util.List;

/** Implemented by rootmc-shops; consumed by RootMC ShopListingService. */
public interface RootMcShopsExporter {

    String providerId();

    List<RootMcShopListingDto> collectListings();

    /** Live median sell price from in-stock shops; 0 when none. */
    default double medianInStockSellPrice(String itemKey) {
        return 0;
    }
}
