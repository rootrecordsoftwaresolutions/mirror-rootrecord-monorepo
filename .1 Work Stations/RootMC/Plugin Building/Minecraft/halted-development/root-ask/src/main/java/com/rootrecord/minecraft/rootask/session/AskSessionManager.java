package com.rootrecord.minecraft.rootask.session;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class AskSessionManager {

    public enum Stage {
        FIRST_ANSWER,
        FOLLOWUP_ANSWER
    }

    public record Session(long turnId, Stage stage) {}

    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();

    public void startFeedback(UUID playerId, long turnId) {
        sessions.put(playerId, new Session(turnId, Stage.FIRST_ANSWER));
    }

    public void advanceToFollowup(UUID playerId, long followupTurnId) {
        sessions.put(playerId, new Session(followupTurnId, Stage.FOLLOWUP_ANSWER));
    }

    public Session activeSession(UUID playerId) {
        return sessions.get(playerId);
    }

    public void clear(UUID playerId) {
        sessions.remove(playerId);
    }

    public boolean hasActiveSession(UUID playerId) {
        return sessions.containsKey(playerId);
    }
}
