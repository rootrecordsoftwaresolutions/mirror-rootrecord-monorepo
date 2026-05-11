package com.rootrecord.kilauea.alerts.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kilauea_prefs")

@Singleton
class KilaueaPreferences @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {
    private val ds get() = context.dataStore

    val guestId: Flow<String> = ds.data.map { p -> p[GUEST_ID] ?: "" }

    val notificationVolcano: Flow<Boolean> = ds.data.map { it[NOTIFY_VOLCANO] != false }
    val notificationNws: Flow<Boolean> = ds.data.map { it[NOTIFY_NWS] != false }
    val notificationEq: Flow<Boolean> = ds.data.map { it[NOTIFY_EQ] == true }
    val notificationLiveFeeds: Flow<Boolean> = ds.data.map { it[NOTIFY_LIVE] == true }

    val eqMagnitudeThreshold: Flow<Float> = ds.data.map { p ->
        (p[EQ_THRESHOLD] ?: DEFAULT_EQ_THRESHOLD).coerceIn(1f, 6f)
    }

    val bootstrapNotifyComplete: Flow<Boolean> = ds.data.map { it[BOOTSTRAP_NOTIFY] == true }
    val liveFeedsNewBadge: Flow<Boolean> = ds.data.map { it[LIVE_FEED_NEW] == true }

    /** When true, Weather tab may fetch dashboard data for the device GPS position. */
    val weatherUseMyLocation: Flow<Boolean> = ds.data.map { it[WEATHER_USE_MY_LOCATION] == true }

    /** Signed in with Root Record (`POST /v1/auth/login`). */
    val authSignedIn: Flow<Boolean> = ds.data.map { !it[AUTH_ACCESS_TOKEN].isNullOrBlank() }

    val authEmail: Flow<String?> = ds.data.map { p ->
        if (p[AUTH_ACCESS_TOKEN].isNullOrBlank()) null else p[AUTH_EMAIL]
    }

    /** Server flag — used later for ad-free / Pro UI. */
    val authProUnlocked: Flow<Boolean> = ds.data.map { it[AUTH_PRO_UNLOCKED] == true }

    /** After first-run welcome + tutorial flow is dismissed. */
    val welcomeTutorialComplete: Flow<Boolean> = ds.data.map { it[WELCOME_TUTORIAL_COMPLETE] == true }

    suspend fun getAuthAccessToken(): String? =
        ds.data.first()[AUTH_ACCESS_TOKEN]?.takeIf { it.isNotBlank() }

    suspend fun setAuthSession(
        accessToken: String,
        email: String,
        accountId: String?,
        proUnlocked: Boolean,
    ) {
        ds.edit {
            it[AUTH_ACCESS_TOKEN] = accessToken
            it[AUTH_EMAIL] = email.trim().lowercase()
            if (accountId.isNullOrBlank()) it.remove(AUTH_ACCOUNT_ID) else it[AUTH_ACCOUNT_ID] = accountId
            it[AUTH_PRO_UNLOCKED] = proUnlocked
        }
    }

    suspend fun clearAuthSession() {
        ds.edit {
            it.remove(AUTH_ACCESS_TOKEN)
            it.remove(AUTH_EMAIL)
            it.remove(AUTH_ACCOUNT_ID)
            it.remove(AUTH_PRO_UNLOCKED)
        }
    }

    suspend fun ensureGuestId(): String {
        val existing = ds.data.first()[GUEST_ID]?.trim().orEmpty()
        if (existing.isNotEmpty()) return existing
        val g = "g_${java.util.UUID.randomUUID().toString().replace("-", "").take(24)}"
        ds.edit { it[GUEST_ID] = g }
        return g
    }

    suspend fun setNotifyVolcano(v: Boolean) {
        ds.edit { it[NOTIFY_VOLCANO] = v }
    }

    suspend fun setNotifyNws(v: Boolean) {
        ds.edit { it[NOTIFY_NWS] = v }
    }

    suspend fun setNotifyEq(v: Boolean) {
        ds.edit { it[NOTIFY_EQ] = v }
    }

    suspend fun setNotifyLiveFeeds(v: Boolean) {
        ds.edit { it[NOTIFY_LIVE] = v }
    }

    suspend fun setEqThreshold(mag: Float) {
        ds.edit { it[EQ_THRESHOLD] = mag }
    }

    suspend fun setBootstrapNotifyComplete(v: Boolean) {
        ds.edit { it[BOOTSTRAP_NOTIFY] = v }
    }

    suspend fun setLiveFeedsNewBadge(v: Boolean) {
        ds.edit { it[LIVE_FEED_NEW] = v }
    }

    suspend fun setWeatherUseMyLocation(v: Boolean) {
        ds.edit { it[WEATHER_USE_MY_LOCATION] = v }
    }

    /** Last GPS used for dashboard cache key `gps`; required for My Location detail screen. */
    suspend fun getWeatherLastGps(): Pair<Double, Double>? {
        val p = ds.data.first()
        val lat = p[WEATHER_LAST_GPS_LAT] ?: return null
        val lon = p[WEATHER_LAST_GPS_LON] ?: return null
        return Pair(lat.toDouble(), lon.toDouble())
    }

    suspend fun setWeatherLastGps(latitude: Double, longitude: Double) {
        ds.edit {
            it[WEATHER_LAST_GPS_LAT] = latitude.toFloat()
            it[WEATHER_LAST_GPS_LON] = longitude.toFloat()
        }
    }

    suspend fun setWelcomeTutorialComplete(v: Boolean) {
        ds.edit { it[WELCOME_TUTORIAL_COMPLETE] = v }
    }

    suspend fun getNotifiedVolcanoIds(): String =
        ds.data.first()[VOLCANO_NOTIFIED_IDS] ?: "[]"

    suspend fun setNotifiedVolcanoIds(json: String) {
        ds.edit { it[VOLCANO_NOTIFIED_IDS] = json }
    }

    suspend fun getNotifiedNwsIds(): String =
        ds.data.first()[NWS_NOTIFIED_IDS] ?: "[]"

    suspend fun setNotifiedNwsIds(json: String) {
        ds.edit { it[NWS_NOTIFIED_IDS] = json }
    }

    suspend fun getNotifiedEqIds(): String =
        ds.data.first()[EQ_NOTIFIED_IDS] ?: "[]"

    suspend fun setNotifiedEqIds(json: String) {
        ds.edit { it[EQ_NOTIFIED_IDS] = json }
    }

    /** Magnitude threshold used when [EQ_NOTIFIED_IDS] was last aligned (migration / bootstrap). */
    suspend fun getEqNotifiedAtThreshold(): Float? =
        ds.data.first()[EQ_NOTIFIED_AT_THRESHOLD]

    suspend fun setEqNotifiedAtThreshold(value: Float) {
        ds.edit { it[EQ_NOTIFIED_AT_THRESHOLD] = value }
    }

    companion object {
        private val GUEST_ID = stringPreferencesKey("guest_id")
        private val NOTIFY_VOLCANO = booleanPreferencesKey("notify_volcano")
        private val NOTIFY_NWS = booleanPreferencesKey("notify_nws")
        private val NOTIFY_EQ = booleanPreferencesKey("notify_eq")
        private val NOTIFY_LIVE = booleanPreferencesKey("notify_live_feeds")
        private val EQ_THRESHOLD = floatPreferencesKey("eq_threshold")
        private val BOOTSTRAP_NOTIFY = booleanPreferencesKey("bootstrap_notify")
        private val LIVE_FEED_NEW = booleanPreferencesKey("live_feed_new_badge")
        private val VOLCANO_NOTIFIED_IDS = stringPreferencesKey("volcano_notified_ids")
        private val NWS_NOTIFIED_IDS = stringPreferencesKey("nws_notified_ids")
        private val EQ_NOTIFIED_IDS = stringPreferencesKey("eq_notified_ids")
        private val EQ_NOTIFIED_AT_THRESHOLD = floatPreferencesKey("eq_notified_at_threshold")
        private val WEATHER_USE_MY_LOCATION = booleanPreferencesKey("weather_use_my_location")
        private val WEATHER_LAST_GPS_LAT = floatPreferencesKey("weather_last_gps_lat")
        private val WEATHER_LAST_GPS_LON = floatPreferencesKey("weather_last_gps_lon")

        private val AUTH_ACCESS_TOKEN = stringPreferencesKey("auth_access_token")
        private val AUTH_EMAIL = stringPreferencesKey("auth_email")
        private val AUTH_ACCOUNT_ID = stringPreferencesKey("auth_account_id")
        private val AUTH_PRO_UNLOCKED = booleanPreferencesKey("auth_pro_unlocked")
        private val WELCOME_TUTORIAL_COMPLETE = booleanPreferencesKey("welcome_tutorial_complete")

        private const val DEFAULT_EQ_THRESHOLD = 4.0f
    }
}
