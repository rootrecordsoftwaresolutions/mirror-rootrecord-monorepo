package com.rootrecord.minecraft.rootcontracts.service;

import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.rootcontracts.RootContractsPlugin;
import com.rootrecord.minecraft.rootcontracts.config.ContractsConfig;
import com.rootrecord.minecraft.rootcontracts.data.ContractsStore;
import com.rootrecord.minecraft.rootcontracts.data.ContractsStore.ContractRow;
import com.rootrecord.minecraft.rootcontracts.data.ContractsStore.Status;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ContractService {

    private final RootContractsPlugin plugin;
    private ContractsConfig config;
    private ContractsStore store;
    private RootMcEconomyService economy;

    public ContractService(RootContractsPlugin plugin) {
        this.plugin = plugin;
    }

    public void reload(ContractsConfig config, ContractsStore store, RootMcEconomyService economy) {
        this.config = config;
        this.store = store;
        this.economy = economy;
    }

    public boolean enabled() {
        return config != null && config.enabled() && store != null && economy != null;
    }

    public OfferResult offer(Player client, Player worker, double amount, String terms) {
        if (!enabled()) {
            return OfferResult.fail("disabled");
        }
        if (client.getUniqueId().equals(worker.getUniqueId())) {
            return OfferResult.fail("target-self");
        }
        if (amount < config.minAmount() || amount > config.maxAmount()) {
            return OfferResult.amountRange(config.minAmount(), config.maxAmount());
        }
        String trimmedTerms = terms == null ? "" : terms.trim();
        if (trimmedTerms.isEmpty() || trimmedTerms.length() > 500) {
            return OfferResult.fail("invalid-terms");
        }
        try {
            if (store.countOpenFor(client.getUniqueId()) >= config.maxOpenPerPlayer()) {
                return OfferResult.tooManyOpen(config.maxOpenPerPlayer());
            }
            if (!economy.has(client.getUniqueId(), amount)) {
                return OfferResult.insufficient(amount);
            }
            if (!economy.withdraw(client.getUniqueId(), amount)) {
                return OfferResult.insufficient(amount);
            }
            String id = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            ContractRow row = new ContractRow(
                    id,
                    client.getUniqueId(),
                    client.getName(),
                    worker.getUniqueId(),
                    worker.getName(),
                    amount,
                    trimmedTerms,
                    Status.OFFERED,
                    Instant.now(),
                    null,
                    null);
            store.insert(row);
            return OfferResult.ok(row);
        } catch (Exception ex) {
            plugin.getLogger().warning("Contract offer failed: " + ex.getMessage());
            return OfferResult.fail("error");
        }
    }

    public ActionResult accept(Player worker, String contractId) {
        if (!enabled()) {
            return ActionResult.fail("disabled");
        }
        try {
            Optional<ContractRow> opt = store.findById(contractId);
            if (opt.isEmpty()) {
                return ActionResult.fail("not-found");
            }
            ContractRow row = opt.get();
            if (!row.workerUuid().equals(worker.getUniqueId())) {
                return ActionResult.fail("not-participant");
            }
            if (row.status() != Status.OFFERED) {
                return ActionResult.fail("wrong-status");
            }
            if (!store.accept(contractId)) {
                return ActionResult.fail("wrong-status");
            }
            return ActionResult.ok(row);
        } catch (Exception ex) {
            plugin.getLogger().warning("Contract accept failed: " + ex.getMessage());
            return ActionResult.fail("error");
        }
    }

    public ActionResult complete(Player client, String contractId) {
        if (!enabled()) {
            return ActionResult.fail("disabled");
        }
        try {
            Optional<ContractRow> opt = store.findById(contractId);
            if (opt.isEmpty()) {
                return ActionResult.fail("not-found");
            }
            ContractRow row = opt.get();
            if (!row.clientUuid().equals(client.getUniqueId())) {
                return ActionResult.fail("not-participant");
            }
            if (row.status() != Status.ACTIVE) {
                return ActionResult.fail("wrong-status");
            }
            if (!store.complete(contractId)) {
                return ActionResult.fail("wrong-status");
            }
            economy.deposit(row.workerUuid(), row.amount());
            return ActionResult.ok(row);
        } catch (Exception ex) {
            plugin.getLogger().warning("Contract complete failed: " + ex.getMessage());
            return ActionResult.fail("error");
        }
    }

    public ActionResult cancel(Player client, String contractId) {
        if (!enabled()) {
            return ActionResult.fail("disabled");
        }
        try {
            Optional<ContractRow> opt = store.findById(contractId);
            if (opt.isEmpty()) {
                return ActionResult.fail("not-found");
            }
            ContractRow row = opt.get();
            if (!row.clientUuid().equals(client.getUniqueId())) {
                return ActionResult.fail("not-participant");
            }
            if (row.status() != Status.OFFERED && row.status() != Status.ACTIVE) {
                return ActionResult.fail("wrong-status");
            }
            boolean ok = row.status() == Status.OFFERED
                    ? store.cancelOffered(contractId)
                    : store.close(contractId, Status.ACTIVE, Status.CANCELLED);
            if (!ok) {
                return ActionResult.fail("wrong-status");
            }
            economy.deposit(client.getUniqueId(), row.amount());
            return ActionResult.ok(row);
        } catch (Exception ex) {
            plugin.getLogger().warning("Contract cancel failed: " + ex.getMessage());
            return ActionResult.fail("error");
        }
    }

    public List<ContractRow> listOpen(Player player) throws Exception {
        return store.listOpenFor(player.getUniqueId());
    }

    public void notifyIfOnline(UUID uuid, String message) {
        Player p = Bukkit.getPlayer(uuid);
        if (p != null && p.isOnline()) {
            p.sendMessage(plugin.colorize(message));
        }
    }

    public record OfferResult(
            boolean ok,
            String key,
            ContractRow row,
            double minAmount,
            double maxAmount,
            int maxOpen,
            double needed) {

        static OfferResult ok(ContractRow row) {
            return new OfferResult(true, "offer-sent", row, 0, 0, 0, 0);
        }

        static OfferResult fail(String key) {
            return new OfferResult(false, key, null, 0, 0, 0, 0);
        }

        static OfferResult amountRange(double min, double max) {
            return new OfferResult(false, "amount-range", null, min, max, 0, 0);
        }

        static OfferResult tooManyOpen(int maxOpen) {
            return new OfferResult(false, "too-many-open", null, 0, 0, maxOpen, 0);
        }

        static OfferResult insufficient(double needed) {
            return new OfferResult(false, "insufficient", null, 0, 0, 0, needed);
        }
    }

    public record ActionResult(boolean ok, String key, ContractRow row) {
        static ActionResult ok(ContractRow row) {
            return new ActionResult(true, "ok", row);
        }

        static ActionResult fail(String key) {
            return new ActionResult(false, key, null);
        }
    }
}
