package com.rootrecord.kilauea.alerts.data.repository

import com.rootrecord.kilauea.alerts.data.local.KilaueaPreferences
import com.rootrecord.kilauea.alerts.data.remote.AppJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

private fun JsonPrimitive?.booleanLike(): Boolean {
    this ?: return false
    booleanOrNull?.let { return it }
    return content.equals("true", ignoreCase = true)
}

private val JsonMedia = "application/json; charset=utf-8".toMediaType()

// Per-product API shard (rootrecord-api-kilauea). Keep in sync with NetworkModule.ROOTRECORD_BASE —
// the custom domain `api-kilauea.rootrecord.info` is not reliably resolving from devices, so we hit
// the Worker's *.workers.dev URL directly until that's fixed in Cloudflare.
private const val LOGIN_URL = "https://rootrecord-api-kilauea.rootrecord.workers.dev/v1/auth/login"
private const val LOGOUT_URL = "https://rootrecord-api-kilauea.rootrecord.workers.dev/v1/auth/logout"

@Serializable
private data class LoginBody(val email: String, val password: String)

/**
 * Root Record account session (see POST /v1/auth/login on api-kilauea.rootrecord.info — Worker `rootrecord-api-kilauea`).
 * Uses the same OkHttp stack as [RootRecordApi] (guest id + optional bearer).
 */
@Singleton
class RootRecordAuthRepository @Inject constructor(
    @Named("rootrecord") private val http: OkHttpClient,
    private val prefs: KilaueaPreferences,
) {

    suspend fun login(email: String, password: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val trimmed = email.trim().lowercase()
            val payload = AppJson.encodeToString(LoginBody.serializer(), LoginBody(trimmed, password))
            val req = Request.Builder()
                .url(LOGIN_URL)
                .post(payload.toRequestBody(JsonMedia))
                .build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
                    ?: error("invalid_response")
                if (!resp.isSuccessful) {
                    val detail = root["detail"]?.jsonPrimitive?.content
                    error(detail ?: "sign_in_failed_${resp.code}")
                }
                val token = root["access_token"]?.jsonPrimitive?.content
                    ?: root["token"]?.jsonPrimitive?.content
                    ?: error("missing_token")
                val mail = root["email"]?.jsonPrimitive?.content?.trim()?.lowercase() ?: trimmed
                val accountId = root["account_id"]?.jsonPrimitive?.content
                val pro = root["proUnlocked"]?.jsonPrimitive?.booleanLike() == true ||
                    root["pro_unlocked"]?.jsonPrimitive?.booleanLike() == true
                prefs.setAuthSession(token, mail, accountId, pro)
            }
        }
    }

    suspend fun logout() {
        withContext(Dispatchers.IO) {
            try {
                val token = prefs.getAuthAccessToken()
                if (!token.isNullOrBlank()) {
                    val req = Request.Builder()
                        .url(LOGOUT_URL)
                        .post("{}".toRequestBody(JsonMedia))
                        .build()
                    http.newCall(req).execute().close()
                }
            } catch (_: Exception) {
                /* revoke may fail offline; always clear local session */
            }
            prefs.clearAuthSession()
        }
    }
}
