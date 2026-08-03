package com.rootrecord.minecraft.rootquestionnaire.session;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class QuestionnaireSessionManager {

    private final Map<UUID, QuestionnaireSession> sessions = new ConcurrentHashMap<>();

    public QuestionnaireSession start(UUID playerId) {
        QuestionnaireSession session = new QuestionnaireSession(playerId);
        sessions.put(playerId, session);
        return session;
    }

    public QuestionnaireSession get(UUID playerId) {
        return sessions.get(playerId);
    }

    public QuestionnaireSession remove(UUID playerId) {
        return sessions.remove(playerId);
    }

    public boolean has(UUID playerId) {
        return sessions.containsKey(playerId);
    }
}
