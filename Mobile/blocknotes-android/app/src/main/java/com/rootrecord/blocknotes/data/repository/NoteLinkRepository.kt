package com.rootrecord.blocknotes.data.repository

import com.rootrecord.blocknotes.data.local.dao.NoteDao
import com.rootrecord.blocknotes.data.local.dao.NoteLinkDao
import com.rootrecord.blocknotes.data.local.entity.NoteEntity
import com.rootrecord.blocknotes.data.local.entity.NoteLinkEntity
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NoteLinkRepository @Inject constructor(
    private val noteLinkDao: NoteLinkDao,
    private val noteDao: NoteDao,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {
    fun observeLinkedNotes(fromNoteId: Long): Flow<List<NoteEntity>> =
        noteLinkDao.observeLinkedNotes(fromNoteId)

    suspend fun link(fromNoteId: Long, toNoteId: Long) = withContext(io) {
        if (fromNoteId == toNoteId) return@withContext
        noteLinkDao.insert(NoteLinkEntity(fromNoteId = fromNoteId, toNoteId = toNoteId))
    }

    suspend fun unlink(fromNoteId: Long, toNoteId: Long) = withContext(io) {
        noteLinkDao.delete(fromNoteId, toNoteId)
    }

    suspend fun searchCandidates(
        worldId: Long,
        excludeNoteId: Long,
        query: String,
    ): List<NoteEntity> = withContext(io) {
        noteDao.observeByWorld(worldId).first()
            .asSequence()
            .filter { it.id != excludeNoteId }
            .filter { query.isBlank() || it.title.contains(query, ignoreCase = true) }
            .take(25)
            .toList()
    }
}
