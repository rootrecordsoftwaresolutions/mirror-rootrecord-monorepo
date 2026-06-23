package com.rootrecord.minecraft.common;

import java.util.UUID;

/** Shared economy service for RootRecord plugins without Vault hard dependency. */
public interface RootMcEconomyService {

    double balance(UUID playerId);

    boolean has(UUID playerId, double amount);

    boolean withdraw(UUID playerId, double amount);

    void deposit(UUID playerId, double amount);

    /** Deposit player income; loan plugins may sweep part toward repayment before crediting wallet. */
    default void depositIncome(UUID playerId, double amount) {
        deposit(playerId, amount);
    }
}
