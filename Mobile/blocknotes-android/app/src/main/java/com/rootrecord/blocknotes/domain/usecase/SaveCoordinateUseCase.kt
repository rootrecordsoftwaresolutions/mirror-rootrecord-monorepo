package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.local.entity.MinecraftDimension
import com.rootrecord.blocknotes.data.repository.CoordinateRepository
import javax.inject.Inject

class SaveCoordinateUseCase @Inject constructor(
    private val coordinateRepository: CoordinateRepository,
) {
    suspend operator fun invoke(
        worldId: Long,
        x: Int,
        y: Int,
        z: Int,
        dimension: MinecraftDimension = MinecraftDimension.OVERWORLD,
        label: String = "",
        noteId: Long? = null,
    ): Long = coordinateRepository.save(
        worldId = worldId,
        x = x,
        y = y,
        z = z,
        dimension = dimension,
        label = label,
        noteId = noteId,
    )
}
