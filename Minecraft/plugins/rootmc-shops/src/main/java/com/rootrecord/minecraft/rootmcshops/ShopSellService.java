package com.rootrecord.minecraft.rootmcshops;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Quotes and executes sales to player buy shops (shop pays you for items). */
public final class ShopSellService {

    private ShopSellService() {}

    public static Optional<ShopListing> bestBuyShop(RootMcShopsPlugin plugin, String itemKey) {
        return buyShopsWithCapacity(plugin, itemKey).stream().findFirst();
    }

    public static List<ShopListing> buyShopsWithCapacity(RootMcShopsPlugin plugin, String itemKey) {
        String key = itemKey.toUpperCase(Locale.ROOT);
        return plugin.store().all().stream()
                .filter(ShopListing::isBuyShop)
                .filter(s -> s.itemKey().equalsIgnoreCase(key))
                .filter(s -> plugin.countStock(s) > 0)
                .sorted(Comparator.comparingDouble(ShopListing::price).reversed())
                .collect(Collectors.toList());
    }

    public static void sendBestQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            String itemKey,
            int qty) {
        List<ShopListing> listings = buyShopsWithCapacity(plugin, itemKey);
        if (listings.isEmpty()) {
            sendNoBuyShops(player, plugin, itemKey);
            return;
        }
        sendBuyerList(player, plugin, listings);
        ShopListing best = listings.get(0);
        int sellQty = Math.min(qty, Math.min(plugin.countStock(best), countPlayerItems(player, itemKey)));
        if (sellQty <= 0) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-no-items").replace("{item}", itemKey.toUpperCase(Locale.ROOT))));
            return;
        }
        String confirmCmd = "/sell confirm " + best.id() + " " + sellQty;
        sendQuote(player, plugin, economy, best, sellQty, confirmCmd, "sell-quote-note");
    }

    public static void offerSale(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing shop) {
        if (!shop.isBuyShop()) {
            ShopBuyService.offerPurchase(player, plugin, economy, shop);
            return;
        }
        int capacity = plugin.countStock(shop);
        if (capacity <= 0) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("shop-buy-full").replace("{item}", shop.itemKey())));
            return;
        }
        int playerQty = countPlayerItems(player, shop.itemKey());
        if (playerQty <= 0) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-no-items").replace("{item}", shop.itemKey())));
            return;
        }
        int qty = Math.min(capacity, Math.min(playerQty, Math.max(1, shop.saleQty())));
        String confirmCmd = "/sell confirm " + shop.id() + " " + qty;
        sendDirectQuote(player, plugin, economy, shop, qty, confirmCmd);
    }

    public static void sendDirectQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty,
            String confirmCommand) {
        sendQuote(player, plugin, economy, listing, qty, confirmCommand, "shop-sell-quote-note");
    }

    private static void sendQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty,
            String confirmCommand,
            String noteKey) {
        int capacity = plugin.countStock(listing);
        int playerQty = countPlayerItems(player, listing.itemKey());
        int sellQty = Math.min(qty, Math.min(capacity, playerQty));
        if (sellQty <= 0) {
            sendNoBuyShops(player, plugin, listing.itemKey());
            return;
        }

        double each = listing.price();
        double total = each * sellQty;
        String buyer = listing.ownerName() != null && !listing.ownerName().isBlank()
                ? listing.ownerName()
                : "player shop";

        player.sendMessage(plugin.colorize(plugin.rawMsg(noteKey)));

        Component line = Component.text()
                .append(Component.text("Sell ", NamedTextColor.GRAY))
                .append(Component.text(String.valueOf(sellQty), NamedTextColor.WHITE))
                .append(Component.text("x ", NamedTextColor.GRAY))
                .append(Component.text(listing.itemKey(), NamedTextColor.WHITE))
                .append(Component.text(" @ ", NamedTextColor.GRAY))
                .append(Component.text(ShopBuyService.formatGold(each), NamedTextColor.GOLD))
                .append(Component.text(" G each", NamedTextColor.GRAY))
                .append(Component.text(" to ", NamedTextColor.GRAY))
                .append(Component.text(buyer, NamedTextColor.AQUA))
                .append(Component.text(" (", NamedTextColor.GRAY))
                .append(Component.text(capacity + " wanted", NamedTextColor.WHITE))
                .append(Component.text(") → ", NamedTextColor.GRAY))
                .append(Component.text(ShopBuyService.formatGold(total), NamedTextColor.GREEN))
                .append(Component.text(" G total", NamedTextColor.GRAY))
                .build();
        player.sendMessage(line);

        if (!economy.hasOwner(listing.ownerUuid(), total)) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-owner-broke")
                            .replace("{buyer}", buyer)
                            .replace("{total}", ShopBuyService.formatGold(total))));
            return;
        }

        Component actions = Component.text()
                .append(Component.text("[Confirm]", NamedTextColor.GREEN, TextDecoration.BOLD)
                        .clickEvent(ClickEvent.runCommand(confirmCommand))
                        .hoverEvent(Component.text("Deliver items and receive " + ShopBuyService.formatGold(total) + " G", NamedTextColor.GRAY)))
                .append(Component.text("  ", NamedTextColor.GRAY))
                .append(Component.text("[Cancel]", NamedTextColor.RED)
                        .clickEvent(ClickEvent.runCommand("/sell cancel"))
                        .hoverEvent(Component.text("Cancel this sale", NamedTextColor.GRAY)))
                .build();
        player.sendMessage(actions);
    }

    public static boolean executeSale(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty) {
        if (!listing.isBuyShop()) {
            return ShopBuyService.executePurchase(player, plugin, economy, listing, qty);
        }
        Material mat = Material.matchMaterial(listing.itemKey());
        if (mat == null || mat.isAir()) {
            player.sendMessage(plugin.colorize("&cUnknown item: &f" + listing.itemKey()));
            return true;
        }
        if (ShopService.isOwner(listing, player)) {
            player.sendMessage(plugin.msg("sell-own-shop"));
            return true;
        }

        int capacity = plugin.countStock(listing);
        int playerQty = countPlayerItems(player, listing.itemKey());
        if (capacity <= 0 || playerQty <= 0) {
            sendNoBuyShops(player, plugin, listing.itemKey());
            return true;
        }
        int sellQty = Math.min(qty, Math.min(capacity, playerQty));
        double total = listing.price() * sellQty;

        if (!economy.hasOwner(listing.ownerUuid(), total)) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-owner-broke")
                            .replace("{buyer}", listing.ownerName() != null ? listing.ownerName() : "shop")
                            .replace("{total}", ShopBuyService.formatGold(total))));
            return true;
        }
        if (!withdrawPlayerItems(player, mat, sellQty)) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-no-items").replace("{item}", listing.itemKey())));
            return true;
        }
        if (!ShopContainers.depositMatchingItems(listing, mat, sellQty)) {
            giveBack(player, mat, sellQty);
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("shop-buy-full").replace("{item}", listing.itemKey())));
            return true;
        }
        if (!economy.withdrawOwner(listing.ownerUuid(), total)) {
            ShopContainers.withdrawMatchingItems(listing, mat, sellQty);
            giveBack(player, mat, sellQty);
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-owner-broke")
                            .replace("{buyer}", listing.ownerName() != null ? listing.ownerName() : "shop")
                            .replace("{total}", ShopBuyService.formatGold(total))));
            return true;
        }
        economy.depositToPlayer(player.getUniqueId(), total);
        ShopSigns.updateSign(plugin, listing);
        notifyOwnerPurchase(plugin, listing, player, sellQty, total);
        broadcastSale(plugin, listing, player, sellQty, total);

        player.sendMessage(plugin.msg("sell-success")
                .replace("{qty}", String.valueOf(sellQty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", ShopBuyService.formatGold(total))
                .replace("{buyer}", listing.ownerName() != null ? listing.ownerName() : "shop"));
        EconomySyncNotify.afterShopSale(plugin);
        return true;
    }

    private static void sendBuyerList(Player player, RootMcShopsPlugin plugin, List<ShopListing> listings) {
        player.sendMessage(plugin.colorize(plugin.rawMsg("sell-buyers-header")));
        int shown = 0;
        for (ShopListing listing : listings) {
            if (shown >= 8) {
                break;
            }
            String buyer = listing.ownerName() != null && !listing.ownerName().isBlank()
                    ? listing.ownerName()
                    : "unknown";
            int capacity = plugin.countStock(listing);
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-buyer-line")
                            .replace("{buyer}", buyer)
                            .replace("{price}", ShopBuyService.formatGold(listing.price()))
                            .replace("{capacity}", String.valueOf(capacity))
                            .replace("{item}", listing.itemKey())));
            shown++;
        }
        if (listings.size() > shown) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("sell-buyers-more").replace("{count}", String.valueOf(listings.size() - shown))));
        }
    }

    public static void sendNoBuyShops(Player player, RootMcShopsPlugin plugin, String itemKey) {
        player.sendMessage(plugin.colorize(
                plugin.rawMsg("sell-no-shops").replace("{item}", itemKey.toUpperCase(Locale.ROOT))));
    }

    private static int countPlayerItems(Player player, String itemKey) {
        Material mat = Material.matchMaterial(itemKey);
        if (mat == null || mat.isAir()) {
            return 0;
        }
        int count = 0;
        for (ItemStack stack : player.getInventory().getStorageContents()) {
            if (stack != null && !stack.getType().isAir() && stack.getType() == mat) {
                count += stack.getAmount();
            }
        }
        return count;
    }

    private static boolean withdrawPlayerItems(Player player, Material mat, int quantity) {
        int remaining = quantity;
        ItemStack[] contents = player.getInventory().getStorageContents();
        for (int slot = 0; slot < contents.length && remaining > 0; slot++) {
            ItemStack stack = contents[slot];
            if (stack == null || stack.getType() != mat) {
                continue;
            }
            int take = Math.min(remaining, stack.getAmount());
            stack.setAmount(stack.getAmount() - take);
            if (stack.getAmount() <= 0) {
                contents[slot] = null;
            }
            remaining -= take;
        }
        player.getInventory().setStorageContents(contents);
        return remaining == 0;
    }

    private static void giveBack(Player player, Material mat, int quantity) {
        int remaining = quantity;
        while (remaining > 0) {
            int stackSize = Math.min(remaining, mat.getMaxStackSize());
            var leftover = player.getInventory().addItem(new ItemStack(mat, stackSize));
            if (!leftover.isEmpty()) {
                leftover.values().forEach(item ->
                        player.getWorld().dropItemNaturally(player.getLocation(), item));
            }
            remaining -= stackSize;
        }
    }

    private static void notifyOwnerPurchase(
            RootMcShopsPlugin plugin,
            ShopListing listing,
            Player seller,
            int qty,
            double total) {
        if (listing.ownerUuid() == null || listing.ownerUuid().isBlank()) {
            return;
        }
        UUID ownerId;
        try {
            ownerId = UUID.fromString(listing.ownerUuid());
        } catch (IllegalArgumentException ex) {
            return;
        }
        if (ownerId.equals(seller.getUniqueId())) {
            return;
        }
        Player owner = Bukkit.getPlayer(ownerId);
        if (owner == null || !owner.isOnline()) {
            return;
        }
        owner.sendMessage(plugin.msg("buy-notify")
                .replace("{seller}", seller.getName())
                .replace("{qty}", String.valueOf(qty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", ShopBuyService.formatGold(total)));
    }

    private static void broadcastSale(
            RootMcShopsPlugin plugin,
            ShopListing listing,
            Player seller,
            int qty,
            double total) {
        String buyer = listing.ownerName() != null && !listing.ownerName().isBlank()
                ? listing.ownerName()
                : "shop";
        String line = plugin.rawMsg("sell-buyer-log")
                .replace("{seller}", seller.getName())
                .replace("{buyer}", buyer)
                .replace("{qty}", String.valueOf(qty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", ShopBuyService.formatGold(total));
        plugin.getLogger().info(line.replaceAll("(?i)[§&][0-9a-fk-or]", ""));
    }
}
