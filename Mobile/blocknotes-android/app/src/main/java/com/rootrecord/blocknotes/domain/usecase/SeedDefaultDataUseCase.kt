package com.rootrecord.blocknotes.domain.usecase

import com.rootrecord.blocknotes.data.local.DatabaseSeeder
import javax.inject.Inject

class SeedDefaultDataUseCase @Inject constructor(
    private val databaseSeeder: DatabaseSeeder,
) {
    suspend operator fun invoke() = databaseSeeder.seedIfNeeded()
}
