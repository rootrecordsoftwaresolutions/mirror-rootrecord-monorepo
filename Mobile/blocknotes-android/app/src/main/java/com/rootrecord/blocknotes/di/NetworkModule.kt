package com.rootrecord.blocknotes.di

import com.rootrecord.blocknotes.data.remote.AuthBearerInterceptor
import com.rootrecord.blocknotes.data.remote.GuestHeaderInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

// Per-product API shard for BlockNotes (Worker: rootrecord-api-blocknotes).
const val ROOTRECORD_BLOCKNOTES_BASE = "https://rootrecord-api-blocknotes.rootrecord.workers.dev/"

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    @Named("rootrecord")
    fun provideRootRecordOkHttp(
        guestHeaderInterceptor: GuestHeaderInterceptor,
        authBearerInterceptor: AuthBearerInterceptor,
    ): OkHttpClient {
        val log = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(guestHeaderInterceptor)
            .addInterceptor(authBearerInterceptor)
            .addInterceptor(log)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /** Public Mojang APIs — no Root Record auth headers. */
    @Provides
    @Singleton
    @Named("mojang")
    fun provideMojangOkHttp(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}
