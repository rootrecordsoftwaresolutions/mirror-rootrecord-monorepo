package com.rootrecord.minecraft.rootappreciation;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/** /voteshard merge — collapse Vote Shards in /ec (bonds-style two-step). */
public final class VoteShardCommand implements CommandExecutor {

    private final RootAppreciationPlugin plugin;

    public VoteShardCommand(RootAppreciationPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (args.length >= 1 && args[0].equalsIgnoreCase("merge")) {
            plugin.voteShardService().mergeEnder(player);
            return true;
        }
        if (args.length >= 1 && args[0].equalsIgnoreCase("power")) {
            int p = plugin.voteShardService().ecPower(player);
            player.sendMessage(plugin.colorize("&dVote Shard power in /ec: &f" + p));
            return true;
        }
        player.sendMessage(plugin.colorize("&eUsage: /voteshard merge | /voteshard power"));
        // merge = max-condense in /ec
        return true;
    }
}
