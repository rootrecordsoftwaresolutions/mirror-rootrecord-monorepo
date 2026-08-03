package com.rootrecord.minecraft.rootblueprints.command;

import com.rootrecord.minecraft.common.ChatLinks;
import com.rootrecord.minecraft.rootblueprints.RootBlueprintsPlugin;
import com.rootrecord.minecraft.rootblueprints.cloud.BlueprintCloudClient;
import com.rootrecord.minecraft.rootblueprints.config.BlueprintMessages;
import com.rootrecord.minecraft.rootblueprints.schematic.ChunkSchematicCapture;
import com.rootrecord.minecraft.rootblueprints.schematic.SpongeSchematicWriter;
import com.rootrecord.minecraft.rootblueprints.service.PendingSaveStore;
import com.rootrecord.minecraft.rootblueprints.towny.TownyPlotAccess;
import com.rootrecord.minecraft.common.ChatLinks;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

public final class BlueprintCommand implements CommandExecutor, TabCompleter {

    private final RootBlueprintsPlugin plugin;

    public BlueprintCommand(RootBlueprintsPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (!player.hasPermission("rootblueprints.use")) {
            player.sendMessage(RootBlueprintsPlugin.color(plugin.messages().format("no-access", Map.of())));
            return true;
        }
        if (!plugin.blueprintConfig().enabled()) {
            player.sendMessage(RootBlueprintsPlugin.color(plugin.messages().format("disabled", Map.of())));
            return true;
        }
        if (args.length == 0) {
            player.sendMessage(RootBlueprintsPlugin.color(plugin.messages().format("usage", Map.of())));
            return true;
        }
        if (!"save".equalsIgnoreCase(args[0])) {
            player.sendMessage(RootBlueprintsPlugin.color(plugin.messages().format("usage", Map.of())));
            return true;
        }
        if (args.length >= 2 && "confirm".equalsIgnoreCase(args[1])) {
            handleConfirm(player);
            return true;
        }
        handleSaveStart(player);
        return true;
    }

    private void handleSaveStart(Player player) {
        BlueprintMessages messages = plugin.messages();
        if (!TownyPlotAccess.isAvailable()) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("no-towny", Map.of())));
            return;
        }
        if (!TownyPlotAccess.canSave(player, player.getLocation())) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("no-access", Map.of())));
            return;
        }
        TownyPlotAccess.PlotContext plot = TownyPlotAccess.plotAt(player.getLocation());
        if (plot == null) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("not-in-town", Map.of())));
            return;
        }
        if (!plugin.cloud().hasCredentials()) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("no-cloud", Map.of())));
            return;
        }

        UUID uuid = player.getUniqueId();
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                BlueprintCloudClient.MemberProfile profile = plugin.cloud().fetchMemberProfile(uuid.toString());
                Bukkit.getScheduler().runTask(plugin, () -> {
                    if (!profile.linked()) {
                        player.sendMessage(RootBlueprintsPlugin.color(messages.format("not-linked", Map.of())));
                        return;
                    }
                    if (!profile.blueprintEligible()) {
                        player.sendMessage(RootBlueprintsPlugin.color(messages.format("not-eligible", Map.of())));
                        return;
                    }
                    if (profile.accountId() == null || profile.accountId().isBlank()) {
                        player.sendMessage(RootBlueprintsPlugin.color(messages.format("not-linked", Map.of())));
                        return;
                    }
                    var loc = player.getLocation();
                    PendingSaveStore.PendingSave pending = new PendingSaveStore.PendingSave(
                            profile.accountId(),
                            plot.townName(),
                            plot.plotX(),
                            plot.plotZ(),
                            loc.getWorld().getName(),
                            plot.chunkX(),
                            plot.chunkZ(),
                            loc.getBlockX(),
                            loc.getBlockY(),
                            loc.getBlockZ(),
                            System.currentTimeMillis() + plugin.pending().timeoutMs());
                    plugin.pending().put(uuid, pending);
                    player.sendMessage(RootBlueprintsPlugin.color(messages.format("pending", Map.of(
                            "town", plot.townName(),
                            "plot_x", String.valueOf(plot.plotX()),
                            "plot_z", String.valueOf(plot.plotZ())))));
                    player.sendMessage(RootBlueprintsPlugin.color(messages.format("pending-hint", Map.of(
                            "seconds", String.valueOf(plugin.pending().timeoutSeconds())))));
                });
            } catch (Exception ex) {
                Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(RootBlueprintsPlugin.color(
                        messages.format("capture-fail", Map.of("error", ex.getMessage() == null ? "link check failed" : ex.getMessage())))));
            }
        });
    }

    private void handleConfirm(Player player) {
        BlueprintMessages messages = plugin.messages();
        PendingSaveStore.PendingSave pending = plugin.pending().take(player.getUniqueId());
        if (pending == null) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("pending-expired", Map.of())));
            return;
        }
        if (!TownyPlotAccess.canSave(player, player.getLocation())) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("no-access", Map.of())));
            return;
        }
        TownyPlotAccess.PlotContext plot = TownyPlotAccess.plotAt(player.getLocation());
        if (plot == null
                || !plot.townName().equalsIgnoreCase(pending.townName())
                || plot.plotX() != pending.plotX()
                || plot.plotZ() != pending.plotZ()) {
            player.sendMessage(RootBlueprintsPlugin.color(messages.format("no-access", Map.of())));
            return;
        }

        player.sendMessage(RootBlueprintsPlugin.color(messages.format("capture-start", Map.of())));
        var world = player.getWorld();
        int anchorX = player.getLocation().getBlockX();
        int anchorY = player.getLocation().getBlockY();
        int anchorZ = player.getLocation().getBlockZ();

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                var capture = ChunkSchematicCapture.capture(plot.chunkX(), plot.chunkZ(), world, anchorX, anchorY, anchorZ);
                String fileStem = slugTown(plot.townName()) + "_" + plot.plotX() + "_" + plot.plotZ();
                byte[] schem = SpongeSchematicWriter.write(capture, fileStem);
                BlueprintCloudClient.UploadResult uploaded = plugin.cloud().uploadBlueprint(
                        new BlueprintCloudClient.UploadRequest(
                                pending.accountId(),
                                player.getUniqueId().toString(),
                                player.getName(),
                                plot.townName(),
                                plot.plotX(),
                                plot.plotZ(),
                                world.getName(),
                                plot.chunkX(),
                                plot.chunkZ(),
                                anchorX,
                                anchorY,
                                anchorZ,
                                schem));
                Bukkit.getScheduler().runTask(plugin, () -> sendSuccess(player, uploaded));
            } catch (Exception ex) {
                Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(RootBlueprintsPlugin.color(
                        messages.format("capture-fail", Map.of("error", ex.getMessage() == null ? "upload failed" : ex.getMessage())))));
            }
        });
    }

    private void sendSuccess(Player player, BlueprintCloudClient.UploadResult uploaded) {
        BlueprintMessages messages = plugin.messages();
        player.sendMessage(RootBlueprintsPlugin.color(messages.format("capture-done", Map.of("file", uploaded.fileName()))));
        player.sendMessage(RootBlueprintsPlugin.color(messages.format("download-hint", Map.of())));
        player.sendMessage(ChatLinks.labelDashUrl("[Download " + uploaded.fileName() + "]", uploaded.downloadUrl()));
    }

    private static String slugTown(String name) {
        String slug = name.replaceAll("[^a-zA-Z0-9_-]+", "_").replaceAll("^_|_$", "");
        if (slug.length() > 48) {
            slug = slug.substring(0, 48);
        }
        return slug.isEmpty() ? "town" : slug;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        List<String> out = new ArrayList<>();
        if (args.length == 1) {
            if ("save".startsWith(args[0].toLowerCase(Locale.ROOT))) {
                out.add("save");
            }
        } else if (args.length == 2 && "save".equalsIgnoreCase(args[0])) {
            if ("confirm".startsWith(args[1].toLowerCase(Locale.ROOT))) {
                out.add("confirm");
            }
        }
        return out;
    }
}
