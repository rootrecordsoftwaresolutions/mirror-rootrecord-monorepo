package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.dao.ReferenceDao
import com.rootrecord.blocknotes.data.local.entity.ReferenceCacheEntity
import com.rootrecord.blocknotes.data.remote.AppJson
import com.rootrecord.blocknotes.di.IoDispatcher
import com.rootrecord.blocknotes.di.ROOTRECORD_BLOCKNOTES_BASE
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

@Singleton
class ReferenceRepository @Inject constructor(
    private val referenceDao: ReferenceDao,
    @param:Named("rootrecord") private val http: OkHttpClient,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {

    fun observeByCategory(category: String): Flow<List<ReferenceCacheEntity>> =
        referenceDao.observeByCategory(category)

    fun observeCategories(): Flow<List<String>> = referenceDao.observeCategories()

    suspend fun getCached(id: String): ReferenceCacheEntity? = withContext(io) {
        referenceDao.getById(id)
    }

    suspend fun upsert(entry: ReferenceCacheEntity) = withContext(io) {
        referenceDao.upsert(entry)
    }

    /** Stub: ping Worker for newer reference DB version; full download deferred to Phase 4. */
    suspend fun checkForUpdates(): Result<Unit> = withContext(io) {
        runCatching {
            val req = Request.Builder()
                .url("${ROOTRECORD_BLOCKNOTES_BASE}api/mobile/config")
                .get()
                .build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@runCatching
                val text = resp.body?.string().orEmpty()
                val root = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull()
                    ?: return@runCatching
                val refVersion = root["reference_version"]?.jsonPrimitive?.content
                if (!refVersion.isNullOrBlank()) {
                    referenceDao.upsert(
                        ReferenceCacheEntity(
                            id = "__remote_version__",
                            category = "meta",
                            jsonBlob = text,
                            version = refVersion,
                        ),
                    )
                }
            }
        }
    }
}
