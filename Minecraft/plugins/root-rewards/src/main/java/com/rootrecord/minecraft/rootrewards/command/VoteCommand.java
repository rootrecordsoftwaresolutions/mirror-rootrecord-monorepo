package com.rootrecord.minecraft.rootrewards.command;

import com.rootrecord.minecraft.rootrewards.RootRewardsPlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class VoteCommand implements CommandExecutor {

    private final RootRewardsPlugin plugin;

    public VoteCommand(RootRewardsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        var cfg = plugin.rewardsConfig();
        sender.sendMessage(plugin.msg(plugin.rawMsg("vote-links-header")
                .replace("{gold_min}", String.valueOf(cfg.voteGoldMin()))
                .replace("{gold_max}", String.valueOf(cfg.voteGoldMax()))
                .replace("{hours}", String.valueOf(cfg.voteCooldownHours()))));
        if (cfg.voteLinks().isEmpty()) {
            sender.sendMessage(plugin.colorize("&7Ask staff to add vote links in root-rewards.yml."));
        } else {
            for (var link : cfg.voteLinks()) {
                sender.sendMessage(plugin.msg(plugin.rawMsg("vote-link-line")
                        .replace("{name}", link.name())
                        .replace("{url}", link.url())));
            }
        }
        if (!plugin.votifierActive()) {
            sender.sendMessage(plugin.msg("vote-no-votifier"));
        }
        return true;
    }
}
