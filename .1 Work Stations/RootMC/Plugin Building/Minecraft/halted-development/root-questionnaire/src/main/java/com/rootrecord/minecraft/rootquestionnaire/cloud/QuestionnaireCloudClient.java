package com.rootrecord.minecraft.rootquestionnaire.cloud;

import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

public final class QuestionnaireCloudClient {

    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();
    private final RootRecordCloudConfig.CloudSettings settings;

    public QuestionnaireCloudClient(RootRecordCloudConfig.CloudSettings settings) {
        this.settings = settings;
    }

    public boolean hasCredentials() {
        return settings.hasServerCredentials();
    }

    public void submitQuestionnaire(
            String uuid,
            String username,
            String world,
            List<AnswerEntry> answers) throws IOException, InterruptedException {
        StringBuilder answersJson = new StringBuilder("[");
        for (int i = 0; i < answers.size(); i++) {
            if (i > 0) {
                answersJson.append(',');
            }
            AnswerEntry entry = answers.get(i);
            answersJson.append("{\"id\":\"")
                    .append(escapeJson(entry.id()))
                    .append("\",\"question\":\"")
                    .append(escapeJson(entry.question()))
                    .append("\",\"answer\":\"")
                    .append(escapeJson(entry.answer()))
                    .append("\"}");
        }
        answersJson.append(']');

        String body = "{\"uuid\":\"" + escapeJson(uuid)
                + "\",\"username\":\"" + escapeJson(username)
                + "\",\"world\":\"" + escapeJson(world == null ? "" : world)
                + "\",\"answers\":" + answersJson + "}";
        post("/api/rootmc/ingame-questionnaire", body);
    }

    private void post(String path, String jsonBody) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(settings.apiBase() + path))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("X-RootStat-Server-Id", settings.serverId())
                .header("X-RootStat-Server-Secret", settings.serverSecret())
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IOException("HTTP " + response.statusCode());
        }
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    public record AnswerEntry(String id, String question, String answer) {}
}
