package com.rootrecord.rootmc.data.repository

import com.rootrecord.rootmc.data.local.RootMcPreferences
import com.rootrecord.rootmc.data.remote.AppJson
import com.rootrecord.rootmc.di.IoDispatcher
import com.rootrecord.rootmc.di.ROOTRECORD_BLOCKNOTES_BASE
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
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

private data class MembershipFlags(
    val proUnlocked: Boolean,
    val lifeMember: Boolean,
)

private fun membershipFromJson(root: JsonObject): MembershipFlags {
    val life = root["lifeMember"]?.jsonPrimitive?.booleanLike() == true ||
        root["life_member"]?.jsonPrimitive?.booleanLike() == true
    val pro = life ||
        root["proUnlocked"]?.jsonPrimitive?.booleanLike() == true ||
        root["pro_unlocked"]?.jsonPrimitive?.booleanLike() == true
    return MembershipFlags(proUnlocked = pro, lifeMember = life)
}

private val JsonMedia = "application/json; charset=utf-8".toMediaType()

private val LOGIN_URL = "${ROOTRECORD_BLOCKNOTES_BASE}v1/auth/login"
private val SIGNUP_URL = "${ROOTRECORD_BLOCKNOTES_BASE}v1/auth/signup"
private val LOGOUT_URL = "${ROOTRECORD_BLOCKNOTES_BASE}v1/auth/logout"
private val ME_URL = "${ROOTRECORD_BLOCKNOTES_BASE}v1/me"
private val APP_SESSION_URL = "${ROOTRECORD_BLOCKNOTES_BASE}api/app-session/start"
private val PUSH_TOKEN_URL = "${ROOTRECORD_BLOCKNOTES_BASE}api/me/push-token"

@Serializable
private data class PushTokenBody(
    val token: String,
    val platform: String = "android",
    val app_id: String = BLOCKNOTES_APP_ID,
)

@Serializable
private data class AppSessionBody(
    val app_id: String = BLOCKNOTES_APP_ID,
    val mode: String = "signed_in",
)

@Serializable
private data class LoginBody(
    val email: String,
    val password: String,
    val app_id: String = BLOCKNOTES_APP_ID,
)

/**
 * Root Record account session (see POST /v1/auth/login on rootrecord-api-rootmc).
 * Uses the same OkHttp stack as feedback (guest id + optional bearer).
 */
@Singleton
class RootRecordAuthRepository @Inject constructor(
    @param:Named("rootrecord") private val http: OkHttpClient,
    private val prefs: RootMcPreferences,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {

    suspend fun login(email: String, password: String): Result<Unit> = authenticate(
        url = LOGIN_URL,
        email = email,
        password = password,
        failurePrefix = "sign_in_failed",
    )

    suspend fun createAccount(email: String, password: String): Result<Unit> = authenticate(
        url = SIGNUP_URL,
        email = email,
        password = password,
        failurePrefix = "account_create_failed",
    )

    private suspend fun authenticate(
        url: String,
        email: String,
        password: String,
        failurePrefix: String,
    ): Result<Unit> = withContext(io) {
        runCatching {
            val trimmed = email.trim().lowercase()
            val payload = AppJson.encodeToString(LoginBody.serializer(), LoginBody(trimmed, password))
            val req = Request.Builder()
                .url(url)
                .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
                .post(payload.toRequestBody(JsonMedia))
                .build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                val root = parseApiObject(text, resp.code)
                if (!resp.isSuccessful) {
                    val detail = root["detail"]?.jsonPrimitive?.content
                    error(detail ?: "${failurePrefix}_${resp.code}")
                }
                val token = root["access_token"]?.jsonPrimitive?.content
                    ?: root["token"]?.jsonPrimitive?.content
                    ?: error("missing_token")
                val mail = root["email"]?.jsonPrimitive?.content?.trim()?.lowercase() ?: trimmed
                val accountId = root["account_id"]?.jsonPrimitive?.content
                val access = membershipFromJson(root)
                prefs.setAuthSession(
                    accessToken = token,
                    email = mail,
                    accountId = accountId,
                    proUnlocked = access.proUnlocked,
                    lifeMember = access.lifeMember,
                )
            }
        }
    }

    suspend fun logout() {
        withContext(io) {
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

    /** Best-effort POST `/api/me/push-token` (requires signed-in session). */
    suspend fun registerPushToken(token: String): Result<Unit> = withContext(io) {
        runCatching {
            val trimmed = token.trim()
            if (trimmed.length < 20) return@runCatching
            val sessionToken = prefs.getAuthAccessToken()
            if (sessionToken.isNullOrBlank()) return@runCatching
            val payload = AppJson.encodeToString(PushTokenBody.serializer(), PushTokenBody(trimmed))
            val req = Request.Builder()
                .url(PUSH_TOKEN_URL)
                .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
                .post(payload.toRequestBody(JsonMedia))
                .build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) error("push_token_failed_${resp.code}")
            }
        }
    }

    /** Best-effort POST `/api/app-session/start` → Discord dev channel (once per cold start). */
    suspend fun notifyAppSessionStart() {
        withContext(io) {
            runCatching {
                val payload = AppJson.encodeToString(
                    AppSessionBody.serializer(),
                    AppSessionBody(),
                )
                val req = Request.Builder()
                    .url(APP_SESSION_URL)
                    .header("X-RR-App-Id", BLOCKNOTES_APP_ID)
                    .post(payload.toRequestBody(JsonMedia))
                    .build()
                http.newCall(req).execute().close()
            }
        }
    }

    /** Refreshes membership flags (and email/account id when present) from GET `/v1/me`. */
    suspend fun refreshAccountAccess(): Result<Unit> = withContext(io) {
        runCatching {
            val token = prefs.getAuthAccessToken()
            if (token.isNullOrBlank()) return@runCatching
            val req = Request.Builder().url(ME_URL).get().build()
            http.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return@runCatching
                val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
                    ?: return@runCatching
                val access = membershipFromJson(root)
                prefs.setMembershipFlags(access.proUnlocked, access.lifeMember)
                val mail = root["email"]?.jsonPrimitive?.content?.trim()?.lowercase()
                val accountId = root["account_id"]?.jsonPrimitive?.content
                if (!mail.isNullOrBlank() || !accountId.isNullOrBlank()) {
                    prefs.updateAuthProfile(email = mail, accountId = accountId)
                }
            }
        }
    }

    private fun parseApiObject(text: String, httpCode: Int): JsonObject {
        if (text.isBlank()) {
            error(
                when (httpCode) {
                    503 -> "Sign-in service is busy. Wait a moment and try again."
                    in 500..599 -> "Server error ($httpCode). Try again in a minute."
                    else -> "Empty server response (HTTP $httpCode)."
                },
            )
        }
        if (text.contains("error code: 1102", ignoreCase = true)) {
            error("Sign-in timed out on the server. Try again, or reset your password at rootrecord.info if this keeps happening.")
        }
        val trimmed = text.trim()
        if (trimmed.startsWith("<") || trimmed.startsWith("<!DOCTYPE", ignoreCase = true)) {
            error("Server error ($httpCode). Try again later.")
        }
        return runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
            ?: error("Unexpected server response (HTTP $httpCode). Try again.")
    }
}
