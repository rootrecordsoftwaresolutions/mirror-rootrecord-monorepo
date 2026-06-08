package com.rootrecord.blocknotes.data.sync

import com.rootrecord.blocknotes.data.local.entity.AreaEntity
import com.rootrecord.blocknotes.data.local.entity.BuildPlanEntity
import com.rootrecord.blocknotes.data.local.entity.BuildPlanItemEntity
import com.rootrecord.blocknotes.data.local.entity.CoordinateEntity
import com.rootrecord.blocknotes.data.local.entity.MediaAttachmentEntity
import com.rootrecord.blocknotes.data.local.entity.NoteEntity
import com.rootrecord.blocknotes.data.local.entity.NoteLinkEntity
import com.rootrecord.blocknotes.data.local.entity.NoteTagCrossRef
import com.rootrecord.blocknotes.data.local.entity.NotebookEntity
import com.rootrecord.blocknotes.data.local.entity.ProjectTimelineEventEntity
import com.rootrecord.blocknotes.data.local.entity.TagEntity
import com.rootrecord.blocknotes.data.local.entity.WorldEntity
import kotlinx.serialization.Serializable

/** Full account backup payload stored in Root Record cloud (schema v1). */
@Serializable
data class BlockNotesCloudSnapshot(
    val schemaVersion: Int = SCHEMA_VERSION,
    val exportedAt: Long = System.currentTimeMillis(),
    val defaultWorldId: Long? = null,
    val worlds: List<WorldEntity> = emptyList(),
    val notebooks: List<NotebookEntity> = emptyList(),
    val notes: List<NoteEntity> = emptyList(),
    val tags: List<TagEntity> = emptyList(),
    val noteTagCrossRefs: List<NoteTagCrossRef> = emptyList(),
    val coordinates: List<CoordinateEntity> = emptyList(),
    val areas: List<AreaEntity> = emptyList(),
    val noteLinks: List<NoteLinkEntity> = emptyList(),
    val buildPlans: List<BuildPlanEntity> = emptyList(),
    val buildPlanItems: List<BuildPlanItemEntity> = emptyList(),
    val timelineEvents: List<ProjectTimelineEventEntity> = emptyList(),
    /** Metadata only — local file URIs stay on each device. */
    val mediaAttachments: List<MediaAttachmentEntity> = emptyList(),
) {
    fun hasUserContent(): Boolean =
        worlds.isNotEmpty() || notes.isNotEmpty() || coordinates.isNotEmpty() || areas.isNotEmpty()

    fun maxContentRevision(): Long {
        var max = 0L
        for (note in notes) max = maxOf(max, note.updatedAt)
        for (world in worlds) max = maxOf(max, world.createdAt)
        for (coord in coordinates) max = maxOf(max, coord.timestamp)
        for (area in areas) max = maxOf(max, area.timestamp)
        for (event in timelineEvents) max = maxOf(max, event.timestamp)
        for (plan in buildPlans) max = maxOf(max, plan.createdAt)
        for (media in mediaAttachments) max = maxOf(max, media.createdAt)
        return max
    }

    companion object {
        const val SCHEMA_VERSION = 1
    }
}

enum class AccountSyncDirection {
    PulledFromCloud,
    PushedToCloud,
    UpToDate,
}

data class AccountSyncResult(
    val direction: AccountSyncDirection,
    val cloudUpdatedAt: Long,
)
