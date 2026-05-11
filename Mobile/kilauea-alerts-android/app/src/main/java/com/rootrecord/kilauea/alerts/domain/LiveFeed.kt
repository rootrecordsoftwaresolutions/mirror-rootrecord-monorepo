package com.rootrecord.kilauea.alerts.domain

import kotlinx.serialization.Serializable

@Serializable
data class LiveFeed(
    val id: String,
    val title: String,
    val description: String,
    /** When known — enables in-app YouTube player. */
    val youtubeVideoId: String? = null,
    /** Primary browser / app fallback (official USGS pages or streams). */
    val watchUrl: String,
    val thumbnailUrl: String? = null,
)
