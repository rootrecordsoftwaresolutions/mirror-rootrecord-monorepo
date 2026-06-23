package com.rootrecord.minecraft.common;

import net.milkbowl.vault.economy.Economy;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.UUID;

/** Resolves RootMC economy — Vault fallback when shaded RootMcEconomyService SPI mismatches. */
public final class RootMcEconomyResolver {

    private RootMcEconomyResolver() {}

    public static RootMcEconomyService resolve(JavaPlugin plugin) {
        Economy vault = vaultEconomy(plugin);
        if (vault != null) {
            return new VaultAdapter(vault);
        }
        RegisteredServiceProvider<RootMcEconomyService> rootRsp =
                Bukkit.getServicesManager().getRegistration(RootMcEconomyService.class);
        if (rootRsp != null && rootRsp.getProvider() != null) {
            return rootRsp.getProvider();
        }
        return null;
    }

    private static Economy vaultEconomy(JavaPlugin plugin) {
        if (Bukkit.getPluginManager().getPlugin("Vault") == null) {
            return null;
        }
        RegisteredServiceProvider<Economy> rsp =
                Bukkit.getServicesManager().getRegistration(Economy.class);
        return rsp != null ? rsp.getProvider() : null;
    }

    private static final class VaultAdapter implements RootMcEconomyService {

        private final Economy vault;

        private VaultAdapter(Economy vault) {
            this.vault = vault;
        }

        @Override
        public double balance(UUID playerId) {
            return vault.getBalance(offline(playerId));
        }

        @Override
        public boolean has(UUID playerId, double amount) {
            return vault.has(offline(playerId), amount);
        }

        @Override
        public boolean withdraw(UUID playerId, double amount) {
            return vault.withdrawPlayer(offline(playerId), amount).transactionSuccess();
        }

        @Override
        public void deposit(UUID playerId, double amount) {
            if (amount > 0) {
                vault.depositPlayer(offline(playerId), amount);
            }
        }

        @Override
        public void depositIncome(UUID playerId, double amount) {
            deposit(playerId, amount);
        }

        private static OfflinePlayer offline(UUID playerId) {
            return Bukkit.getOfflinePlayer(playerId);
        }
    }
}
