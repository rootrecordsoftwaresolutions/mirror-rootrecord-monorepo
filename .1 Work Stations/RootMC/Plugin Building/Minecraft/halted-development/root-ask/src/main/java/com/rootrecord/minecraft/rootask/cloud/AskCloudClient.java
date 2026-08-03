package com.rootrecord.minecraft.rootask.cloud;



import com.rootrecord.minecraft.common.config.RootRecordCloudConfig;



import java.io.IOException;

import java.net.URI;

import java.net.http.HttpClient;

import java.net.http.HttpRequest;

import java.net.http.HttpResponse;

import java.time.Duration;

import java.util.ArrayList;

import java.util.List;

import java.util.regex.Matcher;

import java.util.regex.Pattern;



public final class AskCloudClient {



    private static final Pattern JSON_STRING = Pattern.compile("\"((?:\\\\.|[^\"\\\\])*)\"");

    private static final Pattern LINES_ARRAY =

            Pattern.compile("\"lines\"\\s*:\\s*\\[(.*?)\\]", Pattern.DOTALL);

    private static final Pattern LINK_URL =

            Pattern.compile("\"link_url\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");

    private static final Pattern TURN_ID =

            Pattern.compile("\"turn_id\"\\s*:\\s*(\\d+|null)");

    private static final Pattern ACTION =

            Pattern.compile("\"action\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");



    private final HttpClient http =

            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(12)).build();

    private final RootRecordCloudConfig.CloudSettings settings;



    public AskCloudClient(RootRecordCloudConfig.CloudSettings settings) {

        this.settings = settings;

    }



    public boolean hasCredentials() {

        return settings.hasServerCredentials();

    }



    public AskResponse ask(String uuid, String username, String world, String question)

            throws IOException, InterruptedException {

        String body = "{\"uuid\":\"" + escapeJson(uuid)

                + "\",\"username\":\"" + escapeJson(username)

                + "\",\"world\":\"" + escapeJson(world == null ? "" : world)

                + "\",\"question\":\"" + escapeJson(question) + "\"}";

        HttpRequest request = authorized(HttpRequest.newBuilder()

                .uri(URI.create(settings.apiBase() + "/api/rootmc/ingame-ask"))

                .timeout(Duration.ofSeconds(45))

                .header("Content-Type", "application/json")

                .POST(HttpRequest.BodyPublishers.ofString(body)));

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());

        String json = response.body() == null ? "" : response.body();

        if (response.statusCode() == 429) {

            return AskResponse.quota(extractMessage(json));

        }

        if (response.statusCode() >= 400) {

            return AskResponse.error(extractMessage(json));

        }

        List<String> lines = parseLines(json);

        String link = parseLink(json);

        long turnId = parseTurnId(json);

        boolean duplicate = parseBool(json, "duplicate");

        boolean needsFeedback = parseBool(json, "needs_feedback");

        return AskResponse.success(lines, link, turnId, duplicate, needsFeedback);

    }



    public FeedbackResponse feedback(String uuid, String username, long turnId, String feedback)

            throws IOException, InterruptedException {

        String body = "{\"uuid\":\"" + escapeJson(uuid)

                + "\",\"username\":\"" + escapeJson(username)

                + "\",\"turn_id\":" + turnId

                + ",\"feedback\":\"" + escapeJson(feedback) + "\"}";

        HttpRequest request = authorized(HttpRequest.newBuilder()

                .uri(URI.create(settings.apiBase() + "/api/rootmc/ingame-ask/feedback"))

                .timeout(Duration.ofSeconds(45))

                .header("Content-Type", "application/json")

                .POST(HttpRequest.BodyPublishers.ofString(body)));

        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());

        String json = response.body() == null ? "" : response.body();

        if (response.statusCode() >= 400) {

            return FeedbackResponse.error(extractMessage(json));

        }

        String action = parseAction(json);

        List<String> lines = parseLines(json);

        String link = parseLink(json);

        long newTurnId = parseTurnId(json);

        boolean needsFeedback = parseBool(json, "needs_feedback");

        return FeedbackResponse.success(action, lines, link, newTurnId, needsFeedback);

    }



    private HttpRequest authorized(HttpRequest.Builder builder) {

        return builder

                .header("X-RootStat-Server-Id", settings.serverId())

                .header("X-RootStat-Server-Secret", settings.serverSecret())

                .build();

    }



    private static List<String> parseLines(String json) {

        List<String> out = new ArrayList<>();

        Matcher arr = LINES_ARRAY.matcher(json);

        if (!arr.find()) {

            return out;

        }

        Matcher m = JSON_STRING.matcher(arr.group(1));

        while (m.find()) {

            String line = unescapeJson(m.group(1)).trim();

            if (!line.isEmpty()) {

                out.add(line);

            }

        }

        return out;

    }



    private static String parseLink(String json) {

        Matcher m = LINK_URL.matcher(json);

        if (!m.find()) {

            return null;

        }

        String link = unescapeJson(m.group(1)).trim();

        return link.isEmpty() ? null : link;

    }



    private static long parseTurnId(String json) {

        Matcher m = TURN_ID.matcher(json);

        if (!m.find()) {

            return 0L;

        }

        String raw = m.group(1);

        if ("null".equals(raw)) {

            return 0L;

        }

        try {

            return Long.parseLong(raw);

        } catch (NumberFormatException ex) {

            return 0L;

        }

    }



    private static boolean parseBool(String json, String field) {

        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*(true|false)").matcher(json);

        if (!m.find()) {

            return false;

        }

        return "true".equals(m.group(1));

    }



    private static String parseAction(String json) {

        Matcher m = ACTION.matcher(json);

        if (!m.find()) {

            return "";

        }

        return unescapeJson(m.group(1));

    }



    private static String extractMessage(String json) {

        Matcher m = Pattern.compile("\"message\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"").matcher(json);

        if (m.find()) {

            return unescapeJson(m.group(1));

        }

        Matcher d = Pattern.compile("\"detail\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"").matcher(json);

        if (d.find()) {

            return unescapeJson(d.group(1));

        }

        return "HTTP error";

    }



    private static String unescapeJson(String value) {

        return value

                .replace("\\n", "\n")

                .replace("\\r", "\r")

                .replace("\\t", "\t")

                .replace("\\\"", "\"")

                .replace("\\\\", "\\");

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



    public record AskResponse(

            boolean ok,

            List<String> lines,

            String linkUrl,

            long turnId,

            boolean duplicate,

            boolean needsFeedback,

            String errorMessage,

            boolean quota) {



        static AskResponse success(

                List<String> lines,

                String linkUrl,

                long turnId,

                boolean duplicate,

                boolean needsFeedback) {

            return new AskResponse(true, lines, linkUrl, turnId, duplicate, needsFeedback, null, false);

        }



        static AskResponse error(String message) {

            return new AskResponse(false, List.of(), null, 0L, false, false, message, false);

        }



        static AskResponse quota(String message) {

            return new AskResponse(false, List.of(), null, 0L, false, false, message, true);

        }

    }



    public record FeedbackResponse(

            boolean ok,

            String action,

            List<String> lines,

            String linkUrl,

            long turnId,

            boolean needsFeedback,

            String errorMessage) {



        static FeedbackResponse success(

                String action,

                List<String> lines,

                String linkUrl,

                long turnId,

                boolean needsFeedback) {

            return new FeedbackResponse(true, action, lines, linkUrl, turnId, needsFeedback, null);

        }



        static FeedbackResponse error(String message) {

            return new FeedbackResponse(false, "", List.of(), null, 0L, false, message);

        }

    }

}

