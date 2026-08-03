package com.rootrecord.minecraft.rootclaims;

import com.rootrecord.minecraft.common.GoldMoney;
import com.rootrecord.minecraft.common.RootMcEconomyResolver;
import com.rootrecord.minecraft.common.RootMcEconomyService;
import com.rootrecord.minecraft.common.RootMcTreasuryResolver;
import com.rootrecord.minecraft.common.RootMcTreasuryService;
import com.rootrecord.minecraft.common.TreasuryLedgerType;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.OfflinePlayer;
import org.bukkit.World;
import org.bukkit.entity.Player;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public final class ClaimService {

    private final RootClaimsPlugin plugin;
    private final ClaimStore store;

    public ClaimService(RootClaimsPlugin plugin, ClaimStore store) {
        this.plugin = plugin;
        this.store = store;
    }

    public Result claim(Player player) {
        return expandArea(player);
    }

    public Result foundArea(Player player, String requestedName) {
        if (!plugin.enabledFlag()) {
            return Result.simple(Status.DISABLED);
        }
        Location feet = player.getLocation();
        List<ClaimRecord> roots = store.rootsOwnedBy(player.getUniqueId());
        int areaCount = roots.size();
        int areaLimit = plugin.maxAreasPerPlayer();
        if (areaCount >= areaLimit && !isAdmin(player)) {
            store.appendHistory("area_found", "area_limit", player, null, 0, areaCount, areaCount, "limit=" + areaLimit);
            return new Result(Status.AREA_LIMIT, null, 0, areaCount, areaLimit);
        }
        if (!isAdmin(player)) {
            int neededMaxed = areaCount;
            int haveMaxed = store.countLevel10Areas(player.getUniqueId(), plugin.maxLevelPerArea());
            if (plugin.requirePriorAreasAtMax() && haveMaxed < neededMaxed) {
                store.appendHistory(
                        "area_found",
                        "area_locked",
                        player,
                        null,
                        0,
                        areaCount,
                        areaCount,
                        "need-level10=" + neededMaxed + ",have=" + haveMaxed);
                return new Result(Status.AREA_LOCKED, null, 0, haveMaxed, neededMaxed);
            }
        }
        ClaimRecord containing = store.containing(feet);
        if (containing != null) {
            store.appendHistory("area_found", "overlaps_other", player, containing, 0, areaCount, areaCount, "");
            return new Result(Status.OVERLAPS_OTHER, containing, 0, areaCount, areaLimit);
        }
        ClaimRecord overlap = overlappingOtherClaimOrTerritory(player, feet, plugin.anchorRadiusBlocks());
        if (overlap != null) {
            double distance = overlap.horizontalDistance(feet.getBlockX(), feet.getBlockZ());
            boolean claimCircleOverlap = distance < plugin.anchorRadiusBlocks() + overlap.radiusBlocks();
            Status status = claimCircleOverlap ? Status.OVERLAPS_OTHER : Status.FOREIGN_TERRITORY;
            store.appendHistory(
                    "area_found",
                    claimCircleOverlap ? "overlaps_other" : "foreign_territory",
                    player,
                    overlap,
                    0,
                    areaCount,
                    areaCount,
                    "other=" + overlap.ownerName());
            return new Result(status, overlap, 0, areaCount, areaLimit);
        }

        int slot = areaCount;
        String areaName = resolveNewAreaName(player, requestedName, slot);
        if (areaName == null) {
            store.appendHistory("area_found", "name_taken", player, null, 0, areaCount, areaCount, requestedName);
            return Result.simple(Status.NAME_TAKEN);
        }

        double price = plugin.areaPriceForSlot(slot);
        double bankSeed = slot == 0 ? plugin.firstClaimBankSeedGold() : 0;
        double reserveFlow = Math.max(0, price - bankSeed);
        if (price > 0) {
            RootMcTreasuryService treasury = RootMcTreasuryResolver.resolve(plugin);
            RootMcEconomyService economy = RootMcEconomyResolver.resolve(plugin);
            if (economy == null || (reserveFlow > 0 && treasury == null)) {
                store.appendHistory("area_found", "no_economy", player, null, price, areaCount, areaCount, "");
                return Result.simple(Status.NO_ECONOMY);
            }
            if (!economy.has(player.getUniqueId(), price)) {
                store.appendHistory("area_found", "cannot_afford", player, null, price, areaCount, areaCount, "");
                return new Result(Status.CANNOT_AFFORD, null, price, areaCount, areaLimit);
            }
            if (!economy.withdraw(player.getUniqueId(), price)) {
                store.appendHistory("area_found", "charge_failed", player, null, price, areaCount, areaCount, "");
                return Result.simple(Status.CHARGE_FAILED);
            }
            try {
                if (reserveFlow > 0) {
                    treasury.creditTreasury(
                            reserveFlow,
                            TreasuryLedgerType.TOWNY_SINK,
                            player.getUniqueId(),
                            player.getName(),
                            plugin.treasuryChannel() + ":area:" + areaName + ":tax-free");
                }
            } catch (RuntimeException ex) {
                economy.deposit(player.getUniqueId(), price);
                plugin.getLogger().warning("Area founding treasury settlement failed: " + ex.getMessage());
                store.appendHistory("area_found", "treasury_failed_refunded", player, null, price, areaCount, areaCount, ex.getMessage());
                return Result.simple(Status.CHARGE_FAILED);
            }
        }

        ClaimKey key = ClaimKey.of(feet);
        ClaimRecord claim = new ClaimRecord(
                key,
                player.getUniqueId(),
                player.getName(),
                System.currentTimeMillis(),
                reserveFlow,
                plugin.anchorRadiusBlocks(),
                null);
        claim.displayName(areaName);
        if (!store.add(claim)) {
            store.appendHistory("area_found", "race_already_claimed", player, claim, price, areaCount, areaCount, "");
            return Result.simple(Status.ALREADY_CLAIMED);
        }
        if (bankSeed > 0 && plugin.claimBanks() != null && !plugin.claimBanks().depositToClaimBank(claim, bankSeed)) {
            RootMcEconomyService economy = RootMcEconomyResolver.resolve(plugin);
            if (economy != null) {
                economy.deposit(player.getUniqueId(), bankSeed);
            }
            store.appendHistory("area_bank_seed", "failed_refunded", player, claim, bankSeed, areaCount, areaCount + 1, "");
        } else if (bankSeed > 0) {
            store.appendHistory("area_bank_seed", "ok", player, claim, bankSeed, areaCount, areaCount + 1, "");
        }
        store.appendHistory(
                "area_found",
                "ok",
                player,
                claim,
                price,
                areaCount,
                areaCount + 1,
                "name=" + areaName + ",slot=" + slot + ",reserve=" + reserveFlow + ",seed=" + bankSeed);
        plugin.syncBlueMap();
        plugin.notifyOwnedClaimCountChanged(player);
        return new Result(Status.OK, claim, price, areaCount + 1, areaLimit);
    }

    public Result expandArea(Player player) {
        if (!plugin.enabledFlag()) {
            return Result.simple(Status.DISABLED);
        }
        Location feet = player.getLocation();
        List<ClaimRecord> roots = store.rootsOwnedBy(player.getUniqueId());
        if (roots.isEmpty() && !isAdmin(player)) {
            store.appendHistory("area_expand", "needs_area", player, null, 0, 0, 0, "");
            return Result.simple(Status.NEEDS_AREA);
        }
        ClaimRecord containing = store.containing(feet);
        if (containing != null && !canUseForExpansion(player, containing)) {
            store.appendHistory("area_expand", "overlaps_other", player, containing, 0, 0, 0, "");
            return new Result(Status.OVERLAPS_OTHER, containing, 0, 0, 0);
        }
        ExpansionPlacement expansion = resolveExpansion(player, feet);
        if (expansion == null) {
            store.appendHistory("area_expand", "needs_edge", player, containing, 0, 0, 0, "");
            return new Result(Status.NEEDS_EDGE, containing, 0, 0, 0);
        }
        ClaimRecord parent = expansion.parent();
        ClaimRecord areaRoot = store.areaRoot(parent);
        int level = store.areaLevel(areaRoot);
        if (level >= plugin.maxLevelPerArea() && !isAdmin(player)) {
            store.appendHistory("area_expand", "level_max", player, areaRoot, 0, level, level, "max=" + plugin.maxLevelPerArea());
            return new Result(Status.AREA_LEVEL_MAX, areaRoot, 0, level, plugin.maxLevelPerArea());
        }
        Location location = expansion.snapped();
        ClaimRecord overlap = overlappingOtherClaimOrTerritory(player, location, plugin.anchorRadiusBlocks());
        if (overlap != null) {
            double distance = overlap.horizontalDistance(location.getBlockX(), location.getBlockZ());
            boolean claimCircleOverlap = distance < plugin.anchorRadiusBlocks() + overlap.radiusBlocks();
            Status status = claimCircleOverlap ? Status.OVERLAPS_OTHER : Status.FOREIGN_TERRITORY;
            store.appendHistory(
                    "area_expand",
                    claimCircleOverlap ? "overlaps_other" : "foreign_territory",
                    player,
                    overlap,
                    0,
                    level,
                    level,
                    "other=" + overlap.ownerName());
            return new Result(status, overlap, 0, level, plugin.maxLevelPerArea());
        }

        double price = plugin.expansionPriceForLevel(level);
        if (price > 0) {
            RootMcTreasuryService treasury = RootMcTreasuryResolver.resolve(plugin);
            ClaimBankService banks = plugin.claimBanks();
            if (banks == null || treasury == null) {
                store.appendHistory("area_expand", "no_economy", player, areaRoot, price, level, level, "");
                return Result.simple(Status.NO_ECONOMY);
            }
            if (banks.balance(areaRoot) + 1e-9 < price) {
                store.appendHistory("area_expand", "claim_bank_cannot_afford", player, areaRoot, price, level, level, "");
                return new Result(Status.CLAIM_BANK_CANNOT_AFFORD, areaRoot, price, level, plugin.maxLevelPerArea());
            }
            if (!banks.withdrawFromClaimBank(areaRoot, price)) {
                store.appendHistory("area_expand", "claim_bank_charge_failed", player, areaRoot, price, level, level, "");
                return new Result(Status.CLAIM_BANK_CHARGE_FAILED, areaRoot, price, level, plugin.maxLevelPerArea());
            }
            try {
                treasury.creditTreasury(
                        price,
                        TreasuryLedgerType.TOWNY_SINK,
                        areaRoot.bankAccountUuid(),
                        areaRoot.bankAccountName(),
                        plugin.treasuryChannel() + ":expand:" + areaRoot.areaNameOrOwner() + ":tax-free");
            } catch (RuntimeException ex) {
                banks.depositToClaimBank(areaRoot, price);
                plugin.getLogger().warning("Area expansion treasury settlement failed: " + ex.getMessage());
                store.appendHistory("area_expand", "treasury_failed_refunded", player, areaRoot, price, level, level, ex.getMessage());
                return new Result(Status.CLAIM_BANK_CHARGE_FAILED, areaRoot, price, level, plugin.maxLevelPerArea());
            }
        }

        ClaimKey key = ClaimKey.of(location);
        ClaimRecord claim = new ClaimRecord(
                key,
                player.getUniqueId(),
                player.getName(),
                System.currentTimeMillis(),
                price,
                plugin.anchorRadiusBlocks(),
                parent.key());
        if (!store.add(claim)) {
            store.appendHistory("area_expand", "race_already_claimed", player, claim, price, level, level, "");
            return Result.simple(Status.ALREADY_CLAIMED);
        }
        store.appendHistory(
                "area_expand",
                "ok",
                player,
                claim,
                price,
                level,
                level + 1,
                "area=" + areaRoot.areaNameOrOwner() + ",parent=" + parent.key().storageId());
        plugin.syncBlueMap();
        plugin.notifyOwnedClaimCountChanged(player);
        return new Result(Status.OK, claim, price, level + 1, plugin.maxLevelPerArea());
    }

    private String resolveNewAreaName(Player player, String requestedName, int slotIndex) {
        if (requestedName != null && !requestedName.isBlank()) {
            String trimmed = requestedName.trim();
            if (trimmed.length() > 32) {
                trimmed = trimmed.substring(0, 32);
            }
            if (store.ownerHasAreaName(player.getUniqueId(), trimmed)) {
                return null;
            }
            return trimmed;
        }
        String base = player.getName() == null || player.getName().isBlank() ? "Area" : player.getName();
        int slot = slotIndex + 1;
        String candidate = base + "(" + slot + ")";
        while (store.ownerHasAreaName(player.getUniqueId(), candidate)) {
            slot++;
            candidate = base + "(" + slot + ")";
        }
        return candidate;
    }

    /**
     * Dry-run for expansion (no charge). Founding uses {@link #previewFoundArea(Player, String)}.
     */
    public Result previewClaimPlacement(Player player) {
        return previewExpandArea(player);
    }

    public Result previewFoundArea(Player player, String requestedName) {
        if (!plugin.enabledFlag()) {
            return Result.simple(Status.DISABLED);
        }
        List<ClaimRecord> roots = store.rootsOwnedBy(player.getUniqueId());
        int areaCount = roots.size();
        int areaLimit = plugin.maxAreasPerPlayer();
        if (areaCount >= areaLimit && !isAdmin(player)) {
            return new Result(Status.AREA_LIMIT, null, 0, areaCount, areaLimit);
        }
        if (!isAdmin(player)) {
            int neededMaxed = areaCount;
            int haveMaxed = store.countLevel10Areas(player.getUniqueId(), plugin.maxLevelPerArea());
            if (plugin.requirePriorAreasAtMax() && haveMaxed < neededMaxed) {
                return new Result(Status.AREA_LOCKED, null, 0, haveMaxed, neededMaxed);
            }
        }
        if (requestedName != null && !requestedName.isBlank()
                && store.ownerHasAreaName(player.getUniqueId(), requestedName.trim())) {
            return Result.simple(Status.NAME_TAKEN);
        }
        Location feet = player.getLocation();
        ClaimRecord containing = store.containing(feet);
        if (containing != null) {
            return new Result(Status.OVERLAPS_OTHER, containing, 0, areaCount, areaLimit);
        }
        ClaimRecord overlap = overlappingOtherClaimOrTerritory(player, feet, plugin.anchorRadiusBlocks());
        if (overlap != null) {
            double distance = overlap.horizontalDistance(feet.getBlockX(), feet.getBlockZ());
            boolean claimCircleOverlap = distance < plugin.anchorRadiusBlocks() + overlap.radiusBlocks();
            return new Result(
                    claimCircleOverlap ? Status.OVERLAPS_OTHER : Status.FOREIGN_TERRITORY,
                    overlap,
                    plugin.areaPriceForSlot(areaCount),
                    areaCount,
                    areaLimit);
        }
        return new Result(Status.OK, null, plugin.areaPriceForSlot(areaCount), areaCount, areaLimit);
    }

    public Result previewExpandArea(Player player) {
        if (!plugin.enabledFlag()) {
            return Result.simple(Status.DISABLED);
        }
        if (store.rootsOwnedBy(player.getUniqueId()).isEmpty() && !isAdmin(player)) {
            return Result.simple(Status.NEEDS_AREA);
        }
        Location feet = player.getLocation();
        ClaimRecord containing = store.containing(feet);
        if (containing != null && !canUseForExpansion(player, containing)) {
            return new Result(Status.OVERLAPS_OTHER, containing, 0, 0, 0);
        }
        ExpansionPlacement expansion = resolveExpansion(player, feet);
        if (expansion == null) {
            return new Result(Status.NEEDS_EDGE, containing, 0, 0, 0);
        }
        ClaimRecord areaRoot = store.areaRoot(expansion.parent());
        int level = store.areaLevel(areaRoot);
        if (level >= plugin.maxLevelPerArea() && !isAdmin(player)) {
            return new Result(Status.AREA_LEVEL_MAX, areaRoot, 0, level, plugin.maxLevelPerArea());
        }
        ClaimRecord overlap = overlappingOtherClaimOrTerritory(
                player, expansion.snapped(), plugin.anchorRadiusBlocks());
        if (overlap != null) {
            double distance = overlap.horizontalDistance(
                    expansion.snapped().getBlockX(), expansion.snapped().getBlockZ());
            boolean claimCircleOverlap = distance < plugin.anchorRadiusBlocks() + overlap.radiusBlocks();
            return new Result(
                    claimCircleOverlap ? Status.OVERLAPS_OTHER : Status.FOREIGN_TERRITORY,
                    overlap,
                    0,
                    level,
                    plugin.maxLevelPerArea());
        }
        return new Result(Status.OK, areaRoot, plugin.expansionPriceForLevel(level), level, plugin.maxLevelPerArea());
    }

    public Result unclaim(Player player) {
        ClaimKey key = ClaimKey.of(player.getLocation());
        ClaimRecord claim = store.containing(player.getLocation());
        if (claim == null) {
            store.appendHistory("unclaim", "not_claimed", player, null, 0, 0, 0, key.label());
            return Result.simple(Status.NOT_CLAIMED);
        }
        if (!canManage(player, claim, false)) {
            store.appendHistory("unclaim", "not_owner", player, claim, 0, 0, 0, "owner=" + claim.ownerName());
            return new Result(Status.NOT_OWNER, claim, 0, 0, 0);
        }
        if (store.hasDependentChildren(claim)) {
            store.appendHistory("unclaim", "has_children", player, claim, 0, 0, 0, "");
            return new Result(Status.HAS_CHILDREN, claim, 0, 0, 0);
        }

        ClaimRecord areaRoot = store.areaRoot(claim);
        boolean removingRoot = claim.isAreaRoot();
        int before = store.countOwnedBy(claim.ownerId());
        ClaimRecord refundTargetBank = removingRoot ? null : areaRoot;
        double bankReturned = 0;
        ClaimBankService banks = plugin.claimBanks();
        if (banks != null && removingRoot) {
            bankReturned = banks.drainClaimBankToOwner(claim);
            if (bankReturned < 0) {
                store.appendHistory("unclaim", "bank_return_failed", player, claim, 0, before, before, "bank=" + claim.bankAccountName());
                return Result.simple(Status.CLAIM_BANK_CHARGE_FAILED);
            }
        }
        ClaimChestService chests = plugin.claimChests();
        if (chests != null) {
            chests.dissolve(claim, player);
        }
        store.remove(claim.key());
        plugin.syncBlueMap();
        int after = Math.max(0, before - 1);
        double refund = claim.paidGold() * (plugin.unclaimRefundPercent() / 100.0);
        if (refund > 0) {
            RootMcTreasuryService treasury = RootMcTreasuryResolver.resolve(plugin);
            boolean refunded = false;
            boolean refundedToBank = false;
            if (treasury != null && refundTargetBank != null && plugin.claimBanks() != null) {
                refunded = treasury.grantToPlayer(
                        refundTargetBank.bankAccountUuid(),
                        refundTargetBank.bankAccountName(),
                        refund,
                        treasury.treasuryUuid(),
                        treasury.treasuryUsername(),
                        "area-bank-refund:" + key.label());
                refundedToBank = refunded;
            }
            if (!refunded && treasury != null) {
                refunded = treasury.grantToPlayer(
                        player.getUniqueId(),
                        player.getName(),
                        refund,
                        treasury.treasuryUuid(),
                        treasury.treasuryUsername(),
                        "area-refund:" + key.label());
            }
            if (!refunded) {
                plugin.getLogger().warning("Could not refund " + refund + " G for unclaim " + key.label());
                store.appendHistory("unclaim", "ok_refund_failed", player, claim, refund, before, after, "refund-failed");
                plugin.notifyOwnedClaimCountChanged(player);
                return new Result(Status.OK_REFUND_FAILED, claim, refund, 0, 0);
            }
            if (refundedToBank) {
                store.appendHistory("unclaim", "ok_refund_bank", player, claim, refund, before, after, "refund-percent=" + plugin.unclaimRefundPercent());
                plugin.notifyOwnedClaimCountChanged(player);
                return new Result(Status.OK_REFUND_BANK, claim, refund, 0, 0);
            }
        }
        store.appendHistory(
                "unclaim",
                "ok",
                player,
                claim,
                refund,
                before,
                after,
                "refund-percent=" + plugin.unclaimRefundPercent() + ",bank-returned=" + bankReturned);
        plugin.notifyOwnedClaimCountChanged(player);
        return new Result(Status.OK, claim, refund, 0, 0);
    }

    /**
     * Removes every claim owned by the player, drains all claim banks to their wallet,
     * and refunds land investment ({@code paidGold} per claim - first claim stores reserve
     * flow only, i.e. creation fee minus the bank seed).
     */
    public Result unclaimAll(Player player) {
        if (player == null) {
            return Result.simple(Status.NOT_CLAIMED);
        }
        List<ClaimRecord> owned = store.ownedBy(player.getUniqueId());
        if (owned.isEmpty()) {
            store.appendHistory("unclaim_all", "not_claimed", player, null, 0, 0, 0, "");
            return Result.simple(Status.NOT_CLAIMED);
        }
        int before = owned.size();
        double landRefundBase = 0;
        for (ClaimRecord claim : owned) {
            landRefundBase += Math.max(0, claim.paidGold());
        }
        double landRefund = GoldMoney.round(landRefundBase * (plugin.unclaimRefundPercent() / 100.0));

        ClaimBankService banks = plugin.claimBanks();
        double bankReturned = 0;
        if (banks != null) {
            for (ClaimRecord root : store.rootsOwnedBy(player.getUniqueId())) {
                double returned = banks.drainClaimBankToOwner(root);
                if (returned < 0) {
                    store.appendHistory(
                            "unclaim_all",
                            "bank_return_failed",
                            player,
                            root,
                            0,
                            before,
                            before,
                            "bank=" + root.bankAccountName());
                    return Result.simple(Status.CLAIM_BANK_CHARGE_FAILED);
                }
                bankReturned += returned;
            }
        }
        bankReturned = GoldMoney.round(bankReturned);

        ClaimChestService chests = plugin.claimChests();
        if (chests != null) {
            for (ClaimRecord claim : owned) {
                chests.dissolve(claim, player);
            }
        }

        List<ClaimRecord> removed = store.removeOwnedBy(player.getUniqueId());
        plugin.syncBlueMap();
        int after = store.countOwnedBy(player.getUniqueId());
        if (removed.size() != before || after != 0) {
            plugin.getLogger().warning("unclaim all incomplete for " + player.getName()
                    + ": expected " + before + " removed, got " + removed.size() + ", remaining=" + after);
        }

        if (landRefund > 0) {
            RootMcTreasuryService treasury = RootMcTreasuryResolver.resolve(plugin);
            boolean refunded = false;
            if (treasury != null) {
                refunded = treasury.grantToPlayer(
                        player.getUniqueId(),
                        player.getName(),
                        landRefund,
                        treasury.treasuryUuid(),
                        treasury.treasuryUsername(),
                        "claim-unclaim-all-refund:count=" + removed.size());
            }
            if (!refunded) {
                plugin.getLogger().warning("Could not refund " + landRefund + " G for unclaim all " + player.getName());
                store.appendHistory(
                        "unclaim_all",
                        "ok_refund_failed",
                        player,
                        null,
                        landRefund,
                        before,
                        after,
                        "bank-returned=" + bankReturned);
                plugin.notifyOwnedClaimCountChanged(player);
                return new Result(Status.OK_REFUND_FAILED, null, landRefund, removed.size(), 0, bankReturned);
            }
        }

        store.appendHistory(
                "unclaim_all",
                "ok",
                player,
                null,
                landRefund,
                before,
                after,
                "count=" + removed.size()
                        + ",land-refund=" + landRefund
                        + ",bank-returned=" + bankReturned
                        + ",seed-excluded=" + plugin.firstClaimBankSeedGold());
        plugin.notifyOwnedClaimCountChanged(player);
        return new Result(Status.OK, null, landRefund, removed.size(), 0, bankReturned);
    }

    /**
     * Ban confiscation: drain every owned claim bank to Server Reserve, discard claim chests,
     * remove owned claims (no land refund), and untrust the player from others' claims.
     */
    public SeizeResult seizeOwnedClaimsForBan(UUID ownerId, String ownerName) {
        if (ownerId == null) {
            return SeizeResult.EMPTY;
        }
        String name = ownerName == null || ownerName.isBlank() ? ownerId.toString().substring(0, 8) : ownerName;
        List<ClaimRecord> owned = store.ownedBy(ownerId);
        ClaimBankService banks = plugin.claimBanks();
        double banksSeized = 0;
        if (banks != null) {
            for (ClaimRecord root : store.rootsOwnedBy(ownerId)) {
                double drained = banks.drainClaimBankToReserve(root, "ban-seize:claim-bank:" + root.key().label());
                if (drained < 0) {
                    plugin.getLogger().warning("Ban seize: claim bank drain failed for " + root.key().label());
                } else {
                    banksSeized += drained;
                }
            }
        }
        banksSeized = GoldMoney.round(banksSeized);

        ClaimChestService chests = plugin.claimChests();
        if (chests != null) {
            for (ClaimRecord claim : owned) {
                // null recipient discards storage (already confiscated via bank/wallet paths)
                chests.dissolve(claim, null);
            }
        }

        int removed = store.removeOwnedBy(ownerId).size();
        int untrusted = 0;
        boolean trustChanged = false;
        for (ClaimRecord claim : store.all()) {
            if (!claim.isAreaRoot()) {
                continue;
            }
            if (claim.trusted().containsKey(ownerId) && claim.untrust(ownerId)) {
                untrusted++;
                trustChanged = true;
            }
        }
        if (trustChanged) {
            store.save();
        }
        plugin.syncBlueMap();
        Player online = Bukkit.getPlayer(ownerId);
        if (online != null && online.isOnline()) {
            plugin.notifyOwnedClaimCountChanged(online);
        }
        store.appendHistory(
                "ban_seize",
                "ok",
                online != null && online.isOnline() ? online : null,
                null,
                banksSeized,
                owned.size(),
                0,
                "removed=" + removed + ",untrusted=" + untrusted + ",name=" + name);
        return new SeizeResult(removed, untrusted, banksSeized);
    }

    public record SeizeResult(int claimsRemoved, int untrustedFrom, double banksToReserveG) {
        static final SeizeResult EMPTY = new SeizeResult(0, 0, 0);
    }

    public Result trust(Player actor, OfflinePlayer target) {
        ClaimRecord claim = store.containing(actor.getLocation());
        if (claim == null) {
            store.appendHistory("trust", "not_claimed", actor, null, 0, 0, 0, target.getUniqueId().toString());
            return Result.simple(Status.NOT_CLAIMED);
        }
        ClaimRecord root = store.areaRoot(claim);
        if (!canManage(actor, root, false)) {
            store.appendHistory("trust", "not_owner", actor, claim, 0, 0, 0, target.getUniqueId().toString());
            return new Result(Status.NOT_OWNER, claim, 0, 0, 0);
        }
        String name = target.getName() != null ? target.getName() : target.getUniqueId().toString();
        root.trust(target.getUniqueId(), name);
        store.save();
        store.appendHistory("trust", "ok", actor, root, 0, 0, 0, "trusted=" + name + ":" + target.getUniqueId());
        return new Result(Status.OK, root, 0, 0, 0);
    }

    public Result untrust(Player actor, OfflinePlayer target) {
        ClaimRecord claim = store.containing(actor.getLocation());
        if (claim == null) {
            store.appendHistory("untrust", "not_claimed", actor, null, 0, 0, 0, target.getUniqueId().toString());
            return Result.simple(Status.NOT_CLAIMED);
        }
        ClaimRecord root = store.areaRoot(claim);
        if (!canManage(actor, root, false)) {
            store.appendHistory("untrust", "not_owner", actor, claim, 0, 0, 0, target.getUniqueId().toString());
            return new Result(Status.NOT_OWNER, claim, 0, 0, 0);
        }
        root.untrust(target.getUniqueId());
        store.save();
        store.appendHistory("untrust", "ok", actor, root, 0, 0, 0, "untrusted=" + target.getUniqueId());
        return new Result(Status.OK, root, 0, 0, 0);
    }

    public Collection<ClaimRecord> allClaims() {
        return store.all();
    }

    public ClaimRecord findOwnerByName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String needle = name.toLowerCase(java.util.Locale.ROOT);
        ClaimRecord byArea = store.findAreaByName(name);
        if (byArea != null) {
            return byArea;
        }
        for (ClaimRecord claim : store.all()) {
            if (claim.ownerName() != null && claim.ownerName().toLowerCase(java.util.Locale.ROOT).equals(needle)) {
                return store.areaRoot(claim);
            }
        }
        return null;
    }

    public ClaimRecord claimAt(Player player) {
        return store.containing(player.getLocation());
    }

    public ClaimRecord claimAt(org.bukkit.Location location) {
        return location == null ? null : store.containing(location);
    }

    public boolean canManageAt(java.util.UUID playerId, org.bukkit.Location location) {
        ClaimRecord claim = claimAt(location);
        if (claim == null || playerId == null) {
            return false;
        }
        return store.areaRoot(claim).canManage(playerId);
    }

    public ClaimRecord claimByKey(ClaimKey key) {
        return key == null ? null : store.get(key);
    }

    public ClaimRecord territoryAt(Player player) {
        if (player == null) {
            return null;
        }
        return store.territoryContaining(player.getLocation(), plugin.territoryBufferBlocks());
    }

    public List<ClaimRecord> ownedBy(UUID playerId) {
        return store.ownedBy(playerId);
    }

    public List<ClaimRecord> rootsOwnedBy(UUID ownerId) {
        return store.rootsOwnedBy(ownerId);
    }

    public ClaimRecord areaRoot(ClaimRecord claim) {
        return store.areaRoot(claim);
    }

    public int areaLevel(ClaimRecord claim) {
        return store.areaLevel(claim);
    }

    public ClaimRecord ownedClaimAt(Player player) {
        ClaimRecord claim = claimAt(player);
        return claim != null && claim.ownerId().equals(player.getUniqueId()) ? claim : null;
    }

    public ClaimRecord ownedSpawnClaim(Player player) {
        ClaimRecord target = ownedClaimAt(player);
        if (target != null) {
            return store.areaRoot(target);
        }
        List<ClaimRecord> roots = store.rootsOwnedBy(player.getUniqueId());
        return roots.isEmpty() ? null : roots.get(0);
    }

    /** Whether {@code visitorId} may teleport to this area's spawn. */
    public boolean canUseSpawn(ClaimRecord claim, UUID visitorId) {
        if (claim == null || visitorId == null) {
            return false;
        }
        ClaimRecord root = store.areaRoot(claim);
        if (root.ownerId().equals(visitorId)) {
            return true;
        }
        if (root.spawnPublic()) {
            return true;
        }
        return root.trusted().containsKey(visitorId);
    }

    /**
     * Best spawn area for visiting {@code ownerId}'s land (public first, then member access).
     */
    public ClaimRecord resolveSpawnClaim(UUID ownerId, UUID visitorId) {
        return resolveSpawnClaim(ownerId, visitorId, null);
    }

    public ClaimRecord resolveSpawnClaim(UUID ownerId, UUID visitorId, String areaName) {
        if (ownerId == null || visitorId == null) {
            return null;
        }
        if (areaName != null && !areaName.isBlank()) {
            ClaimRecord named = store.findAreaByName(ownerId, areaName);
            if (named != null && canUseSpawn(named, visitorId)) {
                return named;
            }
            return null;
        }
        ClaimRecord best = null;
        int bestScore = -1;
        for (ClaimRecord root : store.rootsOwnedBy(ownerId)) {
            if (!canUseSpawn(root, visitorId)) {
                continue;
            }
            int score = 0;
            if (root.spawnPublic()) {
                score += 2;
            }
            if (root.hasCustomSpawn()) {
                score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                best = root;
            }
        }
        return best;
    }

    public ClaimRecord resolveSpawnByAreaName(String areaName, UUID visitorId) {
        ClaimRecord root = store.findAreaByName(areaName);
        if (root == null || !canUseSpawn(root, visitorId)) {
            return null;
        }
        return root;
    }

    public Location spawnLocation(ClaimRecord claim) {
        if (claim == null) {
            return null;
        }
        ClaimRecord root = store.areaRoot(claim);
        World world = Bukkit.getWorld(root.key().world());
        if (world == null) {
            return null;
        }
        if (root.hasCustomSpawn()) {
            return new Location(
                    world,
                    root.spawnX(),
                    root.spawnY(),
                    root.spawnZ(),
                    root.spawnYaw(),
                    root.spawnPitch());
        }
        Location anchor = new Location(world, root.key().x() + 0.5, root.key().y(), root.key().z() + 0.5);
        Location highest = world.getHighestBlockAt(root.key().x(), root.key().z()).getLocation().add(0.5, 1.0, 0.5);
        return highest.getY() >= anchor.getY() - 2 ? highest : anchor;
    }

    public Result setSpawn(Player player) {
        ClaimRecord claim = store.containing(player.getLocation());
        if (claim == null) {
            store.appendHistory("set_spawn", "not_claimed", player, null, 0, 0, 0, "");
            return Result.simple(Status.NOT_CLAIMED);
        }
        ClaimRecord root = store.areaRoot(claim);
        if (!canManage(player, root, false)) {
            store.appendHistory("set_spawn", "not_owner", player, claim, 0, 0, 0, "");
            return new Result(Status.NOT_OWNER, claim, 0, 0, 0);
        }
        if (!claim.contains(player.getLocation())) {
            store.appendHistory("set_spawn", "outside_claim", player, claim, 0, 0, 0, "");
            return new Result(Status.OUTSIDE_CLAIM, claim, 0, 0, 0);
        }
        root.setSpawn(player.getLocation());
        store.save();
        Location loc = player.getLocation();
        store.appendHistory(
                "set_spawn",
                "ok",
                player,
                root,
                0,
                0,
                0,
                "x=" + loc.getX() + ",y=" + loc.getY() + ",z=" + loc.getZ());
        return new Result(Status.OK, root, 0, 0, 0);
    }

    public double nextClaimPrice(UUID playerId) {
        List<ClaimRecord> roots = store.rootsOwnedBy(playerId);
        if (roots.isEmpty()) {
            return plugin.areaPriceForSlot(0);
        }
        for (ClaimRecord root : roots) {
            int level = store.areaLevel(root);
            if (level < plugin.maxLevelPerArea()) {
                return plugin.expansionPriceForLevel(level);
            }
        }
        if (roots.size() >= plugin.maxAreasPerPlayer()) {
            return 0;
        }
        return plugin.areaPriceForSlot(roots.size());
    }

    public double nextAreaFoundingPrice(UUID playerId) {
        return plugin.areaPriceForSlot(store.rootsOwnedBy(playerId).size());
    }

    public double bankBalance(ClaimRecord claim) {
        ClaimBankService banks = plugin.claimBanks();
        ClaimRecord root = store.areaRoot(claim);
        return banks == null || root == null ? 0 : banks.balance(root);
    }

    public String bankDisplayName(ClaimRecord claim) {
        if (claim == null) {
            return "Area";
        }
        ClaimRecord root = store.areaRoot(claim);
        int level = store.areaLevel(root);
        return "Area " + root.areaNameOrOwner() + " Lv" + level + "/" + plugin.maxLevelPerArea()
                + " (" + root.key().world() + " " + root.key().x() + "," + root.key().z() + ")";
    }

    public ClaimBankService.Result depositToBank(Player actor, ClaimRecord claim, double amountGold) {
        ClaimBankService banks = plugin.claimBanks();
        if (banks == null) {
            return new ClaimBankService.Result(ClaimBankService.Status.NO_ECONOMY, amountGold, 0);
        }
        ClaimRecord root = store.areaRoot(claim);
        ClaimBankService.Result result = banks.depositFromPlayer(actor, root, amountGold);
        store.appendHistory(
                "area_bank_deposit",
                result.status().name().toLowerCase(java.util.Locale.ROOT),
                actor,
                root,
                result.amountG(),
                0,
                0,
                "bank=" + (root == null ? "" : root.bankAccountName()) + ",balance=" + result.balanceG());
        return result;
    }

    public void save() {
        store.save();
    }

    /** Remove hostile monsters currently inside a claim (used when mobs are toggled off). */
    public int despawnHostiles(ClaimRecord claim) {
        if (claim == null) {
            return 0;
        }
        World world = Bukkit.getWorld(claim.key().world());
        if (world == null) {
            return 0;
        }
        int removed = 0;
        for (org.bukkit.entity.Entity entity : world.getEntitiesByClass(org.bukkit.entity.Monster.class)) {
            if (claim.contains(entity.getLocation())) {
                entity.remove();
                removed++;
            }
        }
        return removed;
    }

    public void recordSettingToggle(Player actor, ClaimRecord claim, String setting, boolean enabled) {
        store.appendHistory(
                "setting",
                "ok",
                actor,
                claim,
                0,
                0,
                0,
                setting + "=" + enabled);
    }

    public boolean canManage(Player player, ClaimRecord claim, boolean trustedCanManage) {
        if (player == null || claim == null) {
            return false;
        }
        if (isAdmin(player)) {
            return true;
        }
        ClaimRecord root = store.areaRoot(claim);
        if (root.ownerId().equals(player.getUniqueId())) {
            root.ownerName(player.getName());
            return true;
        }
        return trustedCanManage && root.trusted().containsKey(player.getUniqueId());
    }

    /** Owner-only expansions (members do not raise area level). */
    private boolean canUseForExpansion(Player player, ClaimRecord claim) {
        if (plugin.allowTrustedExpansion()) {
            return canManage(player, claim, true);
        }
        return canManage(player, claim, false);
    }

    /** Owner or member — territory fees, alerts, protection. */
    public boolean isAllied(Player player, ClaimRecord claim) {
        return canManage(player, claim, true);
    }

    private ExpansionPlacement resolveExpansion(Player player, Location location) {
        ClaimRecord parent = expansionParent(player, location);
        if (parent == null) {
            return null;
        }
        return new ExpansionPlacement(parent, snapToClaimEdge(parent, location));
    }

    /**
     * Find an owned/trusted claim whose rim is within {@code edge-tolerance-blocks}.
     * Deep-inside placements are rejected so expansions stay on the perimeter.
     */
    private ClaimRecord expansionParent(Player player, Location location) {
        ClaimRecord best = null;
        double bestDelta = Double.MAX_VALUE;
        for (ClaimRecord claim : store.all()) {
            if (location.getWorld() == null
                    || !claim.key().world().equals(location.getWorld().getName())
                    || !canUseForExpansion(player, claim)) {
                continue;
            }
            double distance = claim.horizontalDistance(location.getX(), location.getZ());
            double delta = Math.abs(distance - claim.radiusBlocks());
            if (delta <= plugin.edgeToleranceBlocks() && delta < bestDelta) {
                best = claim;
                bestDelta = delta;
            }
        }
        return best;
    }

    /** Place the new anchor exactly on the parent claim's circumference toward the player. */
    private static Location snapToClaimEdge(ClaimRecord parent, Location from) {
        double cx = parent.key().x();
        double cz = parent.key().z();
        double dx = from.getX() - cx;
        double dz = from.getZ() - cz;
        double dist = Math.hypot(dx, dz);
        double nx;
        double nz;
        if (dist < 1.0e-4) {
            double yaw = Math.toRadians(from.getYaw());
            nx = -Math.sin(yaw);
            nz = Math.cos(yaw);
        } else {
            nx = dx / dist;
            nz = dz / dist;
        }
        double radius = parent.radiusBlocks();
        int sx = (int) Math.round(cx + nx * radius);
        int sz = (int) Math.round(cz + nz * radius);
        Location snapped = from.clone();
        snapped.setX(sx + 0.5);
        snapped.setZ(sz + 0.5);
        return snapped;
    }

    private record ExpansionPlacement(ClaimRecord parent, Location snapped) {}

    /**
     * Blocks strangers from placing a claim circle that intersects another claim
     * or that claim's outward territory band. Allies (owner/trusted) are exempt.
     */
    private ClaimRecord overlappingOtherClaimOrTerritory(Player player, Location location, int radius) {
        int buffer = plugin.territoryBufferBlocks();
        for (ClaimRecord claim : store.all()) {
            if (!claim.key().world().equals(location.getWorld().getName()) || isAllied(player, claim)) {
                continue;
            }
            double distance = claim.horizontalDistance(location.getBlockX(), location.getBlockZ());
            if (distance < radius + claim.radiusBlocks() + buffer) {
                return claim;
            }
        }
        return null;
    }

    public boolean isAdmin(Player player) {
        return player != null
                && (player.isOp()
                || player.hasPermission("rootclaims.admin")
                || player.hasPermission("rootclaims.bypass")
                || player.hasPermission("group.admin"));
    }

    public enum Status {
        OK,
        OK_REFUND_FAILED,
        OK_REFUND_BANK,
        DISABLED,
        ALREADY_CLAIMED,
        NEEDS_EDGE,
        NEEDS_AREA,
        OVERLAPS_OTHER,
        FOREIGN_TERRITORY,
        NOT_CLAIMED,
        NOT_OWNER,
        OUTSIDE_CLAIM,
        LIMIT_REACHED,
        AREA_LIMIT,
        AREA_LOCKED,
        AREA_LEVEL_MAX,
        NAME_TAKEN,
        HAS_CHILDREN,
        NO_ECONOMY,
        CANNOT_AFFORD,
        CHARGE_FAILED,
        CLAIM_BANK_CANNOT_AFFORD,
        CLAIM_BANK_CHARGE_FAILED
    }

    public record Result(Status status, ClaimRecord claim, double amount, int count, int limit, double secondaryAmount) {
        public Result(Status status, ClaimRecord claim, double amount, int count, int limit) {
            this(status, claim, amount, count, limit, 0);
        }

        static Result simple(Status status) {
            return new Result(status, null, 0, 0, 0, 0);
        }
    }
}
