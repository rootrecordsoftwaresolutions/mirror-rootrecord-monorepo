package com.rootrecord.blocknotes.data.local



import android.content.Context

import com.rootrecord.blocknotes.data.local.dao.ReferenceDao

import com.rootrecord.blocknotes.data.local.entity.ReferenceCacheEntity

import com.rootrecord.blocknotes.di.IoDispatcher

import dagger.hilt.android.qualifiers.ApplicationContext

import kotlinx.coroutines.CoroutineDispatcher

import kotlinx.coroutines.withContext

import javax.inject.Inject

import javax.inject.Singleton



@Singleton

class ReferenceAssetLoader @Inject constructor(

    @param:ApplicationContext private val context: Context,

    private val referenceDao: ReferenceDao,

    @param:IoDispatcher private val io: CoroutineDispatcher,

) {

    companion object {

        /** Bump when bundled reference JSON changes (forces re-seed on next app start). */

        const val BUNDLE_VERSION = "grahamedgecombe-legacy-full"

    }



    suspend fun loadBundledIfNeeded() = withContext(io) {

        val categories = listOf(

            "blocks" to "reference/blocks.json",

            "items" to "reference/items.json",

            "mobs" to "reference/mobs.json",

            "enchantments" to "reference/enchantments.json",

            "potions" to "reference/potions.json",

            "trades" to "reference/trades.json",

        )

        for ((category, assetPath) in categories) {

            val bundleId = "$category:bundle"

            val existing = referenceDao.getById(bundleId)

            if (existing?.version == BUNDLE_VERSION) continue

            val json = runCatching {

                context.assets.open(assetPath).bufferedReader().use { it.readText() }

            }.getOrNull() ?: continue

            referenceDao.upsert(

                ReferenceCacheEntity(

                    id = bundleId,

                    category = category,

                    jsonBlob = json,

                    version = BUNDLE_VERSION,

                ),

            )

        }

    }

}

