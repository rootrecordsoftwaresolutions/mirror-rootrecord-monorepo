package com.rootrecord.blocknotes.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.rootrecord.blocknotes.work.AccountSyncWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AccountSyncScheduler @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {
    fun requestSync() {
        val network = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<AccountSyncWorker>()
                .setConstraints(network)
                .build(),
        )
    }

    private companion object {
        const val WORK_NAME = "blocknotes_account_sync"
    }
}
