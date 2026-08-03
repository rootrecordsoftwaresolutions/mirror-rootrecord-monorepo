package com.rootrecord.minecraft.rootgamble.game;

import com.rootrecord.minecraft.common.ChatLinks;
import com.rootrecord.minecraft.rootgamble.GambleConfig;
import com.rootrecord.minecraft.rootgamble.GambleEconomy;
import com.rootrecord.minecraft.rootgamble.RootGamblePlugin;
import com.rootrecord.minecraft.rootgamble.store.GambleStore;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.concurrent.ThreadLocalRandom;

public final class CoinGame {

    private final RootGamblePlugin plugin;

    public CoinGame(RootGamblePlugin plugin) {
        this.plugin = plugin;
    }

    public void challenge(Player from, Player to, double amount) {
        GambleConfig c = plugin.config();
        GambleEconomy eco = plugin.economy();
        GambleStore store = plugin.store();
        if (!eco.available()) {
            from.sendMessage(plugin.msg("economy-unavailable"));
            return;
        }
        if (amount < c.coinMin() - 1e-9 || amount > c.coinMax() + 1e-9) {
            from.sendMessage(plugin.msg("stake-range")
                    .replace("{min}", GambleEconomy.money(c.coinMin()))
                    .replace("{max}", GambleEconomy.money(c.coinMax()))
                    .replace("{currency}", c.currency()));
            return;
        }
        boolean free = store.hasFreePlay(from.getUniqueId(), "coin");
        if (!free) {
            double bal = eco.balance(from);
            if (bal + 1e-9 < amount) {
                from.sendMessage(plugin.msg("insufficient")
                        .replace("{amount}", GambleEconomy.money(amount))
                        .replace("{balance}", GambleEconomy.money(bal))
                        .replace("{currency}", c.currency()));
                return;
            }
        }
        GambleStore.Challenge existing = store.pendingForTarget(to.getUniqueId());
        if (existing != null) {
            store.deleteChallenge(existing.id());
        }
        long id = store.createChallenge(
                "coin",
                from.getUniqueId(),
                from.getName(),
                to.getUniqueId(),
                to.getName(),
                amount,
                free);
        if (id < 0) {
            from.sendMessage(plugin.msg("store-unavailable"));
            return;
        }
        from.sendMessage(plugin.msg("challenge-sent")
                .replace("{player}", to.getName())
                .replace("{amount}", GambleEconomy.money(amount))
                .replace("{currency}", c.currency()));
        to.sendMessage(plugin.msg("challenge-received")
                .replace("{player}", from.getName())
                .replace("{game}", "coin")
                .replace("{amount}", GambleEconomy.money(amount))
                .replace("{currency}", c.currency()));
        to.sendMessage(ChatLinks.confirmCancel("/coin accept", "/coin deny"));
    }

    public void accept(Player target) {
        resolve(target, true);
    }

    public void deny(Player target) {
        resolve(target, false);
    }

    private void resolve(Player target, boolean accept) {
        GambleStore store = plugin.store();
        GambleStore.Challenge ch = store.pendingForTarget(target.getUniqueId());
        if (ch == null || !"coin".equals(ch.game())) {
            target.sendMessage(plugin.msg("challenge-none"));
            return;
        }
        long age = System.currentTimeMillis() - ch.createdAtMs();
        if (age > plugin.config().challengeTimeoutSeconds() * 1000L) {
            store.deleteChallenge(ch.id());
            target.sendMessage(plugin.msg("challenge-expired"));
            return;
        }
        store.deleteChallenge(ch.id());
        if (!accept) {
            target.sendMessage(plugin.msg("challenge-denied"));
            Player challenger = Bukkit.getPlayer(ch.challenger());
            if (challenger != null) {
                challenger.sendMessage(plugin.msg("challenge-denied"));
            }
            return;
        }

        Player challenger = Bukkit.getPlayer(ch.challenger());
        if (challenger == null || !challenger.isOnline()) {
            target.sendMessage(plugin.msg("player-not-found").replace("{player}", ch.challengerName()));
            return;
        }

        GambleEconomy eco = plugin.economy();
        GambleConfig c = plugin.config();
        boolean targetFree = store.hasFreePlay(target.getUniqueId(), "coin");
        boolean challengerFree = ch.challengerFree();

        if (challengerFree && targetFree) {
            target.sendMessage(plugin.msg("challenge-need-paid"));
            challenger.sendMessage(plugin.msg("challenge-need-paid"));
            return;
        }

        double paidChallenger = 0;
        double paidTarget = 0;
        if (!challengerFree) {
            if (!eco.withdrawEscrow(challenger.getUniqueId(), ch.amount())) {
                target.sendMessage(plugin.msg("insufficient")
                        .replace("{amount}", GambleEconomy.money(ch.amount()))
                        .replace("{balance}", GambleEconomy.money(eco.balance(challenger)))
                        .replace("{currency}", c.currency()));
                return;
            }
            paidChallenger = ch.amount();
        } else {
            store.markFreeUsed(challenger.getUniqueId(), "coin");
        }
        if (!targetFree) {
            if (!eco.withdrawEscrow(target.getUniqueId(), ch.amount())) {
                if (paidChallenger > 0) {
                    eco.deposit(challenger.getUniqueId(), paidChallenger);
                }
                target.sendMessage(plugin.msg("insufficient")
                        .replace("{amount}", GambleEconomy.money(ch.amount()))
                        .replace("{balance}", GambleEconomy.money(eco.balance(target)))
                        .replace("{currency}", c.currency()));
                return;
            }
            paidTarget = ch.amount();
        } else {
            store.markFreeUsed(target.getUniqueId(), "coin");
        }

        double pot = paidChallenger + paidTarget;
        target.sendMessage(plugin.msg("challenge-accepted"));
        challenger.sendMessage(plugin.msg("challenge-accepted"));

        boolean challengerWins = ThreadLocalRandom.current().nextDouble() < c.coinChallengerWinChance();
        Player winner = challengerWins ? challenger : target;
        Player loser = challengerWins ? target : challenger;
        boolean winnerFree = challengerWins ? challengerFree : targetFree;

        eco.deposit(winner.getUniqueId(), pot);
        String freeTag = winnerFree || (challengerFree || targetFree) ? " " + plugin.rawMsg("free-used") : "";
        winner.sendMessage(plugin.colorize("&aCoin flip — you win!" + freeTag));
        winner.sendMessage(plugin.msg("win")
                .replace("{payout}", GambleEconomy.money(pot))
                .replace("{currency}", c.currency()));
        loser.sendMessage(plugin.colorize("&cCoin flip — you lose."));
        if (pot + 1e-9 >= c.broadcastWinsOver()) {
            Bukkit.broadcastMessage(plugin.msg("broadcast-win")
                    .replace("{player}", winner.getName())
                    .replace("{payout}", GambleEconomy.money(pot))
                    .replace("{currency}", c.currency())
                    .replace("{game}", "coin"));
        }
    }
}
