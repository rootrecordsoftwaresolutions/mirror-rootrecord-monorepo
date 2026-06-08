package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.dao.TimelineDao
import com.rootrecord.blocknotes.data.local.entity.ProjectTimelineEventEntity
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TimelineRepository @Inject constructor(
    private val timelineDao: TimelineDao,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    suspend fun log(
        worldId: Long,
        eventType: String,
        description: String,
        noteId: Long? = null,
    ) = withContext(io) {
        timelineDao.insert(
            ProjectTimelineEventEntity(
                worldId = worldId,
                noteId = noteId,
                eventType = eventType,
                description = description,
            ),
        )
    }
}
