package com.rootrecord.kilauea.alerts.data.repository

import com.rootrecord.kilauea.alerts.BuildConfig
import com.rootrecord.kilauea.alerts.data.local.KilaueaDataDao
import com.rootrecord.kilauea.alerts.data.local.KilaueaDataEntity
import com.rootrecord.kilauea.alerts.data.local.KilaueaPreferences
import com.rootrecord.kilauea.alerts.data.remote.AppJson
import com.rootrecord.kilauea.alerts.domain.LiveFeed
import com.rootrecord.kilauea.alerts.domain.LiveFeedsCatalog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

@Singleton
class LiveFeedsRepository @Inject constructor(
    private val dao: KilaueaDataDao,
    private val prefs: KilaueaPreferences,
    @Named("public") private val http: OkHttpClient,
) {

    suspend fun cachedCatalog(): LiveFeedsCatalog? {
        val raw = dao.getByKey(CacheKeys.LIVE_FEEDS_MERGED)?.payloadJson ?: return null
        return runCatching { AppJson.decodeFromString(LiveFeedsCatalog.serializer(), raw) }.getOrNull()
    }

    suspend fun refreshMergedCatalog(): Result<LiveFeedsCatalog> = withContext(Dispatchers.IO) {
        runCatching {
            val seeds = defaultSeeds().toMutableList()
            fetchYoutubeAugments()?.let { seeds.addAll(it) }
            val dedup = seeds.distinctBy { it.id }
            val json = AppJson.encodeToString(
                ListSerializer(LiveFeed.serializer()),
                dedup,
            )
            val sha = sha256Hex(json)
            val merged = LiveFeedsCatalog(
                feeds = dedup,
                syncedAtEpochMs = System.currentTimeMillis(),
                contentSha256 = sha,
            )
            val prev = cachedCatalog()
            dao.upsert(
                KilaueaDataEntity(
                    cacheKey = CacheKeys.LIVE_FEEDS_MERGED,
                    payloadJson = AppJson.encodeToString(LiveFeedsCatalog.serializer(), merged),
                    fetchedAtEpochMs = merged.syncedAtEpochMs,
                    sourceUrl = "https://www.usgs.gov/volcanoes/kilauea/webcams",
                ),
            )
            if (prev != null && merged.feeds.any { f -> prev.feeds.none { it.id == f.id } }) {
                prefs.setLiveFeedsNewBadge(true)
            }
            merged
        }
    }

    suspend fun offlineFirst(force: Boolean): Result<LiveFeedsCatalog> {
        if (!force) {
            cachedCatalog()?.let { return Result.success(it) }
        }
        return refreshMergedCatalog()
    }

    suspend fun clearNewBadge() {
        prefs.setLiveFeedsNewBadge(false)
    }

    /** Optional YouTube Data API v3 search when [BuildConfig.YOUTUBE_API_KEY] is non-empty. */
    private suspend fun fetchYoutubeAugments(): List<LiveFeed>? {
        val key = BuildConfig.YOUTUBE_API_KEY.trim()
        if (key.isEmpty()) return null
        val channelId = "UCfdhgGlsoekErhdTRSzUkBw"
        val url =
            "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live&maxResults=10&channelId=$channelId&key=$key"
        return runCatching {
            val body = httpGet(url)
            val root = AppJson.parseToJsonElement(body) as JsonObject
            val items = root["items"] as? JsonArray ?: return@runCatching emptyList()
            items.mapNotNull { item ->
                val o = item as? JsonObject ?: return@mapNotNull null
                val id = o["id"] as? JsonObject ?: return@mapNotNull null
                val vid = id["videoId"]?.let { (it as JsonPrimitive).content } ?: return@mapNotNull null
                val snip = o["snippet"] as? JsonObject ?: return@mapNotNull null
                val title = (snip["title"] as? JsonPrimitive)?.content ?: vid
                val desc = (snip["description"] as? JsonPrimitive)?.content ?: ""
                LiveFeed(
                    id = "yt_$vid",
                    title = title,
                    description = desc.take(240),
                    youtubeVideoId = vid,
                    watchUrl = "https://www.youtube.com/watch?v=$vid",
                    thumbnailUrl = (snip["thumbnails"] as? JsonObject)?.let { th ->
                        (th["high"] as? JsonObject)?.let { h ->
                            (h["url"] as? JsonPrimitive)?.content
                        }
                    },
                )
            }
        }.getOrNull()
    }

    private suspend fun httpGet(url: String): String =
        withContext(Dispatchers.IO) {
            http.newCall(Request.Builder().url(url).get().build()).execute().use { r ->
                if (!r.isSuccessful) error("yt_${r.code}")
                r.body?.string().orEmpty()
            }
        }

    private fun sha256Hex(s: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        val bytes = md.digest(s.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        /** Static seeds aligned with official USGS Kīlauea webcam inventory — links resolve on device. */
        fun defaultSeeds(): List<LiveFeed> = listOf(
            LiveFeed(
                id = "usgs_kilauea_webcams_portal",
                title = "USGS Kīlauea webcams (official)",
                description = "Directory of official USGS summit and rift cameras.",
                youtubeVideoId = null,
                watchUrl = "https://www.usgs.gov/volcanoes/kilauea/webcams",
                thumbnailUrl = null,
            ),
            LiveFeed(
                id = "v1cam_west_halema",
                title = "[V1cam] West Halemaʻumaʻu",
                description = "Summit thermal/visual feeds rotate on the USGS webcams page.",
                youtubeVideoId = null,
                watchUrl = "https://www.usgs.gov/volcanoes/kilauea/webcams",
            ),
            LiveFeed(
                id = "v2cam_north_halema",
                title = "[V2cam] North Halemaʻumaʻu",
                description = "Summit area monitoring — see live playlist on official USGS streams.",
                youtubeVideoId = null,
                watchUrl = "https://www.usgs.gov/volcanoes/kilauea/webcams",
            ),
            LiveFeed(
                id = "v3cam_lava_lake",
                title = "[V3cam] Halemaʻumaʻu lava lake",
                description = "When active, streams are linked from the official webcams page.",
                youtubeVideoId = null,
                watchUrl = "https://www.usgs.gov/volcanoes/kilauea/webcams",
            ),
        )
    }
}
