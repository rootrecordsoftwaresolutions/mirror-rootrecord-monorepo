package com.rootrecord.kilauea.alerts.data.repository

import com.rootrecord.kilauea.alerts.data.local.KilaueaDataDao
import com.rootrecord.kilauea.alerts.data.local.KilaueaDataEntity
import com.rootrecord.kilauea.alerts.data.remote.AppJson
import com.rootrecord.kilauea.alerts.data.remote.RootRecordApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * EPA AQS daily summaries for Hawaiʻi County (Big Island), proxied by `rootrecord-api-kilauea`
 * (`GET /api/aqs/hawaii-county-daily`) so credentials stay on the Worker.
 *
 * @see https://aqs.epa.gov/aqsweb/documents/data_api.html
 */
@Singleton
class AqsRepository @Inject constructor(
    private val api: RootRecordApi,
    private val dao: KilaueaDataDao,
) {
    /** AQS is archive data — refresh at most a few times per day client-side. */
    private val localMaxAgeMs: Long = 8 * 60 * 60 * 1000L

    suspend fun cachedJson(): String? = dao.getByKey(CacheKeys.AQS_HAWAII_COUNTY_DAILY)?.payloadJson

    suspend fun refresh(): Result<JsonObject> = withContext(Dispatchers.IO) {
        runCatching {
            val body = api.aqsHawaiiCountyDaily()
            AppJson.parseToJsonElement(body).let { it as JsonObject }
                .also { js ->
                    dao.upsert(
                        KilaueaDataEntity(
                            cacheKey = CacheKeys.AQS_HAWAII_COUNTY_DAILY,
                            payloadJson = AppJson.encodeToString(JsonObject.serializer(), js),
                            fetchedAtEpochMs = System.currentTimeMillis(),
                            sourceUrl = "/api/aqs/hawaii-county-daily",
                        ),
                    )
                }
        }
    }

    suspend fun offlineFirst(forceRefresh: Boolean): Result<JsonObject> {
        if (!forceRefresh) {
            val row = dao.getByKey(CacheKeys.AQS_HAWAII_COUNTY_DAILY)
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
        return refresh()
    }
}
