package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.local.entity.NoteEntity
import com.rootrecord.blocknotes.data.repository.NoteRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class SearchNotesUseCase @Inject constructor(
    private val noteRepository: NoteRepository,
) {
    suspend operator fun invoke(query: String): List<NoteEntity> =
        noteRepository.search(query)

    fun observe(query: String): Flow<List<NoteEntity>> =
        noteRepository.observeSearch(query)
}
