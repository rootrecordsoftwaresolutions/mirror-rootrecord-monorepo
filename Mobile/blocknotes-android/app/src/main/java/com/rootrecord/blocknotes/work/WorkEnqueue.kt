package com.rootrecord.blocknotes.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object WorkEnqueue {

    /** Schedule periodic reference DB version check (stub for Phase 4). */
    fun schedulePeriodic(context: Context) {
        val wm = WorkManager.getInstance(context)
        val network = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        wm.enqueueUniquePeriodicWork(
            "blocknotes_reference_refresh",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ReferenceRefreshWorker>(24, TimeUnit.HOURS)
                .setConstraints(network)
                .build(),
        )

        wm.enqueueUniquePeriodicWork(
            "blocknotes_account_sync_periodic",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<AccountSyncWorker>(6, TimeUnit.HOURS)
                .setConstraints(network)
                .build(),
        )
    }
}
