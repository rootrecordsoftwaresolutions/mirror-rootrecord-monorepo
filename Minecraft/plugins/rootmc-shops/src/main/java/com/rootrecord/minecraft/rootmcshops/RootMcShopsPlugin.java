package com.rootrecord.minecraft.rootmcshops;

import com.rootrecord.minecraft.common.RootMcEconomyBridge;
import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootMcShopListingDto;
import com.rootrecord.minecraft.common.RootMcShopsExporter;
import com.rootrecord.minecraft.common.RootRecordFolders;
import com.rootrecord.minecraft.common.config.RootRecordYamlConfig;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public final class RootMcShopsPlugin extends JavaPlugin implements RootMcShopsExporter {

    private ShopStore store;
    private ShopEconomy economy;
    private RootRecordYamlConfig yamlConfig;
    private ShopInputManager inputManager;
    private double capPercent = 10;
    private boolean requireShopPlot = true;
    private List<String> shopPlotTypeNames = List.of("shop");

    @Override
    public void onEnable() {
        yamlConfig = new RootRecordYamlConfig(this, "rootmc-shops.yml", RootRecordFolders.ROOTMC_SHOPS_CONFIG);
        yamlConfig.load();
        reloadLocalConfig();
        store = new ShopStore(this);
        store.load();
        ShopService.pruneStaleListings(this, store);
        inputManager = new ShopInputManager();
        try {
            ShopService.refreshAllSigns(this, store);
        } catch (Exception ex) {
            getLogger().warning("Shop sign refresh failed (shops still load): " + ex.getMessage());
        }

        if (!setupEconomy()) {
            getLogger().severe("No economy provider (Root Essentials or Vault) — disabling RootMC Shops.");
            Bukkit.getPluginManager().disablePlugin(this);
            return;
        }

        getServer().getPluginManager().registerEvents(new ShopProtectionListener(this, store, economy, inputManager), this);
        getServer().getPluginManager().registerEvents(new ShopChestListener(this, store, inputManager, economy), this);
        getServer().getPluginManager().registerEvents(new ShopSignListener(this, store, inputManager, economy), this);
        getServer().getPluginManager().registerEvents(new ShopChatListener(this, store, inputManager), this);
        getServer().getPluginManager().registerEvents(new ShopStockSignListener(this, store), this);
        var cmd = getCommand("buy");
        if (cmd != null) {
            BuyCommand handler = new BuyCommand(this, store, economy);
            cmd.setExecutor(handler);
            cmd.setTabCompleter(handler);
        }
        var sellCmd = getCommand("sell");
        if (sellCmd != null) {
            SellCommand sellHandler = new SellCommand(this, store, economy);
            sellCmd.setExecutor(sellHandler);
            sellCmd.setTabCompleter(sellHandler);
        }
        var admin = getCommand("rootshops");
        if (admin != null) {
            RootShopsCommand handler = new RootShopsCommand(this, store, inputManager);
            admin.setExecutor(handler);
            admin.setTabCompleter(handler);
        }
        getLogger().info("RootMC Shops enabled.");
    }

    @Override
    public void onDisable() {
        if (store != null) {
            store.save();
        }
    }

    public void reloadLocalConfig() {
        if (yamlConfig != null) {
            yamlConfig.reload();
            capPercent = yamlConfig.config().getDouble("economy.max-price-percent-over-avg", 10);
            requireShopPlot = yamlConfig.config().getBoolean("towny.require-shop-plot", true);
            shopPlotTypeNames = yamlConfig.config().getStringList("towny.shop-plot-type-names");
            if (shopPlotTypeNames == null || shopPlotTypeNames.isEmpty()) {
                shopPlotTypeNames = List.of("shop");
            }
        }
    }

    public boolean requireShopPlot() {
        return requireShopPlot;
    }

    public List<String> shopPlotTypeNames() {
        return shopPlotTypeNames;
    }

    public String msg(String key) {
        return colorize(rawMsg(key));
    }

    public String rawMsg(String key) {
        String prefix = yamlConfig.config().getString("messages.prefix", "&8[&2RootMC Shops&8]&r ");
        String body = yamlConfig.config().getString("messages." + key, key);
        return prefix + body;
    }

    public String colorize(String input) {
        return input == null ? "" : input.replace('&', '\u00A7');
    }

    public double capPercent() {
        return capPercent;
    }

    public RootMcEconomyBridge economyBridge() {
        var plugin = Bukkit.getPluginManager().getPlugin("RootMC");
        if (plugin instanceof RootMcEconomyBridge bridge) {
            return bridge;
        }
        return new RootMcEconomyBridge() {
            @Override
            public double averagePrice(String itemKey) {
                return 0;
            }

            @Override
            public double maxAllowedPrice(String itemKey, double capPercentOverAvg) {
                return Double.MAX_VALUE;
            }
        };
    }

    public boolean validatePrice(String itemKey, double price) {
        return price > 0;
    }

    public ShopInputManager inputManager() {
        return inputManager;
    }

    public ShopStore store() {
        return store;
    }

    private boolean setupEconomy() {
        var rootRsp = getServer().getServicesManager().getRegistration(RootMcEconomyService.class);
        RootMcEconomyService rootService = rootRsp != null ? rootRsp.getProvider() : null;

        net.milkbowl.vault.economy.Economy vault = null;
        if (Bukkit.getPluginManager().getPlugin("Vault") != null) {
            var vaultRsp = getServer().getServicesManager().getRegistration(net.milkbowl.vault.economy.Economy.class);
            if (vaultRsp != null) {
                vault = vaultRsp.getProvider();
            }
        }
        economy = new ShopEconomy(rootService, vault);
        return economy.available();
    }

    @Override
    public String providerId() {
        return "rootmc-shops";
    }

    @Override
    public double medianInStockSellPrice(String itemKey) {
        if (itemKey == null || itemKey.isBlank()) {
            return 0;
        }
        String key = itemKey.toUpperCase(Locale.ROOT);
        List<Double> prices = new ArrayList<>();
        for (ShopListing shop : store.all()) {
            if (!shop.itemKey().equalsIgnoreCase(key)) {
                continue;
            }
            if (!shop.isSellShop()) {
                continue;
            }
            if (countStock(shop) <= 0) {
                continue;
            }
            double price = shop.price();
            if (price > 0) {
                prices.add(price);
            }
        }
        return medianPrice(prices);
    }

    private static double medianPrice(List<Double> prices) {
        if (prices.isEmpty()) {
            return 0;
        }
        List<Double> sorted = new ArrayList<>(prices);
        Collections.sort(sorted);
        int mid = sorted.size() / 2;
        if (sorted.size() % 2 == 1) {
            return sorted.get(mid);
        }
        return (sorted.get(mid - 1) + sorted.get(mid)) / 2.0;
    }

    @Override
    public List<RootMcShopListingDto> collectListings() {
        return store.all().stream()
                .map(shop -> new RootMcShopListingDto(
                        shop.id(),
                        shop.ownerUuid(),
                        shop.ownerName(),
                        shop.world(),
                        shop.x(),
                        shop.y(),
                        shop.z(),
                        shop.itemKey(),
                        shop.price(),
                        shop.normalizedType(),
                        countStock(shop)))
                .toList();
    }

    Optional<ShopListing> cheapest(String itemKey, int quantity) {
        String key = itemKey.toUpperCase(Locale.ROOT);
        return store.all().stream()
                .filter(ShopListing::isSellShop)
                .filter(s -> s.itemKey().equalsIgnoreCase(key))
                .filter(s -> countStock(s) > 0)
                .min(Comparator.comparingDouble(ShopListing::price));
    }

    int countStock(ShopListing shop) {
        Material mat = materialForItemKey(shop.itemKey());
        if (mat == null) {
            return 0;
        }
        if (shop.isBuyShop()) {
            var inv = ShopContainers.shopInventory(shop);
            return ShopContainers.countBuyCapacity(inv, mat);
        }
        return ShopContainers.countMatchingItems(shop, mat);
    }

    private static Material materialForItemKey(String itemKey) {
        if (itemKey == null || itemKey.isBlank()) {
            return null;
        }
        Material mat = Material.matchMaterial(itemKey);
        if (mat == null) {
            mat = Material.matchMaterial(itemKey.toUpperCase(java.util.Locale.ROOT));
        }
        return mat;
    }

    boolean withdrawStock(ShopListing shop, int quantity) {
        Material mat = materialForItemKey(shop.itemKey());
        if (mat == null) {
            return false;
        }
        if (countStock(shop) < quantity) {
            return false;
        }
        return ShopContainers.withdrawMatchingItems(shop, mat, quantity);
    }

    boolean depositStock(ShopListing shop, int quantity) {
        Material mat = materialForItemKey(shop.itemKey());
        if (mat == null) {
            return false;
        }
        return ShopContainers.depositMatchingItems(shop, mat, quantity);
    }

    void depositToOwner(ShopListing shop, double amount) {
        if (shop.ownerUuid() != null) {
            economy.depositToPlayer(java.util.UUID.fromString(shop.ownerUuid()), amount);
        }
    }
}
