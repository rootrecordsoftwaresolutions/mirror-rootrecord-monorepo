package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.dao.BuildPlanDao
import com.rootrecord.blocknotes.data.local.entity.BuildPlanEntity
import com.rootrecord.blocknotes.data.local.entity.BuildPlanItemEntity
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BuildPlanRepository @Inject constructor(
    private val buildPlanDao: BuildPlanDao,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    fun observePlans(worldId: Long): Flow<List<BuildPlanEntity>> =
        buildPlanDao.observeByWorld(worldId)

    fun observeItems(planId: Long): Flow<List<BuildPlanItemEntity>> =
        buildPlanDao.observeItems(planId)

    suspend fun createPlan(worldId: Long, title: String): Long = withContext(io) {
        buildPlanDao.insert(
            BuildPlanEntity(
                worldId = worldId,
                title = title.trim().ifBlank { "Build plan" },
            ),
        )
    }

    suspend fun addItem(planId: Long, materialName: String, quantity: Int) = withContext(io) {
        buildPlanDao.insertItem(
            BuildPlanItemEntity(
                buildPlanId = planId,
                materialName = materialName.trim(),
                quantity = quantity.coerceAtLeast(1),
            ),
        )
        refreshProgress(planId)
    }

    suspend fun toggleItemObtained(item: BuildPlanItemEntity) = withContext(io) {
        buildPlanDao.updateItem(item.copy(obtained = !item.obtained))
        refreshProgress(item.buildPlanId)
    }

    private suspend fun refreshProgress(planId: Long) {
        val plan = buildPlanDao.getById(planId) ?: return
        val items = buildPlanDao.getItems(planId)
        if (items.isEmpty()) return
        val obtained = items.count { it.obtained }
        val pct = (obtained * 100) / items.size
        buildPlanDao.update(plan.copy(progressPercent = pct))
    }
}
