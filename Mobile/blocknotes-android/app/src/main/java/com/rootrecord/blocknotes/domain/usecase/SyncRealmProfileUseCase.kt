package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import com.rootrecord.blocknotes.data.local.dao.NoteDao
import com.rootrecord.blocknotes.data.local.dao.WorldDao
import com.rootrecord.blocknotes.data.remote.AppJson
import com.rootrecord.blocknotes.data.repository.RealmRepository
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncRealmProfileUseCase @Inject constructor(
    private val prefs: BlockNotesPreferences,
    private val worldDao: WorldDao,
    private val noteDao: NoteDao,
    private val realmRepository: RealmRepository,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun sync(
        realmUsername: String?,
        bio: String?,
        publicProfile: Boolean = true,
    ): Result<Unit> = withContext(io) {
        runCatching {
            val mc = prefs.minecraftProfile.first()
            val sharedIds = prefs.sharedWorldIds.first()
            val worldsArray = buildJsonArray {
                for (worldId in sharedIds) {
                    val world = worldDao.getById(worldId) ?: continue
                    val noteCount = noteDao.observeByWorld(worldId).first().count { !it.deleted }
                    add(
                        buildJsonObject {
                            put("world_key", "local:$worldId")
                            put("world_name", world.name)
                            put("game_version", world.gameVersion)
                            world.seed?.let { put("seed", it) }
                            put("play_mode", world.playMode)
                            world.serverAddress?.takeIf { it.isNotBlank() }?.let { put("server_address", it) }
                            world.mapUrl?.takeIf { it.isNotBlank() }?.let { put("map_url", it) }
                            put("note_count", noteCount)
                            put("is_public", true)
                        },
                    )
                }
            }
            val body = buildJsonObject {
                realmUsername?.trim()?.takeIf { it.isNotEmpty() }?.let { put("realm_username", it) }
                bio?.let { put("bio", it.trim().take(280)) }
                put("public_profile", publicProfile)
                mc?.let {
                    put("minecraft_username", it.username)
                    put("minecraft_uuid", it.uuid)
                    it.skinUrl?.let { url -> put("skin_url", url) }
                }
                put("shared_worlds", worldsArray)
            }
            realmRepository.syncProfile(body.toString())
            Unit
        }
    }
}
