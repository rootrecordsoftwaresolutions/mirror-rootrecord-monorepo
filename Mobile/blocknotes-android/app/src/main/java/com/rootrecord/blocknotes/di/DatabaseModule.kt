package com.rootrecord.blocknotes.di

import android.content.Context
import androidx.room.Room
import com.rootrecord.blocknotes.data.local.BlockNotesDatabase
import com.rootrecord.blocknotes.data.local.MIGRATION_1_2
import com.rootrecord.blocknotes.data.local.MIGRATION_2_3
import com.rootrecord.blocknotes.data.local.MIGRATION_3_4
import com.rootrecord.blocknotes.data.local.MIGRATION_4_5
import com.rootrecord.blocknotes.data.local.MIGRATION_5_6
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
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): BlockNotesDatabase =
        Room.databaseBuilder(ctx, BlockNotesDatabase::class.java, "blocknotes.db")
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
            .fallbackToDestructiveMigration(dropAllTables = true)
            .build()

    @Provides
    fun provideWorldDao(db: BlockNotesDatabase): WorldDao = db.worldDao()

    @Provides
    fun provideNotebookDao(db: BlockNotesDatabase): NotebookDao = db.notebookDao()

    @Provides
    fun provideNoteDao(db: BlockNotesDatabase): NoteDao = db.noteDao()

    @Provides
    fun provideTagDao(db: BlockNotesDatabase): TagDao = db.tagDao()

    @Provides
    fun provideCoordinateDao(db: BlockNotesDatabase): CoordinateDao = db.coordinateDao()

    @Provides
    fun provideAreaDao(db: BlockNotesDatabase): AreaDao = db.areaDao()

    @Provides
    fun provideMediaDao(db: BlockNotesDatabase): MediaDao = db.mediaDao()

    @Provides
    fun provideNoteLinkDao(db: BlockNotesDatabase): NoteLinkDao = db.noteLinkDao()

    @Provides
    fun provideBuildPlanDao(db: BlockNotesDatabase): BuildPlanDao = db.buildPlanDao()

    @Provides
    fun provideReferenceDao(db: BlockNotesDatabase): ReferenceDao = db.referenceDao()

    @Provides
    fun provideTimelineDao(db: BlockNotesDatabase): TimelineDao = db.timelineDao()

    @Provides
    fun provideSyncSnapshotDao(db: BlockNotesDatabase): SyncSnapshotDao = db.syncSnapshotDao()
}
