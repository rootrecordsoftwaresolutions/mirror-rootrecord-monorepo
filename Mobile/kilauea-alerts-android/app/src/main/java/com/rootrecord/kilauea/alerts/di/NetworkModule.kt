package com.rootrecord.kilauea.alerts.di

import com.rootrecord.kilauea.alerts.data.remote.AuthBearerInterceptor
import com.rootrecord.kilauea.alerts.data.remote.GuestHeaderInterceptor
import com.rootrecord.kilauea.alerts.data.remote.PublicApiInterceptor
import com.rootrecord.kilauea.alerts.data.remote.RootRecordApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.scalars.ScalarsConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

private const val ROOTRECORD_BASE = "https://api.rootrecord.info/"

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

    @Provides
    @Singleton
    @Named("public")
    fun providePublicOkHttp(): OkHttpClient {
        val log = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(PublicApiInterceptor())
            .addInterceptor(log)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRootRecordApi(@Named("rootrecord") client: OkHttpClient): RootRecordApi =
        Retrofit.Builder()
            .baseUrl(ROOTRECORD_BASE)
            .client(client)
            .addConverterFactory(ScalarsConverterFactory.create())
            .build()
            .create(RootRecordApi::class.java)
}
