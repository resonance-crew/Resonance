package com.resonance.app

import coil3.annotation.ExperimentalCoilApi
import coil3.network.CacheStrategy
import coil3.network.NetworkRequest
import coil3.network.NetworkResponse
import coil3.request.Options
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The chat pictures' disk cache keeps pictures and nothing else: Coil's own strategy keeps any
 * answer and serves it for good, so a 404 (a picture read before its message was sent) would stand
 * for the picture on this device, and its tap to try again never reached the server — seen on the
 * tablet before this.
 */
@OptIn(ExperimentalCoilApi::class)
@RunWith(RobolectricTestRunner::class)
class ChatPicturesCacheTest {
    private val options by lazy { Options(RuntimeEnvironment.getApplication()) }
    private val request = NetworkRequest("http://10.0.2.2:3100/api/v1/chat-images/p1?size=thumb")

    @Test fun aPictureIsKeptAndGivenBack() = runBlocking {
        val picture = NetworkResponse(code = 200)
        assertSame(picture, PicturesOnly.write(null, request, picture, options).response)
        assertSame(picture, PicturesOnly.read(picture, request, options).response)
    }

    @Test fun aRefusalIsNeverKeptAndOneKeptBeforeIsAskedForAgain() = runBlocking {
        for (code in listOf(404, 401, 500)) {
            assertEquals(CacheStrategy.WriteResult.DISABLED, PicturesOnly.write(null, request, NetworkResponse(code = code), options))
        }
        val kept = PicturesOnly.read(NetworkResponse(code = 404), request, options)
        assertNull(kept.response)
        assertSame(request, kept.request)
    }
}
