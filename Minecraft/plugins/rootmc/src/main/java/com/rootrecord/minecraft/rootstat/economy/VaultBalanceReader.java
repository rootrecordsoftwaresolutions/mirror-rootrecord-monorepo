package com.rootrecord.minecraft.rootstat.economy;

import com.rootrecord.minecraft.common.RootMcEconomyService;
import net.milkbowl.vault.economy.Economy;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/** Reads balances and transfers via Vault Economy or Root Essentials ({@link RootMcEconomyService}). */
public final class VaultBalanceReader {

    private final Logger logger;
    private Economy vault;
    private RootMcEconomyService rootEconomy;

    public VaultBalanceReader(Logger logger) {
        this.logger = logger;
        hook();
    }

    public boolean isAvailable() {
        return vault != null || rootEconomy != null;
    }

    public boolean usesVault() {
        return vault != null;
    }

    public void hook() {
        vault = null;
        rootEconomy = null;

        if (Bukkit.getServer().getPluginManager().getPlugin("Vault") != null) {
            var registration = Bukkit.getServicesManager().getRegistration(Economy.class);
            if (registration != null) {
                vault = registration.getProvider();
                return;
            }
        }

        var rootRsp = Bukkit.getServicesManager().getRegistration(RootMcEconomyService.class);
        if (rootRsp != null) {
            rootEconomy = rootRsp.getProvider();
            return;
        }

        if (Bukkit.getServer().getPluginManager().getPlugin("Vault") != null) {
            logger.fine("Vault jar present but no economy provider (Root Essentials not loaded?).");
        }
    }

    public List<EconomySnapshot.BalanceRow> readAllBalances() {
        if (vault != null) {
            return readVaultBalances();
        }
        if (rootEconomy != null) {
            return readRootBalances();
        }
        return List.of();
    }

    private List<EconomySnapshot.BalanceRow> readVaultBalances() {
        List<EconomySnapshot.BalanceRow> out = new ArrayList<>();
        String currency = vault.currencyNamePlural();
        for (OfflinePlayer player : Bukkit.getOfflinePlayers()) {
            if (player.getUniqueId() == null) {
                continue;
            }
            double balance = vault.getBalance(player);
            if (!Double.isFinite(balance) || balance <= 0) {
                continue;
            }
            out.add(new EconomySnapshot.BalanceRow(
                    player.getUniqueId().toString(),
                    player.getName(),
                    balance,
                    currency == null || currency.isBlank() ? "default" : currency));
        }
        return out;
    }

    private List<EconomySnapshot.BalanceRow> readRootBalances() {
        List<EconomySnapshot.BalanceRow> out = new ArrayList<>();
        for (OfflinePlayer player : Bukkit.getOfflinePlayers()) {
            if (player.getUniqueId() == null) {
                continue;
            }
            double balance = rootEconomy.balance(player.getUniqueId());
            if (!Double.isFinite(balance) || balance <= 0) {
                continue;
            }
            out.add(new EconomySnapshot.BalanceRow(
                    player.getUniqueId().toString(),
                    player.getName(),
                    balance,
                    "G"));
        }
        return out;
    }

    /**
     * Transfer for Discord-queued payments. Returns false if withdraw/deposit failed.
     */
    public boolean transfer(java.util.UUID from, java.util.UUID to, double amount) {
        if (from == null || to == null) {
            return false;
        }
        double amt = Math.round(amount * 100.0) / 100.0;
        if (!Double.isFinite(amt) || amt < 0.01d) {
            return false;
        }
        if (vault != null) {
            return transferVault(from, to, amt);
        }
        if (rootEconomy != null) {
            return transferRoot(from, to, amt);
        }
        return false;
    }

    private boolean transferVault(java.util.UUID from, java.util.UUID to, double amt) {
        OfflinePlayer fromPlayer = Bukkit.getOfflinePlayer(from);
        OfflinePlayer toPlayer = Bukkit.getOfflinePlayer(to);
        if (!vault.hasAccount(fromPlayer) || !vault.hasAccount(toPlayer)) {
            return false;
        }
        if (vault.getBalance(fromPlayer) + 0.0001d < amt) {
            return false;
        }
        var response = vault.withdrawPlayer(fromPlayer, amt);
        if (response == null || !response.transactionSuccess()) {
            return false;
        }
        var deposit = vault.depositPlayer(toPlayer, amt);
        if (deposit == null || !deposit.transactionSuccess()) {
            vault.depositPlayer(fromPlayer, amt);
            return false;
        }
        return true;
    }

    private boolean transferRoot(java.util.UUID from, java.util.UUID to, double amt) {
        if (!rootEconomy.has(from, amt)) {
            return false;
        }
        if (!rootEconomy.withdraw(from, amt)) {
            return false;
        }
        try {
            rootEconomy.deposit(to, amt);
            return true;
        } catch (RuntimeException ex) {
            rootEconomy.deposit(from, amt);
            return false;
        }
    }
}
