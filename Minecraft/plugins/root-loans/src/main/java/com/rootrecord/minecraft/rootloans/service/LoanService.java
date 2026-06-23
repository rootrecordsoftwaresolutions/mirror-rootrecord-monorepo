package com.rootrecord.minecraft.rootloans.service;

import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootMcIncomeSweepResult;
import com.rootrecord.minecraft.common.RootMcLoanService;
import com.rootrecord.minecraft.rootloans.RootLoansPlugin;
import com.rootrecord.minecraft.rootloans.config.LoansConfig;
import com.rootrecord.minecraft.rootloans.data.LoansStore;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public final class LoanService implements RootMcLoanService {

    private final RootLoansPlugin plugin;
    private LoansConfig config;
    private LoansStore store;
    private RootMcEconomyService economy;

    public LoanService(RootLoansPlugin plugin) {
        this.plugin = plugin;
    }

    public void reload(LoansConfig config, LoansStore store, RootMcEconomyService economy) {
        this.config = config;
        this.store = store;
        this.economy = economy;
    }

    public boolean enabled() {
        return config != null && config.enabled() && store != null && economy != null;
    }

    @Override
    public RootMcIncomeSweepResult applyIncome(UUID uuid, String username, double grossIncome) {
        if (!enabled() || grossIncome <= 0) {
            return RootMcIncomeSweepResult.allToWallet(grossIncome);
        }
        try {
            Optional<LoansStore.ActiveLoan> active = store.findActive(uuid);
            if (active.isEmpty()) {
                return RootMcIncomeSweepResult.allToWallet(grossIncome);
            }
            double sweepAmount = grossIncome * config.incomeSweepPercent();
            LoansStore.RepayResult result = store.repay(uuid, username, sweepAmount);
            if (result.applied() <= 0) {
                return RootMcIncomeSweepResult.allToWallet(grossIncome);
            }
            double toWallet = grossIncome - result.applied();
            double remaining = result.payoff().isPresent()
                    ? 0
                    : store.findActive(uuid).map(LoansStore.ActiveLoan::amountOwed).orElse(0.0);
            notifyIncomeSweep(uuid, result.applied(), remaining, result.payoff());
            return new RootMcIncomeSweepResult(Math.max(0, toWallet), result.applied());
        } catch (Exception ex) {
            plugin.getLogger().warning("Loan income sweep failed for " + uuid + ": " + ex.getMessage());
            return RootMcIncomeSweepResult.allToWallet(grossIncome);
        }
    }

    public void applyOreIncome(Player player, double goldValue) {
        if (!enabled() || !config.goldOreRepayment() || goldValue <= 0) {
            return;
        }
        try {
            Optional<LoansStore.ActiveLoan> active = store.findActive(player.getUniqueId());
            if (active.isEmpty()) {
                return;
            }
            LoansStore.RepayResult result = store.repay(
                    player.getUniqueId(), player.getName(), goldValue * config.incomeSweepPercent());
            if (result.applied() > 0) {
                player.sendMessage(plugin.msg("ore-sweep").replace("{amount}", plugin.money(result.applied())));
                result.payoff().ifPresent(payoff ->
                        player.sendMessage(plugin.msg("paid-off").replace("{max}", plugin.money(payoff.newMaxLoan()))));
            }
        } catch (Exception ex) {
            plugin.getLogger().warning("Ore loan sweep failed for " + player.getName() + ": " + ex.getMessage());
        }
    }

    public TakeResult takeLoan(Player player, double principal) {
        if (!enabled()) {
            return TakeResult.fail("disabled");
        }
        if (principal <= 0) {
            return TakeResult.fail("invalid-amount");
        }
        UUID uuid = player.getUniqueId();
        try {
            if (store.findActive(uuid).isPresent()) {
                return TakeResult.fail("active-loan");
            }
            int takes = store.countTakesInRolling24h(uuid);
            if (takes >= config.maxTakesPer24h()) {
                long waitMs = store.oldestTakeInRolling24h(uuid)
                        .map(t -> Duration.between(Instant.now(), t.plus(24, java.time.temporal.ChronoUnit.HOURS)).toMillis())
                        .orElse(0L);
                return TakeResult.rateLimited(waitMs);
            }
            double maxLoan = store.maxLoan(uuid);
            if (principal > maxLoan + 0.0001d) {
                return TakeResult.overLimit(maxLoan);
            }
            double owed = principal * (1.0 + config.interestRate());
            store.createLoan(uuid, player.getName(), principal, owed);
            economy.deposit(uuid, principal);
            return TakeResult.success(principal, owed);
        } catch (Exception ex) {
            plugin.getLogger().warning("Loan take failed for " + player.getName() + ": " + ex.getMessage());
            return TakeResult.fail("take-failed");
        }
    }

    public ManualRepayResult manualRepay(Player player, double requested) {
        if (!enabled()) {
            return ManualRepayResult.error("disabled");
        }
        try {
            Optional<LoansStore.ActiveLoan> active = store.findActive(player.getUniqueId());
            if (active.isEmpty()) {
                return ManualRepayResult.error("no-loan");
            }
            double owed = active.get().amountOwed();
            if (owed <= 0) {
                return ManualRepayResult.error("repay-none");
            }
            double amount = requested > 0 ? Math.min(requested, owed) : owed;
            double balance = economy.balance(player.getUniqueId());
            if (balance + 0.0001d < amount) {
                return ManualRepayResult.insufficient(balance, amount);
            }
            if (!economy.withdraw(player.getUniqueId(), amount)) {
                return ManualRepayResult.insufficient(balance, amount);
            }
            LoansStore.RepayResult result = store.repay(player.getUniqueId(), player.getName(), amount);
            Optional<LoansStore.ActiveLoan> after = store.findActive(player.getUniqueId());
            double remaining = after.map(LoansStore.ActiveLoan::amountOwed).orElse(0.0);
            return ManualRepayResult.ok(result.applied(), remaining, result.payoff());
        } catch (Exception ex) {
            plugin.getLogger().warning("Manual repay failed for " + player.getName() + ": " + ex.getMessage());
            return ManualRepayResult.error("take-failed");
        }
    }

    @Override
    public Optional<LoanBalanceSummary> balanceSummary(UUID uuid) {
        if (!enabled()) {
            return Optional.empty();
        }
        try {
            double maxLoan = store.maxLoan(uuid);
            int takes = store.countTakesInRolling24h(uuid);
            long waitMs = 0;
            if (takes >= config.maxTakesPer24h()) {
                waitMs = store.oldestTakeInRolling24h(uuid)
                        .map(t -> Math.max(0, Duration.between(Instant.now(), t.plus(24, java.time.temporal.ChronoUnit.HOURS)).toMillis()))
                        .orElse(0L);
            }
            Optional<LoansStore.ActiveLoan> active = store.findActive(uuid);
            double owed = active.map(LoansStore.ActiveLoan::amountOwed).orElse(0.0);
            if (owed <= 0 && takes == 0 && Math.abs(maxLoan - config.startingMaxLoan()) < 0.0001d) {
                return Optional.empty();
            }
            return Optional.of(new LoanBalanceSummary(
                    owed, maxLoan, takes, config.maxTakesPer24h(), waitMs));
        } catch (Exception ex) {
            plugin.getLogger().warning("Loan summary failed for " + uuid + ": " + ex.getMessage());
            return Optional.empty();
        }
    }

    private void notifyIncomeSweep(UUID uuid, double applied, double remainingAfter, Optional<LoansStore.PayoffResult> payoff) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null || !player.isOnline()) {
            return;
        }
        if (payoff.isPresent()) {
            player.sendMessage(plugin.msg("paid-off").replace("{max}", plugin.money(payoff.get().newMaxLoan())));
            return;
        }
        if (remainingAfter <= 0.0001d) {
            return;
        }
        player.sendMessage(plugin.msg("income-sweep")
                .replace("{amount}", plugin.money(applied))
                .replace("{owed}", plugin.money(Math.max(0, remainingAfter))));
    }

    public record TakeResult(
            boolean ok,
            String messageKey,
            double principal,
            double owed,
            double maxLoan,
            long waitMs) {

        static TakeResult success(double principal, double owed) {
            return new TakeResult(true, "take-success", principal, owed, 0, 0);
        }

        static TakeResult fail(String key) {
            return new TakeResult(false, key, 0, 0, 0, 0);
        }

        static TakeResult overLimit(double max) {
            return new TakeResult(false, "over-limit", 0, 0, max, 0);
        }

        static TakeResult rateLimited(long waitMs) {
            return new TakeResult(false, "rate-limited", 0, 0, 0, waitMs);
        }
    }

    public record ManualRepayResult(
            boolean ok,
            String messageKey,
            double applied,
            double remaining,
            double balance,
            double needed,
            Optional<LoansStore.PayoffResult> payoff) {

        static ManualRepayResult ok(double applied, double remaining, Optional<LoansStore.PayoffResult> payoff) {
            return new ManualRepayResult(true, "repay-success", applied, remaining, 0, 0, payoff);
        }

        static ManualRepayResult insufficient(double balance, double needed) {
            return new ManualRepayResult(false, "repay-insufficient", 0, 0, balance, needed, Optional.empty());
        }

        static ManualRepayResult error(String key) {
            return new ManualRepayResult(false, key, 0, 0, 0, 0, Optional.empty());
        }
    }
}
