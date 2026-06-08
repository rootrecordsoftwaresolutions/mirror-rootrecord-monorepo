package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.BuildConfig
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

private val JsonMedia = "application/json; charset=utf-8".toMediaType()

data class RealmPlayerProfile(
    val accountId: String,
    val realmUsername: String?,
    val minecraftUsername: String?,
    val minecraftUuid: String?,
    val skinUrl: String?,
    val bio: String?,
    val avatarUrl: String?,
    val profileUrl: String?,
    val sharedWorlds: List<RealmSharedWorld>,
)

data class RealmSharedWorld(
    val worldKey: String,
    val worldName: String,
    val gameVersion: String?,
    val seed: String?,
    val noteCount: Int,
)

data class RealmUserSearchResult(
    val accountId: String,
    val realmUsername: String?,
    val minecraftUsername: String?,
    val avatarUrl: String?,
)

data class RealmFriend(
    val accountId: String,
    val realmUsername: String?,
    val minecraftUsername: String?,
    val avatarUrl: String?,
)

data class RealmGroup(
    val id: String,
    val name: String,
    val ownerAccountId: String,
    val role: String,
)

data class RealmGroupMessage(
    val id: String,
    val body: String,
    val senderAccountId: String,
    val realmUsername: String?,
    val createdAt: String,
)

data class RealmGroupLimits(
    val ownedMax: Int,
    val ownedCount: Int,
)

@Singleton
class RealmRepository @Inject constructor(
    @param:Named("rootrecord") private val http: OkHttpClient,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun fetchMyProfile(): Result<Pair<RealmPlayerProfile?, RealmGroupLimits>> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/profile/me")
            val root = AppJson.parseToJsonElement(text).jsonObject
            val limits = root["group_limits"]?.jsonObject
            val profile = root["profile"]?.jsonObject?.let { parseProfile(it) }
            val groupLimits = RealmGroupLimits(
                ownedMax = limits?.get("owned_max")?.jsonPrimitive?.intOrNull ?: 1,
                ownedCount = 0,
            )
            profile to groupLimits
        }
    }

    suspend fun syncProfile(bodyJson: String): Result<RealmPlayerProfile> = withContext(io) {
        runCatching {
            val text = put("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/profile/me", bodyJson)
            val root = AppJson.parseToJsonElement(text).jsonObject
            parseProfile(root["profile"]?.jsonObject ?: throw IllegalStateException("No profile returned"))
        }
    }

    suspend fun searchUsers(query: String): Result<List<RealmUserSearchResult>> = withContext(io) {
        runCatching {
            val url = "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/users/search".toHttpUrl()
                .newBuilder()
                .addQueryParameter("q", query.trim())
                .build()
            val text = get(url.toString())
            val users = AppJson.parseToJsonElement(text).jsonObject["users"]?.jsonArray.orEmpty()
            users.map { u ->
                val o = u.jsonObject
                RealmUserSearchResult(
                    accountId = o.string("account_id"),
                    realmUsername = o.stringOrNull("realm_username"),
                    minecraftUsername = o.stringOrNull("minecraft_username"),
                    avatarUrl = o.stringOrNull("avatar_url"),
                )
            }
        }
    }

    suspend fun listFriends(): Result<List<RealmFriend>> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/friends")
            AppJson.parseToJsonElement(text).jsonObject["friends"]?.jsonArray.orEmpty().map { f ->
                val o = f.jsonObject
                RealmFriend(
                    accountId = o.string("account_id"),
                    realmUsername = o.stringOrNull("realm_username"),
                    minecraftUsername = o.stringOrNull("minecraft_username"),
                    avatarUrl = o.stringOrNull("avatar_url"),
                )
            }
        }
    }

    suspend fun sendFriendRequest(realmUsername: String): Result<Unit> = withContext(io) {
        runCatching {
            post(
                "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/friends/request",
                """{"realm_username":${AppJson.encodeToString(kotlinx.serialization.serializer(), realmUsername)}}""",
            )
            Unit
        }
    }

    suspend fun respondFriendRequest(requestId: String, accept: Boolean): Result<Unit> = withContext(io) {
        runCatching {
            post(
                "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/friends/respond",
                """{"request_id":${AppJson.encodeToString(kotlinx.serialization.serializer(), requestId)},"action":${if (accept) "\"accept\"" else "\"decline\""}}""",
            )
            Unit
        }
    }

    suspend fun listGroups(): Result<Pair<List<RealmGroup>, RealmGroupLimits>> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/groups")
            val root = AppJson.parseToJsonElement(text).jsonObject
            val groups = root["groups"]?.jsonArray.orEmpty().map { g ->
                val o = g.jsonObject
                RealmGroup(
                    id = o.string("id"),
                    name = o.string("name"),
                    ownerAccountId = o.string("owner_account_id"),
                    role = o.string("role").ifBlank { "member" },
                )
            }
            val limits = RealmGroupLimits(
                ownedMax = root["owned_max"]?.jsonPrimitive?.intOrNull ?: 1,
                ownedCount = root["owned_count"]?.jsonPrimitive?.intOrNull ?: 0,
            )
            groups to limits
        }
    }

    suspend fun createGroup(name: String): Result<RealmGroup> = withContext(io) {
        runCatching {
            val text = post(
                "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/groups",
                """{"name":${AppJson.encodeToString(kotlinx.serialization.serializer(), name)}}""",
            )
            val o = AppJson.parseToJsonElement(text).jsonObject["group"]?.jsonObject
                ?: throw IllegalStateException("group_create_failed")
            RealmGroup(
                id = o.string("id"),
                name = o.string("name"),
                ownerAccountId = o.string("owner_account_id"),
                role = o.string("role").ifBlank { "owner" },
            )
        }
    }

    suspend fun inviteToGroup(groupId: String, realmUsername: String): Result<Unit> = withContext(io) {
        runCatching {
            post(
                "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/groups/$groupId/invite",
                """{"realm_username":${AppJson.encodeToString(kotlinx.serialization.serializer(), realmUsername)}}""",
            )
            Unit
        }
    }

    suspend fun listGroupMessages(groupId: String): Result<List<RealmGroupMessage>> = withContext(io) {
        runCatching {
            val text = get("${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/groups/$groupId/messages")
            AppJson.parseToJsonElement(text).jsonObject["messages"]?.jsonArray.orEmpty().map { m ->
                val o = m.jsonObject
                RealmGroupMessage(
                    id = o.string("id"),
                    body = o.string("body"),
                    senderAccountId = o.string("sender_account_id"),
                    realmUsername = o.stringOrNull("realm_username"),
                    createdAt = o.string("created_at"),
                )
            }
        }
    }

    suspend fun sendGroupMessage(groupId: String, body: String): Result<Unit> = withContext(io) {
        runCatching {
            post(
                "${ROOTRECORD_BLOCKNOTES_BASE}api/blocknotes/realm/groups/$groupId/messages",
                """{"body":${AppJson.encodeToString(kotlinx.serialization.serializer(), body)}}""",
            )
            Unit
        }
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

    private fun post(url: String, jsonBody: String): String {
        val req = Request.Builder()
            .url(url)
            .post(jsonBody.toRequestBody(JsonMedia))
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
            .build()
        return http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw apiError(text, resp.code)
            text
        }
    }

    private fun put(url: String, jsonBody: String): String {
        val req = Request.Builder()
            .url(url)
            .put(jsonBody.toRequestBody(JsonMedia))
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
            .build()
        return http.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw apiError(text, resp.code)
            text
        }
    }

    private fun parseProfile(o: JsonObject): RealmPlayerProfile {
        val worlds = o["shared_worlds"]?.jsonArray.orEmpty().map { w ->
            val wo = w.jsonObject
            RealmSharedWorld(
                worldKey = wo.string("world_key"),
                worldName = wo.string("world_name"),
                gameVersion = wo.stringOrNull("game_version"),
                seed = wo.stringOrNull("seed"),
                noteCount = wo["note_count"]?.jsonPrimitive?.intOrNull ?: 0,
            )
        }
        return RealmPlayerProfile(
            accountId = o.string("account_id"),
            realmUsername = o.stringOrNull("realm_username"),
            minecraftUsername = o.stringOrNull("minecraft_username"),
            minecraftUuid = o.stringOrNull("minecraft_uuid"),
            skinUrl = o.stringOrNull("skin_url"),
            bio = o.stringOrNull("bio"),
            avatarUrl = o.stringOrNull("avatar_url"),
            profileUrl = o.stringOrNull("profile_url"),
            sharedWorlds = worlds,
        )
    }

    private fun apiError(text: String, code: Int): Throwable {
        val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
        val detail = root?.get("detail")?.jsonPrimitive?.contentOrNull
        val message = root?.get("message")?.jsonPrimitive?.contentOrNull
        return IllegalStateException(message ?: detail ?: "realm_api_$code")
    }
}

private fun JsonObject.string(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.stringOrNull(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
