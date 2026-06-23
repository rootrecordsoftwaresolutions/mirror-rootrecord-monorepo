package com.rootrecord.minecraft.rootstat.command;

import com.rootrecord.minecraft.rootstat.RootStatBridge;
import com.rootrecord.minecraft.rootstat.cloud.CloudApiClient;
import com.rootrecord.minecraft.rootstat.economy.MarketValueReport;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/** /value — hand + carried market value, or /value <item> lookup. */
public final class ValueCommand implements CommandExecutor, TabCompleter {

    private final RootStatBridge bridge;

    public ValueCommand(RootStatBridge bridge) {
        this.bridge = bridge;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("Players only.");
                return true;
            }
            MarketValueReport.sendCarriedValue(player, bridge);
            return true;
        }
        return lookupItem(sender, String.join(" ", args).trim());
    }

    private boolean lookupItem(CommandSender sender, String query) {
        if (query.isBlank()) {
            sender.sendMessage(bridge.colorize("&eUsage: /value [item]"));
            return true;
        }
        if (!bridge.config().hasServerCredentials()) {
            sender.sendMessage(bridge.colorize(bridge.msg("config-missing")));
            return true;
        }
        bridge.getPlugin().getServer().getScheduler().runTaskAsynchronously(bridge.getPlugin(), () -> {
            try {
                var quotes = bridge.cloud().lookupItemValue(query);
                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () -> {
                    if (quotes.isEmpty()) {
                        sender.sendMessage(bridge.colorize(bridge.msg("value-not-found").replace("{item}", query)));
                        return;
                    }
                    for (CloudApiClient.ItemValueQuote quote : quotes) {
                        String label = quote.itemKey().replace('_', ' ');
                        sender.sendMessage(bridge.colorize(
                                bridge.msg("value-line")
                                        .replace("{item}", label)
                                        .replace("{each}", MarketValueReport.formatGold(quote.each()))
                                        .replace("{stack}", MarketValueReport.formatGold(quote.perStack()))
                                        .replace("{size}", String.valueOf(quote.stackSize()))
                                        .replace("{samples}", String.valueOf(quote.samples()))));
                    }
                });
            } catch (Exception ex) {
                bridge.getPlugin().getServer().getScheduler().runTask(bridge.getPlugin(), () ->
                        sender.sendMessage(bridge.colorize(bridge.msg("sync-fail").replace("{error}", ex.getMessage()))));
            }
        });
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length != 1) {
            return List.of();
        }
        String prefix = args[0].toLowerCase(Locale.ROOT);
        return Arrays.stream(Material.values())
                .filter(Material::isItem)
                .map(m -> m.name().toLowerCase(Locale.ROOT))
                .filter(name -> name.startsWith(prefix))
                .limit(20)
                .collect(Collectors.toList());
    }
}
