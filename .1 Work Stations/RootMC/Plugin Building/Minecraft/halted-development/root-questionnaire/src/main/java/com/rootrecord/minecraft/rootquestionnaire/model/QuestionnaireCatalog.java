package com.rootrecord.minecraft.rootquestionnaire.model;

import java.util.List;

public final class QuestionnaireCatalog {

    private static final List<SurveyQuestion> QUESTIONS = List.of(
            SurveyQuestion.open(
                    "find_server",
                    "Where did you find our server?",
                    "&7Where did you find our server?"),
            SurveyQuestion.yesNo(
                    "towny_before",
                    "Played Towny before?",
                    "&7Have you played on a Towny server before? &8(yes/no)",
                    "&7Tell us more about your Towny experience &8(optional — type &fskip&8 to skip)"),
            SurveyQuestion.open(
                    "honest_opinion",
                    "Honest opinion",
                    "&7Give us an honest opinion of the server."),
            SurveyQuestion.open(
                    "recommendations",
                    "Recommendations",
                    "&7Anything you would recommend?"),
            SurveyQuestion.open(
                    "playstyle",
                    "Playstyle",
                    "&7What kind of Minecraft playstyle do you enjoy most? "
                            + "&8(Survival, Building, Economy, PvP, Exploration, Redstone, etc.)"),
            SurveyQuestion.open(
                    "towny_interest",
                    "Towny interest",
                    "&7How did you hear about Towny servers or what made you want to try one?"),
            SurveyQuestion.choice(
                    "age_range",
                    "Age range (optional)",
                    "&7How old are you? &8(optional — type &f13-17&8, &f18-24&8, &f25+&8, or &fskip&8)",
                    List.of("13-17", "18-24", "25+", "skip")),
            SurveyQuestion.open(
                    "like_most",
                    "Like most",
                    "&7What do you like most about RootMC so far?"),
            SurveyQuestion.open(
                    "like_least",
                    "Needs improvement",
                    "&7What do you like least or think needs improvement?"),
            SurveyQuestion.scale(
                    "recommend_scale",
                    "Recommend 1-10",
                    "&7On a scale of 1-10, how likely are you to recommend RootMC to a friend? "
                            + "&8(1 = not at all, 10 = definitely)"),
            SurveyQuestion.open(
                    "economy_feedback",
                    "Economy / shops",
                    "&7What do you think of the economy / shop system so far?"),
            SurveyQuestion.open(
                    "tax_death_feedback",
                    "Tax / death / refund",
                    "&7How do you feel about the tax / death rewards / refund features?"),
            SurveyQuestion.choice(
                    "town_plans",
                    "Town plans",
                    "&7Are you planning to join or create a town?",
                    List.of("Yes", "Maybe", "Solo for now")),
            SurveyQuestion.open(
                    "excited_features",
                    "Excited features",
                    "&7Any plugins or features you are most excited about? "
                            + "&8(e.g. custom economy, territories, etc.)"),
            SurveyQuestion.open(
                    "community_welcoming",
                    "Community welcoming",
                    "&7How welcoming did the community feel?"),
            SurveyQuestion.open(
                    "retention",
                    "Long-term play",
                    "&7What would make you want to keep playing long-term?"),
            SurveyQuestion.open(
                    "technical_issues",
                    "Bugs / lag",
                    "&7Any bugs, lag, or technical issues you have noticed?"),
            SurveyQuestion.open(
                    "final_notes",
                    "Final notes",
                    "&7Anything else you want the RootMC team to know?"));

    private QuestionnaireCatalog() {}

    public static List<SurveyQuestion> questions() {
        return QUESTIONS;
    }

    public static int totalQuestions() {
        return QUESTIONS.size();
    }
}
