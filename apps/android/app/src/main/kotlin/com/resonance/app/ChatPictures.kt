package com.resonance.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import coil3.ImageLoader
import coil3.annotation.ExperimentalCoilApi
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.network.CacheStrategy
import coil3.network.NetworkRequest
import coil3.network.NetworkResponse
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.Options
import com.resonance.kit.chat.OutgoingImage
import okhttp3.OkHttpClient
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pictures in chat on this device (round 7 §4): the [loader] that reads them with the account's
 * token — never the app's own image loader, whose client carries none — with its memory and a
 * folder of its own on disk; and the pictures sent from here, drawn from the device under the id the
 * server keeps them by (the message's client id) while they go and after the conversation's message
 * replaces the one on its way, never read back. All of it goes with the account ([clear], from
 * Session.forget). The twin of the web's lib/chat/localPictures.
 */
class ChatPictures(val loader: ImageLoader) {
    /** A picture made ready to send: what goes up, and the thread's copy of it. */
    class Prepared(val image: OutgoingImage, val preview: ImageBitmap)

    /** A picture this phone can't read (or can't make small enough to send): 不支援這種圖片格式. */
    class Unsupported(cause: Throwable? = null) : Exception("Not a picture that can be sent.", cause)

    /** The pictures sent from here, by the id the server keeps them under: the newest [KEPT]. */
    private val local = object : LinkedHashMap<String, Prepared>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Prepared>?) = size > KEPT
    }

    /** Draws [picture] as picture [id] from now on (the message's client id). */
    @Synchronized fun keep(id: String, picture: Prepared) {
        local[id] = picture
    }

    /** Picture [id] as this device sent it, if it did. */
    @Synchronized fun local(id: String): Prepared? = local[id]

    /** The account is leaving: none of its pictures stays — those sent from here, nor any read (blocking: disk). */
    fun clear() {
        synchronized(this) { local.clear() }
        loader.memoryCache?.clear()
        runCatching { loader.diskCache?.clear() }
    }

    companion object {
        /** How many pictures sent from here are kept to draw (a session's worth). */
        const val KEPT = 40

        /** What a picture is made ready to: at most this on its longest side (the server keeps 2048). */
        const val MAX_SIDE = 2048

        /** The thread's own copy: at most this on its longest side. */
        private const val PREVIEW_SIDE = 1080

        /** The largest file sent (the upload's 4 MB, less room for the form around it: UPLOAD_MAX_FILE_BYTES). */
        const val MAX_BYTES = 4 * 1024 * 1024 - 16 * 1024

        /** The disk the read pictures may take. */
        private const val DISK_BYTES = 80L * 1024 * 1024

        /**
         * The loader for the thread's pictures: [client] carries the account's token; [directory] is
         * theirs alone; only a picture is kept ([PicturesOnly]).
         */
        @OptIn(ExperimentalCoilApi::class)
        fun loader(context: Context, directory: File, client: OkHttpClient): ImageLoader = ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { client }, cacheStrategy = { PicturesOnly })) }
            .diskCache { DiskCache.Builder().directory(directory).maxSizeBytes(DISK_BYTES).build() }
            .build()

        /**
         * A picture picked to send, made ready on the device (off the main thread): upright, at most
         * [MAX_SIDE] on its longest side, a JPEG at 0.85 — a WebP where it has transparency — under
         * [MAX_BYTES]; a GIF that fits goes as it is (the server keeps it moving). HEIC and the rest the
         * phone reads become a JPEG. Throws [Unsupported] for anything else.
         */
        fun prepare(context: Context, uri: Uri): Prepared {
            val resolver = context.contentResolver
            try {
                if (resolver.getType(uri) == "image/gif") {
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw Unsupported()
                    if (bytes.size <= MAX_BYTES) {
                        var size = 0 to 0
                        val first = ImageDecoder.decodeBitmap(ImageDecoder.createSource(bytes)) { decoder, info, _ ->
                            size = info.size.width to info.size.height
                            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                            decoder.scaleWithin(info.size.width, info.size.height, PREVIEW_SIDE)
                        }
                        return Prepared(OutgoingImage(bytes, "image/gif", size.first, size.second), first.asImageBitmap())
                    }
                }
                val bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.scaleWithin(info.size.width, info.size.height, MAX_SIDE)
                }
                val (bytes, type, sent) = encode(bitmap)
                val preview = sent.scaledWithin(PREVIEW_SIDE)
                return Prepared(OutgoingImage(bytes, type, sent.width, sent.height), preview.asImageBitmap())
            } catch (e: Unsupported) {
                throw e
            } catch (e: Exception) {
                throw Unsupported(e)
            } catch (e: OutOfMemoryError) {
                throw Unsupported(e)
            }
        }

        /** The picture as it goes up: JPEG (WebP with transparency), its quality and then its size stepped down until it fits. */
        private fun encode(bitmap: Bitmap): Triple<ByteArray, String, Bitmap> {
            val webp = bitmap.hasAlpha()
            var current = bitmap
            repeat(4) {
                for (quality in intArrayOf(85, 72, 60)) {
                    val bytes = ByteArrayOutputStream().use { out ->
                        current.compress(if (webp) webpFormat() else Bitmap.CompressFormat.JPEG, quality, out)
                        out.toByteArray()
                    }
                    if (bytes.size <= MAX_BYTES) return Triple(bytes, if (webp) "image/webp" else "image/jpeg", current)
                }
                current = Bitmap.createScaledBitmap(current, (current.width * 0.75f).roundToInt().coerceAtLeast(1), (current.height * 0.75f).roundToInt().coerceAtLeast(1), true)
            }
            throw Unsupported()
        }

        @Suppress("DEPRECATION")
        private fun webpFormat(): Bitmap.CompressFormat =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP

        /** Decodes at most [side] on the longest side (never larger than it is). */
        private fun ImageDecoder.scaleWithin(width: Int, height: Int, side: Int) {
            val long = max(width, height)
            if (long > side) {
                val scale = side.toFloat() / long
                setTargetSize((width * scale).roundToInt().coerceAtLeast(1), (height * scale).roundToInt().coerceAtLeast(1))
            }
        }

        private fun Bitmap.scaledWithin(side: Int): Bitmap {
            val long = max(width, height)
            if (long <= side) return this
            val scale = side.toFloat() / long
            return Bitmap.createScaledBitmap(this, (width * scale).roundToInt().coerceAtLeast(1), (height * scale).roundToInt().coerceAtLeast(1), true)
        }
    }
}

/**
 * What the pictures' disk cache keeps: a picture (a 2xx answer, which never changes) and nothing
 * else. Coil's own strategy keeps any answer and gives it back for good — a 404 (the picture read a
 * moment before its message was sent, say) would stand for the picture on this device from then on,
 * and a tap to try again would never reach the server. Anything kept from before that isn't a
 * picture is asked for again.
 */
@OptIn(ExperimentalCoilApi::class)
internal object PicturesOnly : CacheStrategy {
    override suspend fun read(cacheResponse: NetworkResponse, networkRequest: NetworkRequest, options: Options): CacheStrategy.ReadResult =
        if (cacheResponse.code in 200..299) CacheStrategy.ReadResult(cacheResponse) else CacheStrategy.ReadResult(networkRequest)

    override suspend fun write(
        cacheResponse: NetworkResponse?,
        networkRequest: NetworkRequest,
        networkResponse: NetworkResponse,
        options: Options,
    ): CacheStrategy.WriteResult =
        if (networkResponse.code in 200..299) CacheStrategy.WriteResult(networkResponse) else CacheStrategy.WriteResult.DISABLED
}
