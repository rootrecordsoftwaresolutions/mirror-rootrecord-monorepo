package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import com.rootrecord.blocknotes.data.local.dao.SyncSnapshotDao
import com.rootrecord.blocknotes.data.sync.BlockNotesCloudSnapshot
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SnapshotRepository @Inject constructor(
    private val syncSnapshotDao: SyncSnapshotDao,
    private val prefs: BlockNotesPreferences,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {

    suspend fun exportSnapshot(): BlockNotesCloudSnapshot = withContext(io) {
        val defaultWorldId = prefs.defaultWorldId.first()
        BlockNotesCloudSnapshot(
            exportedAt = System.currentTimeMillis(),
            defaultWorldId = defaultWorldId,
            worlds = syncSnapshotDao.allWorlds(),
            notebooks = syncSnapshotDao.allNotebooks(),
            notes = syncSnapshotDao.allNotes(),
            tags = syncSnapshotDao.allTags(),
            noteTagCrossRefs = syncSnapshotDao.allNoteTagCrossRefs(),
            coordinates = syncSnapshotDao.allCoordinates(),
            areas = syncSnapshotDao.allAreas(),
            noteLinks = syncSnapshotDao.allNoteLinks(),
            buildPlans = syncSnapshotDao.allBuildPlans(),
            buildPlanItems = syncSnapshotDao.allBuildPlanItems(),
            timelineEvents = syncSnapshotDao.allTimelineEvents(),
            mediaAttachments = syncSnapshotDao.allMediaAttachments(),
        )
    }

    suspend fun importSnapshot(snapshot: BlockNotesCloudSnapshot) = withContext(io) {
        syncSnapshotDao.replaceAllFromSnapshot(snapshot)
        snapshot.defaultWorldId?.takeIf { it > 0L }?.let { prefs.setDefaultWorldId(it) }
    }
}
