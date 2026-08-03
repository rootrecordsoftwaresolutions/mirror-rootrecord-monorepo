package com.rootrecord.minecraft.rootquestionnaire.session;

import com.rootrecord.minecraft.rootquestionnaire.model.SurveyQuestion;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public final class QuestionnaireSession {

    private final UUID playerId;
    private int questionIndex;
    private boolean followUp;
    private final Map<String, String> answers = new LinkedHashMap<>();
    private long lastActivityAt;

    public QuestionnaireSession(UUID playerId) {
        this.playerId = playerId;
        touch();
    }

    public UUID playerId() {
        return playerId;
    }

    public int questionIndex() {
        return questionIndex;
    }

    public boolean inFollowUp() {
        return followUp;
    }

    public Map<String, String> answers() {
        return Map.copyOf(answers);
    }

    public long lastActivityAt() {
        return lastActivityAt;
    }

    public void touch() {
        lastActivityAt = System.currentTimeMillis();
    }

    public SurveyQuestion currentQuestion() {
        return com.rootrecord.minecraft.rootquestionnaire.model.QuestionnaireCatalog.questions().get(questionIndex);
    }

    public void recordAnswer(String key, String value) {
        answers.put(key, value);
        touch();
    }

    public void beginFollowUp() {
        followUp = true;
        touch();
    }

    public void endFollowUpAndAdvance() {
        followUp = false;
        questionIndex++;
        touch();
    }

    public void advance() {
        followUp = false;
        questionIndex++;
        touch();
    }

    public boolean isComplete() {
        return questionIndex >= com.rootrecord.minecraft.rootquestionnaire.model.QuestionnaireCatalog.totalQuestions();
    }
}
