package com.rootrecord.kilauea.alerts.data.repository

object CacheKeys {
    const val VOLCANO_KILAUEA = "volcano_kilauea"
    const val EARTHQUAKES_FDSN = "earthquakes_fdsn"
    const val NWS_ALERTS_HI = "nws_alerts_hi"
    const val LIVE_FEEDS_MERGED = "live_feeds_merged"
    const val USGS_MESSAGES_RECENT = "usgs_messages_recent"
    /** EPA AQS daily summaries (Big Island) — JSON from Worker `/api/aqs/hawaii-county-daily`. */
    const val AQS_HAWAII_COUNTY_DAILY = "aqs_hawaii_county_daily"
    /** AirNow current observations near Volcano Village — JSON from `/api/airnow/current`. */
    const val AIRNOW_CURRENT_VOLCANO = "airnow_current_volcano"

    fun dashboard(locationId: String) = "dashboard:$locationId"
}
