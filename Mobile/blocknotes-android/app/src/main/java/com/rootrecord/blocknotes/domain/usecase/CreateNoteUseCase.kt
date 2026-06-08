package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.repository.NoteRepository
import javax.inject.Inject

class CreateNoteUseCase @Inject constructor(
    private val noteRepository: NoteRepository,
) {
    suspend operator fun invoke(
        notebookId: Long,
        title: String,
        markdownBody: String = "",
        pinned: Boolean = false,
        colorArgb: Int? = null,
        tagNames: List<String> = emptyList(),
        waypointId: Long? = null,
        areaId: Long? = null,
    ): Long = noteRepository.create(
        notebookId = notebookId,
        title = title,
        markdownBody = markdownBody,
        pinned = pinned,
        colorArgb = colorArgb,
        tagNames = tagNames,
        waypointId = waypointId,
        areaId = areaId,
    )
}
