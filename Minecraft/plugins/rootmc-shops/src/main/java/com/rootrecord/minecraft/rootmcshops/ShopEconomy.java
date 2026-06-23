package com.rootrecord.minecraft.rootmcshops;

import com.rootrecord.minecraft.common.RootMcEconomyService;
import net.milkbowl.vault.economy.Economy;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.UUID;

/** Economy adapter: prefer Root Essentials service, fallback to Vault. */
public final class ShopEconomy {

    private final RootMcEconomyService root;
    private final Economy vault;

    public ShopEconomy(RootMcEconomyService root, Economy vault) {
        this.root = root;
        this.vault = vault;
    }

    public boolean available() {
        return root != null || vault != null;
    }

    public boolean has(Player player, double amount) {
        if (root != null) {
            return root.has(player.getUniqueId(), amount);
        }
        return vault != null && vault.has(player, amount);
    }

    public double balance(Player player) {
        if (root != null) {
            return root.balance(player.getUniqueId());
        }
        return vault != null ? vault.getBalance(player) : 0;
    }

    public boolean withdraw(Player player, double amount) {
        if (root != null) {
            return root.withdraw(player.getUniqueId(), amount);
        }
        if (vault == null) return false;
        return vault.withdrawPlayer(player, amount).transactionSuccess();
    }

    public void depositToPlayer(UUID playerUuid, double amount) {
        if (root != null) {
            root.depositIncome(playerUuid, amount);
            return;
        }
        if (vault != null) {
            vault.depositPlayer(Bukkit.getOfflinePlayer(playerUuid), amount);
        }
    }

    public boolean hasOwner(String ownerUuid, double amount) {
        if (ownerUuid == null || ownerUuid.isBlank() || amount <= 0) {
            return false;
        }
        try {
            UUID id = UUID.fromString(ownerUuid);
            if (root != null) {
                return root.has(id, amount);
            }
            return vault != null && vault.has(Bukkit.getOfflinePlayer(id), amount);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    public boolean withdrawOwner(String ownerUuid, double amount) {
        if (ownerUuid == null || ownerUuid.isBlank() || amount <= 0) {
            return false;
        }
        try {
            UUID id = UUID.fromString(ownerUuid);
            if (root != null) {
                return root.withdraw(id, amount);
            }
            if (vault == null) {
                return false;
            }
            return vault.withdrawPlayer(Bukkit.getOfflinePlayer(id), amount).transactionSuccess();
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }
}
