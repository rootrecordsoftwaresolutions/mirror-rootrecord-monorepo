package com.rootrecord.minecraft.rootquestionnaire.model;

import java.util.List;

public record SurveyQuestion(
        String id,
        String label,
        String prompt,
        Type type,
        List<String> choices,
        String followUpPrompt) {

    public enum Type {
        OPEN,
        YES_NO,
        SCALE,
        CHOICE
    }

    public static SurveyQuestion open(String id, String label, String prompt) {
        return new SurveyQuestion(id, label, prompt, Type.OPEN, List.of(), null);
    }

    public static SurveyQuestion yesNo(String id, String label, String prompt, String followUpPrompt) {
        return new SurveyQuestion(id, label, prompt, Type.YES_NO, List.of(), followUpPrompt);
    }

    public static SurveyQuestion scale(String id, String label, String prompt) {
        return new SurveyQuestion(id, label, prompt, Type.SCALE, List.of(), null);
    }

    public static SurveyQuestion choice(String id, String label, String prompt, List<String> choices) {
        return new SurveyQuestion(id, label, prompt, Type.CHOICE, List.copyOf(choices), null);
    }
}
