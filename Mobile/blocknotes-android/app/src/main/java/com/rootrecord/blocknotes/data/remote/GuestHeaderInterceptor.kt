package com.rootrecord.blocknotes.data.remote

import com.rootrecord.blocknotes.data.local.BlockNotesPreferences
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class GuestHeaderInterceptor @Inject constructor(
    private val prefs: BlockNotesPreferences,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val guest = runBlocking { prefs.ensureGuestId() }
        val req = chain.request().newBuilder()
            .header("X-Guest-Id", guest)
            .header(
                "User-Agent",
                "BlockNotes/0.1 (Root Record; https://rootrecord.info; Android)",
            )
            .build()
        return chain.proceed(req)
    }
}
