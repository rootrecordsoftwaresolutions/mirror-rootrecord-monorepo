package com.rootrecord.minecraft.rootstat.economy;

import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.config.RootStatConfig;
import com.rootrecord.minecraft.rootstat.economy.shop.ShopListingService;
import org.bukkit.Bukkit;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

public final class EconomyCollector {

    private final Logger logger;
    private final RootStatBridge bridge;
    private final RootStatConfig config;
    private final boolean enabled;
    private final boolean vaultEnabled;
    private final boolean scanChests;

    private final VaultBalanceReader vault;
    private final PlayerInventoryScanner inventoryScanner;
    private final ShopListingService shopListingService;
    private final ChunkChestScanner chestScanner;
    private final ShopPriceRegistry priceRegistry = new ShopPriceRegistry();

    public EconomyCollector(RootStatBridge bridge) {
        this.bridge = bridge;
        this.logger = bridge.getPlugin().getLogger();
        RootStatConfig cfg = bridge.config();
        this.config = cfg;
        this.enabled = cfg.isEconomyEnabled();
        this.vaultEnabled = cfg.isEconomyVaultEnabled();
        this.scanChests = cfg.isEconomyScanChests();
        this.vault = new VaultBalanceReader(logger);
        this.inventoryScanner = new PlayerInventoryScanner();
        this.shopListingService = new ShopListingService(bridge);
        this.chestScanner = new ChunkChestScanner(cfg.economyMaxChunksPerSync());
    }

    public ShopPriceRegistry priceRegistry() {
        return priceRegistry;
    }

    public ShopListingService shopListingService() {
        return shopListingService;
    }

    public EconomySnapshot collect() {
        if (!enabled) {
            return EconomySnapshot.empty();
        }
        if (!Bukkit.isPrimaryThread()) {
            return collectOnMainThread();
        }
        return collectInternal();
    }

    private EconomySnapshot collectOnMainThread() {
        AtomicReference<EconomySnapshot> result = new AtomicReference<>(EconomySnapshot.empty());
        AtomicReference<RuntimeException> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        Bukkit.getScheduler().runTask(bridge.getPlugin(), () -> {
            try {
                result.set(collectInternal());
            } catch (RuntimeException ex) {
                error.set(ex);
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return EconomySnapshot.empty();
        }
        if (error.get() != null) {
            throw error.get();
        }
        return result.get();
    }

    private EconomySnapshot collectInternal() {
        if (vaultEnabled) {
            vault.hook();
        }

        List<EconomySnapshot.ShopListingRow> shopListings = shopListingService.collectListings(config);
        String priceSource = shopListingService.lastActiveSummary();
        List<EconomySnapshot.ShopPriceRow> shopPrices = shopListingService.aggregatePrices(shopListings, priceSource);
        priceRegistry.updateFromShopPrices(shopPrices);
        List<EconomySnapshot.BalanceRow> balances = vaultEnabled && vault.isAvailable()
                ? vault.readAllBalances()
                : List.of();
        List<EconomySnapshot.PlayerItemsRow> playerItems = inventoryScanner.scanOnlinePlayers();
        Map<String, Integer> serverItems = scanChests ? chestScanner.scanLoadedContainers() : Map.of();

        logger.fine("Economy snapshot: listings=" + shopListings.size()
                + " shopItems=" + shopPrices.size()
                + " source=" + priceSource
                + " balances=" + balances.size()
                + " players=" + playerItems.size()
                + " serverItems=" + serverItems.size());

        return new EconomySnapshot(shopPrices, shopListings, balances, playerItems, serverItems);
    }

    public int applyPendingGoldTransfers(CloudApiClient cloud) {
        if (!vaultEnabled || !vault.isAvailable()) {
            return 0;
        }
        try {
            List<CloudApiClient.GoldTransfer> pending = cloud.fetchPendingGoldTransfers();
            if (pending.isEmpty()) {
                return 0;
            }
            if (!Bukkit.isPrimaryThread()) {
                return applyTransfersOnMainThread(cloud, pending);
            }
            return applyTransfersInternal(cloud, pending);
        } catch (Exception ex) {
            logger.warning("Discord gold transfer fetch failed: " + ex.getMessage());
            return 0;
        }
    }

    private int applyTransfersOnMainThread(CloudApiClient cloud, List<CloudApiClient.GoldTransfer> pending) {
        AtomicReference<Integer> count = new AtomicReference<>(0);
        AtomicReference<RuntimeException> error = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        Bukkit.getScheduler().runTask(bridge.getPlugin(), () -> {
            try {
                count.set(applyTransfersInternal(cloud, pending));
            } catch (RuntimeException ex) {
                error.set(ex);
            } finally {
                latch.countDown();
            }
        });
        try {
            latch.await();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return 0;
        }
        if (error.get() != null) {
            throw error.get();
        }
        return count.get();
    }

    private int applyTransfersInternal(CloudApiClient cloud, List<CloudApiClient.GoldTransfer> pending) {
        List<CloudApiClient.GoldTransferResult> results = new ArrayList<>();
        int applied = 0;
        for (CloudApiClient.GoldTransfer transfer : pending) {
            UUID from = parseUuid(transfer.fromUuid());
            UUID to = parseUuid(transfer.toUuid());
            if (from == null || to == null) {
                results.add(new CloudApiClient.GoldTransferResult(transfer.id(), "failed", "invalid_uuid"));
                continue;
            }
            boolean ok = vault.transfer(from, to, transfer.amount());
            if (ok) {
                applied++;
                results.add(new CloudApiClient.GoldTransferResult(transfer.id(), "applied", null));
            } else {
                results.add(new CloudApiClient.GoldTransferResult(transfer.id(), "failed", "vault_transfer_failed"));
            }
        }
        try {
            cloud.completeGoldTransfers(results);
        } catch (Exception ex) {
            logger.warning("Discord gold transfer complete callback failed: " + ex.getMessage());
        }
        return applied;
    }

    private static UUID parseUuid(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
