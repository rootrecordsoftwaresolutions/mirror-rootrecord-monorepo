package com.rootrecord.kilauea.alerts.data.remote

import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Header
import okhttp3.MultipartBody
import retrofit2.http.Multipart
import retrofit2.http.Part
import retrofit2.http.Path

/**
 * Root Record per-product API shard — weather dashboard on api-kilauea.rootrecord.info (Worker `rootrecord-api-kilauea`).
 * Requires [com.rootrecord.kilauea.alerts.di.GuestHeaderInterceptor] on the OkHttp client.
 */
interface RootRecordApi {
    @GET("/api/dashboard")
    suspend fun dashboard(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double,
        @Query("location_id") locationId: String? = null,
        @Query("refresh") refresh: Boolean? = null,
    ): String

    /** Approved-only volcano photo gallery. */
    @GET("/api/photos/gallery")
    suspend fun photosGallery(
        @Query("limit") limit: Int = 30,
        @Query("cursor") cursor: String? = null,
    ): String

    /** Auth required: upload a photo for moderation (multipart form). */
    @Multipart
    @POST("/api/photos/upload")
    suspend fun uploadPhoto(
        @Header("Authorization") bearer: String,
        @Part file: MultipartBody.Part,
        @Part("caption") caption: String? = null,
    ): String

    /** Near–real-time air quality (Open-Meteo model) for Volcano Village area. */
    @GET("/api/air-quality/current")
    suspend fun airQualityCurrent(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double,
    ): String

    /** Serve photo bytes (approved only). Used by Coil (no auth). */
    @GET("/api/photos/file/{id}")
    suspend fun photoFile(
        @Path("id") id: String,
    ): okhttp3.ResponseBody

    /**
     * Latest developer/team update (synced from the team's announcements channel into D1).
     * Server returns `{ messages: [row] | [] }` — at most one row.
     */
    @GET("/api/mobile/developer-messages")
    suspend fun developerMessages(
        @Query("app_id") appId: String = "rootrecord_kilauea_alerts_android",
    ): String

    /** Ordered YouTube / live stream list for the Live Feeds pager (D1-backed). */
    @GET("/api/mobile/kilauea-live-streams")
    suspend fun kilaueaLiveStreams(): String
}
