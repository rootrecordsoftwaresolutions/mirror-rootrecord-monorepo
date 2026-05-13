package com.rootrecord.kilauea.alerts.data.repository

import com.rootrecord.kilauea.alerts.data.local.KilaueaDataDao
import com.rootrecord.kilauea.alerts.data.local.KilaueaDataEntity
import com.rootrecord.kilauea.alerts.data.remote.AppJson
import com.rootrecord.kilauea.alerts.data.remote.RootRecordApi
import com.rootrecord.kilauea.alerts.domain.BigIslandLocation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * EPA **AirNow** current observations (near real-time), proxied by `rootrecord-api-kilauea`
 * so the API key never ships in the APK.
 *
 * @see https://docs.airnowapi.org/
 */
@Singleton
class AirNowRepository @Inject constructor(
    private val api: RootRecordApi,
    private val dao: KilaueaDataDao,
) {
    /** AirNow updates about hourly — don’t hammer the Worker. */
    private val localMaxAgeMs: Long = 45 * 60 * 1000L

    suspend fun cachedJson(): String? = dao.getByKey(CacheKeys.AIRNOW_CURRENT_VOLCANO)?.payloadJson

    suspend fun refreshVolcanoVillage(): Result<JsonObject> = withContext(Dispatchers.IO) {
        runCatching {
            val vv = BigIslandLocation.VolcanoVillage
            val body = api.airNowCurrent(lat = vv.latitude, lon = vv.longitude, distance = 50)
            AppJson.parseToJsonElement(body).let { it as JsonObject }
                .also { js ->
                    dao.upsert(
                        KilaueaDataEntity(
                            cacheKey = CacheKeys.AIRNOW_CURRENT_VOLCANO,
                            payloadJson = AppJson.encodeToString(JsonObject.serializer(), js),
                            fetchedAtEpochMs = System.currentTimeMillis(),
                            sourceUrl = "/api/airnow/current",
                        ),
                    )
                }
        }
    }

    suspend fun offlineFirst(forceRefresh: Boolean): Result<JsonObject> {
        if (!forceRefresh) {
            val row = dao.getByKey(CacheKeys.AIRNOW_CURRENT_VOLCANO)
            val raw = row?.payloadJson
            if (raw != null) {
                val age = System.currentTimeMillis() - row.fetchedAtEpochMs
                if (age >= 0 && age < localMaxAgeMs) {
                    runCatching {
                        val el = AppJson.parseToJsonElement(raw)
                        if (el is JsonObject) return Result.success(el)
                    }
                }
            }
        }
        return refreshVolcanoVillage()
    }
}
