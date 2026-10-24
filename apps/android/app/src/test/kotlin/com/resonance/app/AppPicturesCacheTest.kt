package com.resonance.app

import android.app.Application
import coil3.ImageLoader
import coil3.imageDecoderEnabled
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.network.HttpException
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.CachePolicy
import coil3.request.ErrorResult
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import okio.ByteString.Companion.decodeHex
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The app's own pictures — covers, avatars, story and link pictures — keep pictures on disk and
 * nothing else, as the chat pictures do (ChatPicturesCacheTest): Coil's own strategy keeps a 404 and
 * serves it for good, so a picture that failed once — a link picture the server couldn't fetch just
 * then, which it answers with a 404 it says not to keep — never showed on that device again, however
 * often its card was opened.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class AppPicturesCacheTest {
    private val server = MockWebServer()
    @get:Rule val folder = TemporaryFolder()
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private val disk by lazy { DiskCache.Builder().directory(folder.root).build() }

    @Before fun start() = server.start()
    @After fun stop() = server.shutdown()

    /** The app's loader, with a disk of the test's own and BitmapFactory to decode (Robolectric's ImageDecoder reads no cached file). */
    private fun loader(): ImageLoader = ResonanceApp.imageLoader(app, OkHttpClient()).newBuilder().diskCache { disk }.imageDecoderEnabled(false).build()

    private fun picture() = MockResponse().setHeader("Content-Type", "image/png").setBody(Buffer().write(PNG.decodeHex()))

    /** A picture as a screen opening asks for it: the disk first, never the memory (which keeps no failure anyway). */
    private fun ImageLoader.load(url: String) = runBlocking {
        execute(ImageRequest.Builder(app).data(url).memoryCachePolicy(CachePolicy.DISABLED).build())
    }

    @Test fun aCoverThatFailedOnceShowsWhenItsCardIsOpenedAgain() {
        val loader = loader()
        for (code in listOf(404, 410)) {
            val url = server.url("/covers/$code.png").toString()
            server.enqueue(MockResponse().setResponseCode(code))
            server.enqueue(picture())
            val failed = loader.load(url)
            assertEquals(code, ((failed as ErrorResult).throwable as HttpException).response.code)
            disk.openSnapshot(url).use { assertNull("a $code is not kept", it) }
            val shown = loader.load(url)
            assertTrue("$code, then: $shown", shown is SuccessResult)
        }
        assertEquals(4, server.requestCount)
        // A picture is kept, and opened again it comes from the disk.
        loader.load(server.url("/covers/404.png").toString()).let { assertTrue("$it", it is SuccessResult) }
        assertEquals(4, server.requestCount)
    }

    @Test fun aFailureAnOlderBuildKeptIsAskedForAgain() {
        val url = server.url("/covers/c1.png").toString()
        server.enqueue(MockResponse().setResponseCode(404))
        server.enqueue(picture())
        // The builds before this one read through Coil's own strategy, which kept the 404 on disk.
        val older = ImageLoader.Builder(app).components { add(OkHttpNetworkFetcherFactory(callFactory = { OkHttpClient() })) }
            .diskCache { disk }.imageDecoderEnabled(false).build()
        assertTrue(older.load(url) is ErrorResult)
        assertTrue(older.load(url) is ErrorResult)
        assertEquals(1, server.requestCount)
        val shown = loader().load(url)
        assertTrue("$shown", shown is SuccessResult)
        assertEquals(2, server.requestCount)
    }

    private companion object {
        /** A 1×1 PNG. */
        const val PNG = "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c6338916204000356015fe81784520000000049454e44ae426082"
    }
}
