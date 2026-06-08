package com.rootrecord.blocknotes.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.rootrecord.blocknotes.data.local.dao.AreaDao
import com.rootrecord.blocknotes.data.local.dao.BuildPlanDao
import com.rootrecord.blocknotes.data.local.dao.CoordinateDao
import com.rootrecord.blocknotes.data.local.dao.MediaDao
import com.rootrecord.blocknotes.data.local.dao.NoteDao
import com.rootrecord.blocknotes.data.local.dao.NoteLinkDao
import com.rootrecord.blocknotes.data.local.dao.NotebookDao
import com.rootrecord.blocknotes.data.local.dao.ReferenceDao
import com.rootrecord.blocknotes.data.local.dao.TagDao
import com.rootrecord.blocknotes.data.local.dao.SyncSnapshotDao
import com.rootrecord.blocknotes.data.local.dao.TimelineDao
import com.rootrecord.blocknotes.data.local.dao.WorldDao
import com.rootrecord.blocknotes.data.local.entity.AreaEntity
import com.rootrecord.blocknotes.data.local.entity.BuildPlanEntity
import com.rootrecord.blocknotes.data.local.entity.BuildPlanItemEntity
import com.rootrecord.blocknotes.data.local.entity.CoordinateEntity
import com.rootrecord.blocknotes.data.local.entity.MediaAttachmentEntity
import com.rootrecord.blocknotes.data.local.entity.NoteEntity
import com.rootrecord.blocknotes.data.local.entity.NoteFtsEntity
import com.rootrecord.blocknotes.data.local.entity.NoteLinkEntity
import com.rootrecord.blocknotes.data.local.entity.NoteTagCrossRef
import com.rootrecord.blocknotes.data.local.entity.NotebookEntity
import com.rootrecord.blocknotes.data.local.entity.ProjectTimelineEventEntity
import com.rootrecord.blocknotes.data.local.entity.ReferenceCacheEntity
import com.rootrecord.blocknotes.data.local.entity.TagEntity
import com.rootrecord.blocknotes.data.local.entity.WorldEntity

@Database(
    entities = [
        WorldEntity::class,
        NotebookEntity::class,
        NoteEntity::class,
        NoteFtsEntity::class,
        TagEntity::class,
        NoteTagCrossRef::class,
        CoordinateEntity::class,
        AreaEntity::class,
        MediaAttachmentEntity::class,
        NoteLinkEntity::class,
        BuildPlanEntity::class,
        BuildPlanItemEntity::class,
        ReferenceCacheEntity::class,
        ProjectTimelineEventEntity::class,
    ],
    version = 6,
    exportSchema = false,
)
abstract class BlockNotesDatabase : RoomDatabase() {
    abstract fun worldDao(): WorldDao
    abstract fun notebookDao(): NotebookDao
    abstract fun noteDao(): NoteDao
    abstract fun tagDao(): TagDao
    abstract fun coordinateDao(): CoordinateDao
    abstract fun areaDao(): AreaDao
    abstract fun mediaDao(): MediaDao
    abstract fun noteLinkDao(): NoteLinkDao
    abstract fun buildPlanDao(): BuildPlanDao
    abstract fun referenceDao(): ReferenceDao
    abstract fun timelineDao(): TimelineDao
    abstract fun syncSnapshotDao(): SyncSnapshotDao
}
