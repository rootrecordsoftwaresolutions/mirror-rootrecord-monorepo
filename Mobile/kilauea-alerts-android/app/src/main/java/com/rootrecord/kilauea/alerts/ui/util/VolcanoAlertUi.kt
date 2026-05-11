package com.rootrecord.kilauea.alerts.ui.util

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Shown when USGS data does not indicate elevated volcano alert levels (incl. ambiguous/downgraded periods). */
const val NO_HAZARDOUS_VOLCANO_ALERTS_MESSAGE = "No Hazardous Alerts Currently."

private fun isCalmVolcanoAlertToken(token: String): Boolean {
    val t = token.trim().uppercase()
    return when (t) {
        "NORMAL", "GREEN", "UNASSIGNED", "NONE", "NOT_APPLICABLE", "N/A", "OK" -> true
        else -> false
    }
}

/**
 * Maps merged USGS HANS JSON (`volcano` + `newest` siblings) to a short hero label.
 * Uses [NO_HAZARDOUS_VOLCANO_ALERTS_MESSAGE] when levels are calm/unknown instead of directing users to the Alerts tab.
 */
fun extractVolcanoAlertLevel(bundle: JsonObject): String {
    val volcano = bundle["volcano"]?.jsonObject
    val newest = bundle["newest"]?.jsonObject

    fun pickPrimitive(o: JsonObject?, keys: List<String>): String? {
        if (o == null) return null
        for (k in keys) {
            val v = o[k] as? JsonPrimitive ?: continue
            v.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        }
        return null
    }

    fun calmOrElse(label: String): String =
        if (isCalmVolcanoAlertToken(label)) NO_HAZARDOUS_VOLCANO_ALERTS_MESSAGE else label

    pickPrimitive(
        volcano,
        listOf(
            "volcanoAlertLevel",
            "alertLevel",
            "currentVolcanoAlertLevel",
            "VolcanoAlertLevel",
        ),
    )?.let { return calmOrElse(it) }

    pickPrimitive(newest, listOf("volcanoAlertLevel", "alertLevel", "currentVolcanoAlertLevel"))?.let { return calmOrElse(it) }

    newest?.get("noticeHtml")?.jsonPrimitive?.contentOrNull?.let { html ->
        val plain = stripHtmlTags(html)
        Regex(
            "Current Volcano Alert Level:\\s*([A-Za-z]+)",
            RegexOption.IGNORE_CASE,
        ).find(plain)?.groupValues?.getOrNull(1)?.trim()?.uppercase()?.let { return calmOrElse(it) }
        Regex("Volcano Alert Level:\\s*([A-Za-z]+)", RegexOption.IGNORE_CASE).find(plain)?.groupValues?.getOrNull(1)
            ?.trim()?.uppercase()?.let { return calmOrElse(it) }
    }

    volcano?.get("colorCode")?.jsonPrimitive?.contentOrNull?.let { return "Aviation color $it" }

    volcano?.get("nvews_threat")?.jsonPrimitive?.contentOrNull?.let { return "Threat: $it" }

    return NO_HAZARDOUS_VOLCANO_ALERTS_MESSAGE
}

/** One-line status from newest notice for Home subtitle. */
fun extractVolcanoHeroSubtitle(bundle: JsonObject): String? {
    val newest = bundle["newest"]?.jsonObject ?: return null
    val html = newest["noticeHtml"]?.jsonPrimitive?.contentOrNull ?: return null
    val plain = stripHtmlTags(html)
    val sentence = plain.split(". ").firstOrNull()?.trim()?.take(140) ?: plain.take(140)
    return sentence.takeIf { it.isNotBlank() }
}

/** Readable excerpt for Alerts tab (no raw JsonObject.toString()). */
fun formatUsgsNewestForAlerts(newest: JsonElement?): String {
    when (newest) {
        null -> return "—"
        is JsonObject -> {
            val html = newest["noticeHtml"]?.jsonPrimitive?.contentOrNull
            if (html != null) {
                val plain = stripHtmlTags(html)
                return plain.take(1800).trim()
            }
            val title = newest["title"]?.jsonPrimitive?.contentOrNull
                ?: newest["noticeTitle"]?.jsonPrimitive?.contentOrNull
            val body = newest["noticeText"]?.jsonPrimitive?.contentOrNull
                ?: newest["text"]?.jsonPrimitive?.contentOrNull
            return listOfNotNull(title, body?.take(1200)).joinToString("\n\n").ifBlank { "—" }
        }
        is JsonPrimitive -> {
            val raw = newest.contentOrNull ?: return "—"
            return stripHtmlTags(raw).take(1800).trim().ifBlank { "—" }
        }
        else -> return "—"
    }
}
