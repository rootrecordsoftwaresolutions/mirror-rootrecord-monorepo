package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.BuildConfig
import com.rootrecord.blocknotes.data.repository.BLOCKNOTES_APP_ID
import com.rootrecord.blocknotes.data.remote.AppJson
import com.rootrecord.blocknotes.di.IoDispatcher
import com.rootrecord.blocknotes.di.ROOTRECORD_BLOCKNOTES_BASE
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

data class McMMOStats(
    val powerLevel: Int,
    val skills: Map<String, Int>,
    val syncedAt: String?,
    val minecraftUsername: String?,
)

data class PlaytimeStats(
    val totalSeconds: Long,
    val firstJoinAt: String?,
    val lastLoginAt: String?,
)

data class FeaturedServerConfig(
    val serverId: String,
    val name: String,
    val address: String,
    val defaultWorldName: String,
    val gameVersion: String,
    val mapUrl: String?,
    val verifyUrl: String,
    val realmUrl: String,
    val featured: Boolean = false,
    val connected: Boolean = true,
    val blocknotesPluginInstalled: Boolean,
    val blocknotesPluginVersion: String?,
    val rootstatActive: Boolean = false,
    val mcmmo: McMMOStats? = null,
    val playtime: PlaytimeStats? = null,
    val belongsToServer: Boolean = false,
    val autoAddWorld: Boolean = false,
)

data class ServerMembership(
    val accountId: String,
    val rootstatLinked: Boolean,
    val minecraftUsername: String?,
    val minecraftUuid: String?,
    val verifiedAt: String?,
    val servers: List<FeaturedServerConfig>,
    val featuredServer: FeaturedServerConfig?,
)

@Singleton
class ServerRepository @Inject constructor(
    @param:Named("rootrecord") private val http: OkHttpClient,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun fetchFeaturedServers(): Result<List<FeaturedServerConfig>> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/server/featured")
            val servers = AppJson.parseToJsonElement(text).jsonObject["servers"]?.jsonArray
                ?: throw IllegalStateException("missing_servers")
            servers.map { parseFeaturedServer(it.jsonObject) }
        }.recoverCatching {
            listOf(fallbackFeaturedServer())
        }
    }

    suspend fun fetchFeaturedServerConfig(): Result<FeaturedServerConfig> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/server/config")
            val server = AppJson.parseToJsonElement(text).jsonObject["featured_server"]?.jsonObject
                ?: throw IllegalStateException("missing_featured_server")
            parseFeaturedServer(server)
        }.recoverCatching {
            fallbackFeaturedServer()
        }
    }

    suspend fun fetchMembership(): Result<ServerMembership> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/server/membership")
            parseMembership(AppJson.parseToJsonElement(text).jsonObject)
        }
    }

    suspend fun fetchMyMcmmoOnServer(serverId: String): Result<McMMOStats?> = withContext(io) {
        runCatching {
            val encoded = java.net.URLEncoder.encode(serverId, Charsets.UTF_8.name())
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/server/$encoded/mcmmo/me")
            val root = AppJson.parseToJsonElement(text).jsonObject
            parseMcmmo(root["mcmmo"]?.jsonObject)
        }
    }

    suspend fun fetchMobileFeaturedServer(): Result<FeaturedServerConfig> = withContext(io) {
        runCatching {
            val url = "${ROOTRECORD_BLOCKNOTES_BASE}api/mobile/config".toHttpUrl()
            val text = get(url.toString())
            val root = AppJson.parseToJsonElement(text).jsonObject
            val server = root["featured_server"]?.jsonObject
            if (server != null) {
                parseFeaturedServer(server)
            } else {
                fetchFeaturedServerConfig().getOrThrow()
            }
        }.recoverCatching {
            fallbackFeaturedServer()
        }
    }

    private fun parseFeaturedServer(o: JsonObject): FeaturedServerConfig =
        FeaturedServerConfig(
            serverId = o.string("server_id").ifBlank { "rootrecord-smp" },
            name = o.string("name").ifBlank { "RootRecord SMP" },
            address = o.string("address").ifBlank { FALLBACK_ADDRESS },
            defaultWorldName = o.string("default_world_name").ifBlank { "RootRecord SMP" },
            gameVersion = o.string("game_version").ifBlank { "26.1" },
            mapUrl = o.stringOrNull("map_url"),
            verifyUrl = o.string("verify_url").ifBlank { VERIFY_URL },
            realmUrl = o.string("realm_url").ifBlank { REALM_URL },
            featured = o["featured"]?.jsonPrimitive?.booleanOrNull == true,
            connected = o["connected"]?.jsonPrimitive?.booleanOrNull != false,
            blocknotesPluginInstalled = o["blocknotes_plugin_installed"]?.jsonPrimitive?.booleanOrNull == true,
            blocknotesPluginVersion = o.stringOrNull("blocknotes_plugin_version"),
            rootstatActive = o["rootstat_active"]?.jsonPrimitive?.booleanOrNull == true,
            mcmmo = parseMcmmo(o["mcmmo"]?.jsonObject),
            playtime = parsePlaytime(o["playtime"]?.jsonObject),
            belongsToServer = o["belongs_to_server"]?.jsonPrimitive?.booleanOrNull == true,
            autoAddWorld = o["auto_add_world"]?.jsonPrimitive?.booleanOrNull == true,
        )

    private fun parsePlaytime(o: JsonObject?): PlaytimeStats? {
        if (o == null) return null
        val total = o["total_playtime_seconds"]?.jsonPrimitive?.longOrNull
            ?: o["total_seconds"]?.jsonPrimitive?.longOrNull
        if ((total == null || total <= 0L) && o.stringOrNull("first_join_at") == null) {
            return null
        }
        return PlaytimeStats(
            totalSeconds = total ?: 0L,
            firstJoinAt = o.stringOrNull("first_join_at"),
            lastLoginAt = o.stringOrNull("last_login_at"),
        )
    }

    private fun parseMcmmo(o: JsonObject?): McMMOStats? {
        if (o == null) return null
        val skillsObj = o["skills"]?.jsonObject
        val skills = skillsObj?.entries?.associate { (key, value) ->
            key to (value.jsonPrimitive.intOrNull ?: 0)
        }.orEmpty()
        val power = o["power_level"]?.jsonPrimitive?.intOrNull ?: skills.values.sum()
        if (power <= 0 && skills.isEmpty()) return null
        return McMMOStats(
            powerLevel = power,
            skills = skills,
            syncedAt = o.stringOrNull("synced_at"),
            minecraftUsername = o.stringOrNull("minecraft_username"),
        )
    }

    private fun parseMembership(o: JsonObject): ServerMembership {
        val serversArray = o["servers"]?.jsonArray
        val servers = if (serversArray != null) {
            serversArray.map { parseFeaturedServer(it.jsonObject) }
        } else {
            val featured = o["featured_server"]?.jsonObject
            if (featured != null) listOf(parseFeaturedServer(featured)) else emptyList()
        }
        val featured = o["featured_server"]?.jsonObject?.let { parseFeaturedServer(it) }
            ?: servers.firstOrNull { it.featured }
            ?: servers.firstOrNull()
        return ServerMembership(
            accountId = o.string("account_id"),
            rootstatLinked = o["rootstat_linked"]?.jsonPrimitive?.booleanOrNull == true,
            minecraftUsername = o.stringOrNull("minecraft_username"),
            minecraftUuid = o.stringOrNull("minecraft_uuid"),
            verifiedAt = o.stringOrNull("verified_at"),
            servers = servers,
            featuredServer = featured,
        )
    }

    private fun get(url: String): String {
        val req = Request.Builder()
            .url(url)
            .get()
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
            .build()
        return http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw apiError(text, resp.code)
            text
        }
    }

    private fun apiError(text: String, code: Int): Throwable {
        val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
        val detail = root?.get("detail")?.jsonPrimitive?.contentOrNull
        return IllegalStateException(detail ?: "server_api_$code")
    }

    private fun fallbackFeaturedServer() = FeaturedServerConfig(
        serverId = "rootrecord-smp",
        name = "RootRecord SMP",
        address = FALLBACK_ADDRESS,
        defaultWorldName = "RootRecord SMP",
        gameVersion = "26.1",
        mapUrl = null,
        verifyUrl = VERIFY_URL,
        realmUrl = REALM_URL,
        featured = true,
        connected = true,
        blocknotesPluginInstalled = false,
        blocknotesPluginVersion = null,
        rootstatActive = false,
    )

    private companion object {
        const val FALLBACK_ADDRESS = "15.204.13.9:25565"
        const val VERIFY_URL = "https://rootrecord.info/realm/verify"
        const val REALM_URL = "https://rootrecord.info/realm/"
    }
}

private fun JsonObject.string(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.stringOrNull(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
