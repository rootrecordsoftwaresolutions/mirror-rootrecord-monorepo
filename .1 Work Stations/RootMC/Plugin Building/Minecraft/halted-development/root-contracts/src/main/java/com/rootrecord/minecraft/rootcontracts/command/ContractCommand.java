package com.rootrecord.minecraft.rootcontracts.command;

import com.rootrecord.minecraft.rootcontracts.RootContractsPlugin;
import com.rootrecord.minecraft.rootcontracts.data.ContractsStore.ContractRow;
import com.rootrecord.minecraft.rootcontracts.service.ContractService;
import com.rootrecord.minecraft.rootcontracts.service.ContractService.ActionResult;
import com.rootrecord.minecraft.rootcontracts.service.ContractService.OfferResult;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.List;

public final class ContractCommand implements CommandExecutor {

    private final RootContractsPlugin plugin;

    public ContractCommand(RootContractsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(plugin.colorize("&eUsage: /contract <offer|accept|complete|cancel|list> ..."));
            return true;
        }
        return switch (args[0].toLowerCase()) {
            case "offer" -> handleOffer(sender, args);
            case "accept" -> handleAccept(sender, args);
            case "complete" -> handleComplete(sender, args);
            case "cancel" -> handleCancel(sender, args);
            case "list" -> handleList(sender);
            default -> {
                sender.sendMessage(plugin.colorize("&eUsage: /contract <offer|accept|complete|cancel|list> ..."));
                yield true;
            }
        };
    }

    private boolean handleOffer(CommandSender sender, String[] args) {
        if (!(sender instanceof Player client)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (!client.hasPermission("rootcontracts.use")) {
            client.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length < 4) {
            client.sendMessage(plugin.colorize("&eUsage: /contract offer <player> <amount> <terms...>"));
            return true;
        }
        Player worker = Bukkit.getPlayerExact(args[1]);
        if (worker == null) {
            client.sendMessage(plugin.msg("target-offline"));
            return true;
        }
        double amount;
        try {
            amount = Double.parseDouble(args[2]);
        } catch (NumberFormatException ex) {
            client.sendMessage(plugin.msg("invalid-amount"));
            return true;
        }
        String terms = String.join(" ", java.util.Arrays.copyOfRange(args, 3, args.length));
        OfferResult result = plugin.contracts().offer(client, worker, amount, terms);
        if (!result.ok()) {
            client.sendMessage(formatOfferFail(result));
            return true;
        }
        ContractRow row = result.row();
        client.sendMessage(plugin.msg("offer-sent")
                .replace("{amount}", plugin.money(row.amount()))
                .replace("{worker}", row.workerUsername())
                .replace("{terms}", row.terms())
                .replace("{id}", row.id()));
        plugin.contracts().notifyIfOnline(worker.getUniqueId(), plugin.msg("offer-received")
                .replace("{client}", row.clientUsername())
                .replace("{amount}", plugin.money(row.amount()))
                .replace("{terms}", row.terms())
                .replace("{id}", row.id()));
        return true;
    }

    private boolean handleAccept(CommandSender sender, String[] args) {
        if (!(sender instanceof Player worker)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (!worker.hasPermission("rootcontracts.use")) {
            worker.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        if (args.length < 2) {
            worker.sendMessage(plugin.colorize("&eUsage: /contract accept <id>"));
            return true;
        }
        ActionResult result = plugin.contracts().accept(worker, args[1].trim());
        if (!result.ok()) {
            worker.sendMessage(plugin.msg(result.key()));
            return true;
        }
        ContractRow row = result.row();
        worker.sendMessage(plugin.msg("accept-success").replace("{id}", row.id()));
        plugin.contracts().notifyIfOnline(row.clientUuid(), plugin.msg("accept-notify-client")
                .replace("{worker}", row.workerUsername())
                .replace("{id}", row.id()));
        return true;
    }

    private boolean handleComplete(CommandSender sender, String[] args) {
        if (!(sender instanceof Player client)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (args.length < 2) {
            client.sendMessage(plugin.colorize("&eUsage: /contract complete <id>"));
            return true;
        }
        ActionResult result = plugin.contracts().complete(client, args[1].trim());
        if (!result.ok()) {
            client.sendMessage(plugin.msg(result.key()));
            return true;
        }
        ContractRow row = result.row();
        client.sendMessage(plugin.msg("complete-success")
                .replace("{amount}", plugin.money(row.amount()))
                .replace("{worker}", row.workerUsername())
                .replace("{id}", row.id()));
        plugin.contracts().notifyIfOnline(row.workerUuid(), plugin.msg("complete-notify-worker")
                .replace("{client}", row.clientUsername())
                .replace("{amount}", plugin.money(row.amount()))
                .replace("{id}", row.id()));
        return true;
    }

    private boolean handleCancel(CommandSender sender, String[] args) {
        if (!(sender instanceof Player client)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        if (args.length < 2) {
            client.sendMessage(plugin.colorize("&eUsage: /contract cancel <id>"));
            return true;
        }
        ActionResult result = plugin.contracts().cancel(client, args[1].trim());
        if (!result.ok()) {
            client.sendMessage(plugin.msg(result.key()));
            return true;
        }
        ContractRow row = result.row();
        client.sendMessage(plugin.msg("cancel-success")
                .replace("{amount}", plugin.money(row.amount()))
                .replace("{id}", row.id()));
        plugin.contracts().notifyIfOnline(row.workerUuid(), plugin.msg("cancel-notify")
                .replace("{client}", row.clientUsername())
                .replace("{id}", row.id()));
        return true;
    }

    private boolean handleList(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(plugin.msg("players-only"));
            return true;
        }
        try {
            List<ContractRow> rows = plugin.contracts().listOpen(player);
            if (rows.isEmpty()) {
                player.sendMessage(plugin.msg("list-empty"));
                return true;
            }
            for (ContractRow row : rows) {
                player.sendMessage(plugin.msg("list-row")
                        .replace("{id}", row.id())
                        .replace("{status}", row.status().name().toLowerCase())
                        .replace("{client}", row.clientUsername())
                        .replace("{worker}", row.workerUsername())
                        .replace("{amount}", plugin.money(row.amount()))
                        .replace("{terms}", row.terms()));
            }
        } catch (Exception ex) {
            player.sendMessage(plugin.colorize("&cCould not load contracts: &f" + ex.getMessage()));
        }
        return true;
    }

    private String formatOfferFail(OfferResult result) {
        return switch (result.key()) {
            case "amount-range" -> plugin.msg("amount-range")
                    .replace("{min}", plugin.money(result.minAmount()))
                    .replace("{max}", plugin.money(result.maxAmount()));
            case "too-many-open" -> plugin.msg("too-many-open").replace("{max}", String.valueOf(result.maxOpen()));
            case "insufficient" -> plugin.msg("insufficient").replace("{amount}", plugin.money(result.needed()));
            default -> plugin.msg(result.key());
        };
    }
}
