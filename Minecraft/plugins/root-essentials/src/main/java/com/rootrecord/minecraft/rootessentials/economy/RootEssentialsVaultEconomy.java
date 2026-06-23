package com.rootrecord.minecraft.rootessentials.economy;

import com.rootrecord.minecraft.rootessentials.RootEssentialsPlugin;
import net.milkbowl.vault.economy.Economy;
import net.milkbowl.vault.economy.EconomyResponse;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;

import java.text.DecimalFormat;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Bridges Root Essentials MySQL balances to Vault for Towny and other plugins. */
public final class RootEssentialsVaultEconomy implements Economy {

    private static final DecimalFormat FMT = new DecimalFormat("0.00");

    private final RootEssentialsPlugin plugin;

    public RootEssentialsVaultEconomy(RootEssentialsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean isEnabled() {
        return plugin.isEnabled();
    }

    @Override
    public String getName() {
        return "Root Essentials";
    }

    @Override
    public boolean hasBankSupport() {
        return false;
    }

    @Override
    public int fractionalDigits() {
        return 2;
    }

    @Override
    public String format(double amount) {
        return FMT.format(amount) + " " + currencyNamePlural();
    }

    @Override
    public String currencyNamePlural() {
        return plugin.currency();
    }

    @Override
    public String currencyNameSingular() {
        return plugin.currency();
    }

    @Override
    @Deprecated
    public boolean hasAccount(String playerName) {
        OfflinePlayer player = Bukkit.getOfflinePlayer(playerName);
        return player.getUniqueId() != null;
    }

    @Override
    public boolean hasAccount(OfflinePlayer player) {
        return player != null && player.getUniqueId() != null;
    }

    @Override
    @Deprecated
    public boolean hasAccount(String playerName, String worldName) {
        return hasAccount(playerName);
    }

    @Override
    public boolean hasAccount(OfflinePlayer player, String worldName) {
        return hasAccount(player);
    }

    @Override
    @Deprecated
    public double getBalance(String playerName) {
        return getBalance(Bukkit.getOfflinePlayer(playerName));
    }

    @Override
    public double getBalance(OfflinePlayer player) {
        if (!hasAccount(player)) {
            return 0;
        }
        try {
            return plugin.balance(player.getUniqueId(), nameOf(player));
        } catch (Exception ex) {
            plugin.getLogger().warning("Vault getBalance failed for " + nameOf(player) + ": " + ex.getMessage());
            return 0;
        }
    }

    @Override
    @Deprecated
    public double getBalance(String playerName, String world) {
        return getBalance(playerName);
    }

    @Override
    public double getBalance(OfflinePlayer player, String world) {
        return getBalance(player);
    }

    @Override
    @Deprecated
    public boolean has(String playerName, double amount) {
        return has(Bukkit.getOfflinePlayer(playerName), amount);
    }

    @Override
    public boolean has(OfflinePlayer player, double amount) {
        return getBalance(player) + 0.0001d >= amount;
    }

    @Override
    @Deprecated
    public boolean has(String playerName, String worldName, double amount) {
        return has(playerName, amount);
    }

    @Override
    public boolean has(OfflinePlayer player, String worldName, double amount) {
        return has(player, amount);
    }

    @Override
    @Deprecated
    public EconomyResponse withdrawPlayer(String playerName, double amount) {
        return withdrawPlayer(Bukkit.getOfflinePlayer(playerName), amount);
    }

    @Override
    public EconomyResponse withdrawPlayer(OfflinePlayer player, double amount) {
        if (!hasAccount(player)) {
            return fail(amount, 0, "No account");
        }
        if (amount < 0) {
            return fail(amount, getBalance(player), "Negative amount");
        }
        UUID uuid = player.getUniqueId();
        double before = getBalance(player);
        try {
            boolean ok = plugin.withdraw(uuid, nameOf(player), amount);
            double after = getBalance(player);
            return ok
                    ? new EconomyResponse(amount, after, EconomyResponse.ResponseType.SUCCESS, "")
                    : new EconomyResponse(0, before, EconomyResponse.ResponseType.FAILURE, "Insufficient funds");
        } catch (Exception ex) {
            return new EconomyResponse(0, before, EconomyResponse.ResponseType.FAILURE, ex.getMessage());
        }
    }

    @Override
    @Deprecated
    public EconomyResponse withdrawPlayer(String playerName, String worldName, double amount) {
        return withdrawPlayer(playerName, amount);
    }

    @Override
    public EconomyResponse withdrawPlayer(OfflinePlayer player, String worldName, double amount) {
        return withdrawPlayer(player, amount);
    }

    @Override
    @Deprecated
    public EconomyResponse depositPlayer(String playerName, double amount) {
        return depositPlayer(Bukkit.getOfflinePlayer(playerName), amount);
    }

    @Override
    public EconomyResponse depositPlayer(OfflinePlayer player, double amount) {
        if (!hasAccount(player)) {
            return fail(amount, 0, "No account");
        }
        if (amount < 0) {
            return fail(amount, getBalance(player), "Negative amount");
        }
        UUID uuid = player.getUniqueId();
        double before = getBalance(player);
        try {
            plugin.depositIncome(uuid, nameOf(player), amount);
            double after = getBalance(player);
            return new EconomyResponse(amount, after, EconomyResponse.ResponseType.SUCCESS, "");
        } catch (Exception ex) {
            return new EconomyResponse(0, before, EconomyResponse.ResponseType.FAILURE, ex.getMessage());
        }
    }

    @Override
    @Deprecated
    public EconomyResponse depositPlayer(String playerName, String worldName, double amount) {
        return depositPlayer(playerName, amount);
    }

    @Override
    public EconomyResponse depositPlayer(OfflinePlayer player, String worldName, double amount) {
        return depositPlayer(player, amount);
    }

    @Override
    @Deprecated
    public boolean createPlayerAccount(String playerName) {
        return createPlayerAccount(Bukkit.getOfflinePlayer(playerName));
    }

    @Override
    public boolean createPlayerAccount(OfflinePlayer player) {
        if (!hasAccount(player)) {
            return false;
        }
        getBalance(player);
        return true;
    }

    @Override
    @Deprecated
    public boolean createPlayerAccount(String playerName, String worldName) {
        return createPlayerAccount(playerName);
    }

    @Override
    public boolean createPlayerAccount(OfflinePlayer player, String worldName) {
        return createPlayerAccount(player);
    }

    @Override
    @Deprecated
    public EconomyResponse createBank(String name, String player) {
        return bankUnsupported();
    }

    @Override
    public EconomyResponse createBank(String name, OfflinePlayer player) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse deleteBank(String name) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse bankBalance(String name) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse bankHas(String name, double amount) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse bankWithdraw(String name, double amount) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse bankDeposit(String name, double amount) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse isBankOwner(String name, String playerName) {
        return bankUnsupported();
    }

    @Override
    public EconomyResponse isBankOwner(String name, OfflinePlayer player) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public EconomyResponse isBankMember(String name, String playerName) {
        return bankUnsupported();
    }

    @Override
    public EconomyResponse isBankMember(String name, OfflinePlayer player) {
        return bankUnsupported();
    }

    @Override
    @Deprecated
    public List<String> getBanks() {
        return Collections.emptyList();
    }

    private static EconomyResponse bankUnsupported() {
        return new EconomyResponse(0, 0, EconomyResponse.ResponseType.NOT_IMPLEMENTED, "Banks not supported");
    }

    private static EconomyResponse fail(double amount, double balance, String message) {
        return new EconomyResponse(amount, balance, EconomyResponse.ResponseType.FAILURE, message);
    }

    private static String nameOf(OfflinePlayer player) {
        String name = player.getName();
        if (name == null || name.isBlank()) {
            return "player";
        }
        return name;
    }
}
