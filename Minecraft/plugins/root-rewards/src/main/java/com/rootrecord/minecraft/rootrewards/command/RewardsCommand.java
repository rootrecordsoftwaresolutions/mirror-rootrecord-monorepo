package com.rootrecord.minecraft.rootrewards.command;

import com.rootrecord.minecraft.rootrewards.RootRewardsPlugin;
import com.rootrecord.minecraft.rootrewards.service.PlaytimeRewardService;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

public final class RewardsCommand implements CommandExecutor {

    private final RootRewardsPlugin plugin;

    public RewardsCommand(RootRewardsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!player.hasPermission("rootrewards.use")) {
            player.sendMessage(plugin.msg("no-permission"));
            return true;
        }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                PlaytimeRewardService.PlaytimeStatus status =
                        plugin.playtimeRewards().status(player.getUniqueId());
                plugin.getServer().getScheduler().runTask(plugin, () -> sendStatus(player, status));
            } catch (Exception ex) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        player.sendMessage(plugin.colorize("&cCould not load reward status: &f" + ex.getMessage())));
            }
        });
        return true;
    }

    private void sendStatus(Player player, PlaytimeRewardService.PlaytimeStatus status) {
        player.sendMessage(plugin.msg(plugin.rawMsg("playtime-status")
                .replace("{played}", status.playedLabel())
                .replace("{tier_label}", status.tierLabel())));
        if (status.allClaimed()) {
            player.sendMessage(plugin.msg("playtime-max"));
            return;
        }
        var next = status.next();
        player.sendMessage(plugin.msg(plugin.rawMsg("playtime-next")
                .replace("{gold}", String.valueOf(next.gold()))
                .replace("{time}", next.label())
                .replace("{remaining}", status.remainingLabel())));
    }
}
