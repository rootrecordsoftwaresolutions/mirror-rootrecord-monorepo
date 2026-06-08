package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import com.rootrecord.blocknotes.data.repository.BlockNotesAccountSyncRepository
import com.rootrecord.blocknotes.data.repository.SnapshotRepository
import com.rootrecord.blocknotes.data.sync.AccountSyncDirection
import com.rootrecord.blocknotes.data.sync.AccountSyncResult
import com.rootrecord.blocknotes.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncAccountDataUseCase @Inject constructor(
    private val prefs: BlockNotesPreferences,
    private val snapshotRepository: SnapshotRepository,
    private val accountSyncRepository: BlockNotesAccountSyncRepository,
    private val syncDedicatedServer: SyncDedicatedServerUseCase,
    @param:IoDispatcher private val io: CoroutineDispatcher,
) {

    suspend fun syncIfSignedIn(): Result<AccountSyncResult?> = withContext(io) {
        if (!prefs.authSignedIn.first()) return@withContext Result.success(null)
        runCatching {
            syncDedicatedServer.sync()
            val local = snapshotRepository.exportSnapshot()
            val remote = accountSyncRepository.fetchRemoteSnapshot().getOrThrow()
            val localRev = local.maxContentRevision()
            val remoteRev = remote?.updatedAt ?: 0L

            val outcome = when {
                remote == null && local.hasUserContent() -> {
                    val updatedAt = accountSyncRepository.pushSnapshot(local).getOrThrow()
                    AccountSyncResult(AccountSyncDirection.PushedToCloud, updatedAt)
                }
                remote == null -> {
                    AccountSyncResult(AccountSyncDirection.UpToDate, 0L)
                }
                !local.hasUserContent() && remoteRev > 0L -> {
                    snapshotRepository.importSnapshot(remote.snapshot)
                    AccountSyncResult(AccountSyncDirection.PulledFromCloud, remoteRev)
                }
                remoteRev > localRev -> {
                    snapshotRepository.importSnapshot(remote.snapshot)
                    AccountSyncResult(AccountSyncDirection.PulledFromCloud, remoteRev)
                }
                localRev > remoteRev -> {
                    val updatedAt = accountSyncRepository.pushSnapshot(local).getOrThrow()
                    AccountSyncResult(AccountSyncDirection.PushedToCloud, updatedAt)
                }
                else -> AccountSyncResult(AccountSyncDirection.UpToDate, remoteRev)
            }
            prefs.setCloudSyncUpdatedAt(outcome.cloudUpdatedAt.coerceAtLeast(prefs.getCloudSyncUpdatedAt()))
            prefs.setCloudSyncError(null)
            outcome
        }.onFailure { error ->
            prefs.setCloudSyncError(error.message ?: "Sync failed")
        }
    }
}
