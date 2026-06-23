package com.rootrecord.minecraft.rootmcshops;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.UUID;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Collectors;

/** Quotes and executes purchases from player chest shops (never the server). */
public final class ShopBuyService {

    private ShopBuyService() {}

    public static Optional<ShopListing> cheapestInStock(RootMcShopsPlugin plugin, String itemKey, int quantity) {
        return listingsInStock(plugin, itemKey).stream().findFirst();
    }

    public static List<ShopListing> listingsInStock(RootMcShopsPlugin plugin, String itemKey) {
        String key = itemKey.toUpperCase(Locale.ROOT);
        return plugin.store().all().stream()
                .filter(ShopListing::isSellShop)
                .filter(s -> s.itemKey().equalsIgnoreCase(key))
                .filter(s -> plugin.countStock(s) > 0)
                .sorted(Comparator.comparingDouble(ShopListing::price))
                .collect(Collectors.toList());
    }

    public static void sendCheapestQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            String itemKey,
            int qty) {
        List<ShopListing> listings = listingsInStock(plugin, itemKey);
        if (listings.isEmpty()) {
            sendNoShopsSelling(player, plugin, itemKey);
            return;
        }
        sendSellerList(player, plugin, listings);
        ShopListing cheapest = listings.get(0);
        int buyQty = Math.min(qty, plugin.countStock(cheapest));
        String confirmCmd = "/buy confirm " + cheapest.id() + " " + buyQty;
        sendQuote(player, plugin, economy, cheapest, qty, confirmCmd);
    }

    private static void sendSellerList(Player player, RootMcShopsPlugin plugin, List<ShopListing> listings) {
        player.sendMessage(plugin.colorize(plugin.rawMsg("buy-sellers-header")));
        int shown = 0;
        for (ShopListing listing : listings) {
            if (shown >= 8) {
                break;
            }
            String seller = listing.ownerName() != null && !listing.ownerName().isBlank()
                    ? listing.ownerName()
                    : "unknown";
            int stock = plugin.countStock(listing);
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-seller-line")
                            .replace("{seller}", seller)
                            .replace("{price}", formatGold(listing.price()))
                            .replace("{stock}", String.valueOf(stock))
                            .replace("{item}", listing.itemKey())));
            shown++;
        }
        if (listings.size() > shown) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-sellers-more").replace("{count}", String.valueOf(listings.size() - shown))));
        }
    }

    public static void sendNoShopsSelling(Player player, RootMcShopsPlugin plugin, String itemKey) {
        player.sendMessage(plugin.colorize(
                plugin.rawMsg("buy-no-shops").replace("{item}", itemKey.toUpperCase(Locale.ROOT))));
    }

    public static void offerPurchase(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing shop) {
        Material mat = Material.matchMaterial(shop.itemKey());
        if (mat == null) {
            return;
        }
        int available = plugin.countStock(shop);
        if (available <= 0) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("shop-stock-gone").replace("{item}", shop.itemKey())));
            return;
        }
        int qty = Math.min(available, Math.max(1, shop.saleQty()));
        String confirmCmd = "/buy confirm " + shop.id() + " " + qty;
        sendDirectShopQuote(player, plugin, economy, shop, qty, confirmCmd);
    }

    public static void sendDirectShopQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty,
            String confirmCommand) {
        sendQuote(player, plugin, economy, listing, qty, confirmCommand, "shop-quote-note");
    }

    public static void sendQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty,
            String confirmCommand) {
        sendQuote(player, plugin, economy, listing, qty, confirmCommand, "buy-quote-note");
    }

    private static void sendQuote(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty,
            String confirmCommand,
            String noteKey) {
        int stock = plugin.countStock(listing);
        int buyQty = Math.min(qty, stock);
        Material mat = Material.matchMaterial(listing.itemKey());
        if (mat == null || buyQty <= 0) {
            sendNoShopsSelling(player, plugin, listing.itemKey());
            return;
        }

        double each = listing.price();
        double total = each * buyQty;
        String seller = listing.ownerName() != null && !listing.ownerName().isBlank()
                ? listing.ownerName()
                : "player shop";

        player.sendMessage(plugin.colorize(plugin.rawMsg(noteKey)));

        Component line = Component.text()
                .append(Component.text(String.valueOf(buyQty), NamedTextColor.WHITE))
                .append(Component.text("x ", NamedTextColor.GRAY))
                .append(Component.text(listing.itemKey(), NamedTextColor.WHITE))
                .append(Component.text(" @ ", NamedTextColor.GRAY))
                .append(Component.text(formatGold(each), NamedTextColor.GOLD))
                .append(Component.text(" G each", NamedTextColor.GRAY))
                .append(Component.text(" from ", NamedTextColor.GRAY))
                .append(Component.text(seller, NamedTextColor.AQUA))
                .append(Component.text(" (", NamedTextColor.GRAY))
                .append(Component.text(stock + " in stock", NamedTextColor.WHITE))
                .append(Component.text(") → ", NamedTextColor.GRAY))
                .append(Component.text(formatGold(total), NamedTextColor.GREEN))
                .append(Component.text(" G total", NamedTextColor.GRAY))
                .build();
        player.sendMessage(line);

        if (!economy.has(player, total)) {
            double balance = economy.balance(player);
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-insufficient")
                            .replace("{total}", formatGold(total))
                            .replace("{balance}", formatGold(balance))));
            return;
        }

        Component actions = Component.text()
                .append(Component.text("[Confirm]", NamedTextColor.GREEN, TextDecoration.BOLD)
                        .clickEvent(ClickEvent.runCommand(confirmCommand))
                        .hoverEvent(Component.text("Pay " + formatGold(total) + " G and receive items", NamedTextColor.GRAY)))
                .append(Component.text("  ", NamedTextColor.GRAY))
                .append(Component.text("[Cancel]", NamedTextColor.RED)
                        .clickEvent(ClickEvent.runCommand("/buy cancel"))
                        .hoverEvent(Component.text("Cancel this purchase", NamedTextColor.GRAY)))
                .build();
        player.sendMessage(actions);
    }

    public static boolean executePurchase(
            Player player,
            RootMcShopsPlugin plugin,
            ShopEconomy economy,
            ShopListing listing,
            int qty) {
        Material mat = Material.matchMaterial(listing.itemKey());
        if (mat == null || mat.isAir()) {
            player.sendMessage(plugin.colorize("&cUnknown item: &f" + listing.itemKey()));
            return true;
        }
        if (ShopService.isOwner(listing, player)) {
            player.sendMessage(plugin.msg("buy-own-shop"));
            return true;
        }

        int stock = plugin.countStock(listing);
        if (stock <= 0) {
            sendNoShopsSelling(player, plugin, listing.itemKey());
            return true;
        }
        int buyQty = Math.min(qty, stock);
        double total = listing.price() * buyQty;

        if (!economy.has(player, total)) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-insufficient")
                            .replace("{total}", formatGold(total))
                            .replace("{balance}", formatGold(economy.balance(player)))));
            return true;
        }
        if (!plugin.withdrawStock(listing, buyQty)) {
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-stock-gone").replace("{item}", listing.itemKey())));
            plugin.getLogger().warning(
                    "Shop withdraw failed for " + listing.id() + " item=" + listing.itemKey() + " qty=" + buyQty);
            return true;
        }
        if (!economy.withdraw(player, total)) {
            if (!plugin.depositStock(listing, buyQty)) {
                plugin.getLogger().severe(
                        "Shop payment failed and stock rollback failed for "
                                + listing.id()
                                + " item="
                                + listing.itemKey()
                                + " qty="
                                + buyQty);
            }
            player.sendMessage(plugin.colorize(
                    plugin.rawMsg("buy-insufficient")
                            .replace("{total}", formatGold(total))
                            .replace("{balance}", formatGold(economy.balance(player)))));
            return true;
        }
        plugin.depositToOwner(listing, total);
        ShopSigns.updateSign(plugin, listing);
        notifyOwnerSale(plugin, listing, player, buyQty, total);
        broadcastSale(plugin, listing, player, buyQty, total);

        int remaining = buyQty;
        while (remaining > 0) {
            int stackSize = Math.min(remaining, mat.getMaxStackSize());
            var leftover = player.getInventory().addItem(new ItemStack(mat, stackSize));
            if (!leftover.isEmpty()) {
                leftover.values().forEach(item ->
                        player.getWorld().dropItemNaturally(player.getLocation(), item));
            }
            remaining -= stackSize;
        }

        player.sendMessage(plugin.msg("buy-success")
                .replace("{qty}", String.valueOf(buyQty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", formatGold(total))
                .replace("{seller}", listing.ownerName() != null ? listing.ownerName() : "shop"));
        EconomySyncNotify.afterShopSale(plugin);
        return true;
    }

    static String formatGold(double amount) {
        return String.format(Locale.US, "%.2f", Math.round(amount * 100.0) / 100.0);
    }

    private static void notifyOwnerSale(
            RootMcShopsPlugin plugin,
            ShopListing listing,
            Player buyer,
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
        if (ownerId.equals(buyer.getUniqueId())) {
            return;
        }
        Player owner = Bukkit.getPlayer(ownerId);
        if (owner == null || !owner.isOnline()) {
            return;
        }
        owner.sendMessage(plugin.msg("sale-notify")
                .replace("{buyer}", buyer.getName())
                .replace("{qty}", String.valueOf(qty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", formatGold(total)));
    }

    private static void broadcastSale(
            RootMcShopsPlugin plugin,
            ShopListing listing,
            Player buyer,
            int qty,
            double total) {
        String seller = listing.ownerName() != null && !listing.ownerName().isBlank()
                ? listing.ownerName()
                : "shop";
        String line = plugin.rawMsg("buy-seller-log")
                .replace("{buyer}", buyer.getName())
                .replace("{seller}", seller)
                .replace("{qty}", String.valueOf(qty))
                .replace("{item}", listing.itemKey())
                .replace("{total}", formatGold(total));
        plugin.getLogger().info(line.replaceAll("(?i)[§&][0-9a-fk-or]", ""));
    }
}
