package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.dao.CoordinateDao
import com.rootrecord.blocknotes.data.local.entity.CoordinateEntity
import com.rootrecord.blocknotes.data.local.entity.MinecraftDimension
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CoordinateRepository @Inject constructor(
    private val coordinateDao: CoordinateDao,
    private val areaRepository: AreaRepository,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {

    fun observeByWorld(worldId: Long): Flow<List<CoordinateEntity>> =
        coordinateDao.observeByWorld(worldId)

    fun observeByNote(noteId: Long): Flow<List<CoordinateEntity>> =
        coordinateDao.observeByNote(noteId)

    fun observeByArea(areaId: Long): Flow<List<CoordinateEntity>> =
        coordinateDao.observeByArea(areaId)

    suspend fun getById(id: Long): CoordinateEntity? = withContext(io) {
        coordinateDao.getById(id)
    }

    suspend fun save(
        worldId: Long,
        x: Int,
        y: Int,
        z: Int,
        dimension: MinecraftDimension = MinecraftDimension.OVERWORLD,
        label: String = "",
        noteId: Long? = null,
    ): Long = withContext(io) {
        val areaId = areaRepository.ensureChunkAreaForBlock(
            worldId = worldId,
            blockX = x,
            blockZ = z,
            dimension = dimension,
            labelHint = label.trim().ifBlank { "" }.let { hint ->
                if (hint.isNotEmpty()) {
                    val bounds = com.rootrecord.blocknotes.util.CoordinateMath.chunkBoundsForBlock(x, z)
                    "$hint (chunk ${bounds.chunkX}, ${bounds.chunkZ})"
                } else {
                    ""
                }
            },
        )
        val nextOrder = coordinateDao.maxSortOrderForWorld(worldId) + 1
        coordinateDao.insert(
            CoordinateEntity(
                worldId = worldId,
                noteId = noteId,
                areaId = areaId,
                label = label.trim(),
                x = x,
                y = y,
                z = z,
                dimension = dimension.name,
                timestamp = System.currentTimeMillis(),
                sortOrder = nextOrder,
            ),
        )
    }

    suspend fun update(coordinate: CoordinateEntity) = withContext(io) {
        val dim = runCatching { MinecraftDimension.valueOf(coordinate.dimension) }
            .getOrDefault(MinecraftDimension.OVERWORLD)
        val areaId = areaRepository.ensureChunkAreaForBlock(
            worldId = coordinate.worldId,
            blockX = coordinate.x,
            blockZ = coordinate.z,
            dimension = dim,
        )
        coordinateDao.update(coordinate.copy(areaId = areaId))
    }

    suspend fun applySortOrder(orderedIds: List<Long>) = withContext(io) {
        orderedIds.forEachIndexed { index, id ->
            val row = coordinateDao.getById(id) ?: return@forEachIndexed
            if (row.sortOrder != index) {
                coordinateDao.update(row.copy(sortOrder = index))
            }
        }
    }

    suspend fun delete(id: Long) = withContext(io) {
        coordinateDao.deleteById(id)
    }

    /** Assign chunk areas to legacy waypoints saved before areas existed. */
    suspend fun backfillChunkAreas(worldId: Long) = withContext(io) {
        coordinateDao.listWithoutArea(worldId).forEach { coord ->
            val dim = runCatching { MinecraftDimension.valueOf(coord.dimension) }
                .getOrDefault(MinecraftDimension.OVERWORLD)
            val areaId = areaRepository.ensureChunkAreaForBlock(
                worldId = coord.worldId,
                blockX = coord.x,
                blockZ = coord.z,
                dimension = dim,
            )
            coordinateDao.update(coord.copy(areaId = areaId))
        }
    }
}
