package com.resonance.app

import android.content.Context
import android.graphics.ImageDecoder
import android.graphics.drawable.Drawable
import android.util.Log
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.chat.StickerRecents
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

/**
 * The 小紙團 stickers on this device (round 22 §2, §4.5): the catalog and files the build bundles
 * (`public/stickers`, copied into the assets' `stickers/` by the `syncStickers` task) — drawn at once,
 * with nothing to wait for — and, for a sticker a later build added, the site's catalog and files
 * (`/stickers/<pack>/<id>.webp?v=`, cached for good there), fetched once and kept in
 * cacheDir/stickers. A sticker found in neither is drawn as its message's fallback words.
 *
 * Key poses (256 px) are kept decoded in a small memory cache; an animated file is decoded afresh for
 * each playback ([animated]: an `AnimatedImageDrawable`, its two plays baked in) and let go when it ends.
 */
object Stickers {
    private lateinit var app: Context
    private var http: OkHttpClient = OkHttpClient()
    private const val TAG = "Stickers"

    private val _catalog = MutableStateFlow(StickerCatalog(0, emptyList()))
    /** What this device can draw: the bundle's catalog, with the site's packs once read ([ensure]). */
    val catalog: StateFlow<StickerCatalog> = _catalog
    private var bundled: StickerCatalog = StickerCatalog(0, emptyList())
    private val fetching = Mutex()
    /** When the site's catalog was last asked for (it is asked again only after a while, should it fail). */
    @Volatile private var askedAt = 0L

    /** Key poses and pack icons, decoded (each about 256 KB): a pack's worth and the thread's on screen. */
    private val poses = object : LruCache<String, ImageBitmap>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }

    fun init(context: Context, client: OkHttpClient) {
        app = context.applicationContext
        http = client
        bundled = runCatching { app.assets.open("stickers/catalog.json").bufferedReader().use { it.readText() } }
            .getOrNull()?.let(StickerCatalog::parse) ?: StickerCatalog(0, emptyList())
        _catalog.value = bundled
    }

    /** The sticker [ref] names, if this device knows it now (bundled, or read from the site already). */
    fun find(ref: ChatSticker): StickerCatalog.Sticker? = _catalog.value.find(ref)

    /**
     * The sticker [ref] names: bundled, else from the site's catalog (read once; asked again after a
     * minute should that fail). Null: no such sticker anywhere this device can reach.
     */
    suspend fun ensure(ref: ChatSticker, origin: String): StickerCatalog.Sticker? {
        find(ref)?.let { return it }
        return fetching.withLock {
            find(ref)?.let { return@withLock it }
            if (System.currentTimeMillis() - askedAt < RETRY_MILLIS) return@withLock null
            askedAt = System.currentTimeMillis()
            val text = withContext(Dispatchers.IO) { get("${origin.trimEnd('/')}/stickers/catalog.json")?.decodeToString() }
            val remote = text?.let(StickerCatalog::parse) ?: return@withLock null
            _catalog.value = _catalog.value.merged(remote)
            find(ref)
        }
    }

    private fun isBundled(sticker: StickerCatalog.Sticker): Boolean = bundled.find(sticker.ref) == sticker

    /** The key pose of [sticker] (null: it can't be read now). */
    suspend fun pose(sticker: StickerCatalog.Sticker, origin: String): ImageBitmap? {
        val key = "pose:${sticker.thumb}?${sticker.v}"
        poses.get(key)?.let { return it }
        return withContext(Dispatchers.IO) {
            val source = source(sticker.thumb, sticker.thumbUrl, sticker.v, bundledFile = isBundled(sticker), origin = origin) ?: return@withContext null
            decodeBitmap(source)?.also { poses.put(key, it) }
        }
    }

    /** The pose kept in memory, if it is (drawn without a frame's wait). */
    fun cachedPose(sticker: StickerCatalog.Sticker): ImageBitmap? = poses.get("pose:${sticker.thumb}?${sticker.v}")

    /** A pack's tab icon (the character's head). */
    suspend fun icon(pack: StickerCatalog.Pack, origin: String): ImageBitmap? {
        val key = "icon:${pack.icon}?${pack.iconV}"
        poses.get(key)?.let { return it }
        return withContext(Dispatchers.IO) {
            val bundledIcon = bundled.pack(pack.id)?.let { it.icon == pack.icon && it.iconV == pack.iconV } == true
            val source = source(pack.icon, pack.iconUrl, pack.iconV, bundledFile = bundledIcon, origin = origin) ?: return@withContext null
            decodeBitmap(source)?.also { poses.put(key, it) }
        }
    }

    /**
     * [sticker]'s animated file, decoded for one playback: an `AnimatedImageDrawable` whose loop count
     * the file carries (two plays) — or, for a still file (the placeholders before the art lands), a
     * plain drawable. Null: it can't be read.
     */
    suspend fun animated(sticker: StickerCatalog.Sticker, origin: String): Drawable? = withContext(Dispatchers.IO) {
        val source = source(sticker.file, sticker.url, sticker.v, bundledFile = isBundled(sticker), origin = origin) ?: return@withContext null
        try {
            ImageDecoder.decodeDrawable(source) { decoder, _, _ -> decoder.allocator = ImageDecoder.ALLOCATOR_DEFAULT }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "can't decode ${sticker.file}: $e")
            null
        }
    }

    /** Where a file is read from: the bundle's asset, else the site's file kept in cacheDir/stickers (fetched once). */
    private fun source(path: String, url: String, v: String, bundledFile: Boolean, origin: String): ImageDecoder.Source? {
        if (bundledFile) return ImageDecoder.createSource(app.assets, "stickers/$path")
        val kept = File(app.cacheDir, "stickers/${path.removeSuffix(".webp")}-$v.webp")
        if (!kept.isFile) {
            val bytes = get(origin.trimEnd('/') + url) ?: return null
            kept.parentFile?.mkdirs()
            val tmp = File(kept.parentFile, kept.name + ".part")
            tmp.writeBytes(bytes)
            tmp.renameTo(kept)
        }
        return ImageDecoder.createSource(kept)
    }

    private fun decodeBitmap(source: ImageDecoder.Source): ImageBitmap? = try {
        ImageDecoder.decodeBitmap(source) { decoder, _, _ -> decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE }.asImageBitmap()
    } catch (e: Exception) {
        Log.w(TAG, "can't decode a pose: $e")
        null
    }

    private fun get(url: String): ByteArray? = try {
        http.newCall(Request.Builder().url(url).build()).execute().use { r -> if (r.isSuccessful) r.body?.bytes() else null }
    } catch (e: Exception) {
        null
    }

    private const val RETRY_MILLIS = 60_000L
}

/**
 * Where an account's recent stickers wait on the device (`sticker-recents.xml`, outside the backup),
 * gone with its other local data on sign-out.
 */
class StickerRecentsPrefs(private val prefs: android.content.SharedPreferences) : StickerRecents.Storage {
    override fun read(account: String): String? = prefs.getString("recents:$account", null)

    override fun write(account: String, value: String?) {
        prefs.edit().apply { if (value == null) remove("recents:$account") else putString("recents:$account", value) }.apply()
    }

    companion object {
        const val FILE = "sticker-recents"
    }
}
