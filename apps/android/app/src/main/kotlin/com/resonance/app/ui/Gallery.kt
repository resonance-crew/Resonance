package com.resonance.app.ui

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.OperationCanceledException
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Log
import android.util.LruCache
import android.util.Size
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.core.content.ContextCompat
import com.resonance.app.BuildConfig
import com.resonance.design.AppFonts
import com.resonance.design.QuietButton
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.chat.GalleryPager
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/** One picture of the phone's library, as the gallery lists it: its id, when it was added (seconds) and its size — nothing more is read. */
internal data class GalleryPhoto(val id: Long, val dateAdded: Long, val bytes: Long) {
    val uri: Uri get() = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
    /** Newest first: by when it was added, then by id. */
    val order: Long get() = dateAdded * 1_000_000L + (id % 1_000_000L)
}

/**
 * The phone's pictures from MediaStore (round 22 §6.2), a page at a time: images only, none still being
 * written (`IS_PENDING` 0), newest first, only their id, date and size. Off the main thread (the caller's).
 */
internal object MediaGallery {
    private val projection = arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media.SIZE)

    fun page(resolver: ContentResolver, offset: Int, limit: Int): List<GalleryPhoto> {
        val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val cursor = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val args = Bundle().apply {
                putString(ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.Images.Media.IS_PENDING} = 0")
                putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Images.Media.DATE_ADDED, MediaStore.Images.Media._ID))
                putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
                putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
                putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
            }
            resolver.query(uri, projection, args, null)
        } else {
            // Android 10 takes the limit in the sort order (11 and later refuse it there, and take the arguments above).
            resolver.query(
                uri, projection, "${MediaStore.Images.Media.IS_PENDING} = 0", null,
                "${MediaStore.Images.Media.DATE_ADDED} DESC, ${MediaStore.Images.Media._ID} DESC LIMIT $limit OFFSET $offset",
            )
        }
        return cursor?.use { c ->
            val id = c.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
            val date = c.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
            val size = c.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
            buildList(c.count) { while (c.moveToNext()) add(GalleryPhoto(c.getLong(id), c.getLong(date), c.getLong(size))) }
        }.orEmpty()
    }
}

/**
 * The gallery's thumbnails (round 22 §6.2): the system's own 256 px thumbnail of each picture
 * (`loadThumbnail`, never a full-size decode), read on a few IO threads and cancelled with the cell that
 * asked, kept in memory up to an eighth of the app's heap.
 */
internal object GalleryThumbnails {
    private val cache = object : LruCache<Long, ImageBitmap>((Runtime.getRuntime().maxMemory() / 8).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()) {
        override fun sizeOf(key: Long, value: ImageBitmap): Int = value.width * value.height * 4
    }
    @OptIn(ExperimentalCoroutinesApi::class)
    private val io = Dispatchers.IO.limitedParallelism(4)

    fun cached(id: Long): ImageBitmap? = cache.get(id)

    suspend fun load(resolver: ContentResolver, photo: GalleryPhoto): ImageBitmap? {
        cache.get(photo.id)?.let { return it }
        return withContext(io) {
            val signal = CancellationSignal()
            // The cell leaving cancels this coroutine, and with it the system's read (its signal).
            val bitmap = suspendCancellableCoroutine<Bitmap?> { cont ->
                cont.invokeOnCancellation { signal.cancel() }
                val read = try {
                    resolver.loadThumbnail(photo.uri, Size(256, 256), signal)
                } catch (e: OperationCanceledException) {
                    null
                } catch (e: Exception) {
                    null
                }
                cont.resume(read)
            }
            bitmap?.asImageBitmap()?.also { cache.put(photo.id, it) }
        }
    }
}

/** What the app may read of the phone's pictures (round 22 §6.2). */
internal enum class GalleryAccess { NotAsked, Full, Partial, Denied, DeniedForever }

/** The permissions the gallery asks for on this Android: 14+ also takes a partial grant. */
internal fun galleryPermissions(): Array<String> = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> arrayOf(Manifest.permission.READ_MEDIA_IMAGES)
    else -> arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
}

/** Where the app stands now: full, partial (14+: some pictures chosen), denied (and whether asking again can show anything), or not asked yet. */
internal fun galleryAccess(context: Context, asked: Boolean): GalleryAccess {
    fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
    val full = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) granted(Manifest.permission.READ_MEDIA_IMAGES) else granted(Manifest.permission.READ_EXTERNAL_STORAGE)
    if (full) return GalleryAccess.Full
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)) return GalleryAccess.Partial
    if (!asked) return GalleryAccess.NotAsked
    val activity = context.findActivity()
    val canAsk = activity != null && galleryPermissions().any { activity.shouldShowRequestPermissionRationale(it) }
    return if (canAsk) GalleryAccess.Denied else GalleryAccess.DeniedForever
}

private fun Context.findActivity(): Activity? {
    var c: Context? = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

/**
 * The phone's pictures in the attach panel (round 22 §6.2), our own grid: a page of 120 at a time from
 * MediaStore, newest first, 3 columns on a phone (4–5 wider), each cell's 256 px thumbnail read as it
 * comes on screen (and let go as it leaves), the paper-dark square meanwhile. A tap chooses a picture —
 * its number in the order chosen in its corner — or lets it go ([onToggle]). With only some pictures
 * allowed (14+), a 「選擇更多相片」 tile leads ([onMore]). A picture taken or deleted while it shows reads
 * the first page again.
 */
@Composable
internal fun GalleryGrid(
    numberOf: (String) -> Int?,
    partial: Boolean,
    onToggle: (Uri) -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
    /**
     * Bumped when what the app may read may have changed (a permission answer — 「選擇更多相片」 on 14+ —
     * or a return from the settings page): the library is read afresh. A grant is no MediaStore change, so
     * the observer below never hears of it.
     */
    access: Int = 0,
    /** What it keeps clear at its foot (the floating 圖片｜卡片 over it). */
    bottom: Dp = 0.dp,
) {
    val context = LocalContext.current
    val resolver = context.contentResolver
    val opened = remember { SystemClock.elapsedRealtime() }
    // What was read stays on screen until the fresh pager's first page takes its place.
    val pager = remember(resolver, access) {
        GalleryPager(PAGE, keyOf = GalleryPhoto::id, orderOf = GalleryPhoto::order) { offset, limit ->
            withContext(Dispatchers.IO) { runCatching { MediaGallery.page(resolver, offset, limit) }.getOrElse { emptyList() } }
        }
    }
    var photos by remember { mutableStateOf<List<GalleryPhoto>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    val grid = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(pager) {
        photos = pager.loadMore()
        loaded = true
        if (BuildConfig.DEBUG) Log.d("Gallery", "first page: ${photos.size} in ${SystemClock.elapsedRealtime() - opened} ms")
    }
    // Near the end of what is read: the next page.
    LaunchedEffect(grid, pager) {
        snapshotFlow { grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }.collectLatest { last ->
            if (loaded && !pager.end && last >= grid.layoutInfo.totalItemsCount - PAGE / 3) photos = pager.loadMore()
        }
    }
    // A picture taken or deleted meanwhile: the first page again (once things settle).
    DisposableEffect(resolver, pager) {
        var pending: kotlinx.coroutines.Job? = null
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                pending?.cancel()
                pending = scope.launch {
                    delay(300)
                    photos = pager.refreshHead()
                }
            }
        }
        resolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer)
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    BoxWithConstraints(modifier) {
        val columns = when {
            maxWidth >= 720.dp -> 5
            maxWidth >= 520.dp -> 4
            else -> 3
        }
        if (loaded && photos.isEmpty() && !partial) {
            BasicText(
                L10n.Messages.galleryEmpty,
                style = AppFonts.body(13.5f, lineHeight = 1.5f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
        }
        LazyVerticalGrid(
            GridCells.Fixed(columns),
            Modifier.fillMaxSize(),
            state = grid,
            contentPadding = PaddingValues(start = 2.dp, end = 2.dp, top = 2.dp, bottom = 2.dp + bottom),
        ) {
            if (partial) item(key = "more", contentType = "more") { MoreTile(onMore) }
            items(photos, key = { it.id }, contentType = { "photo" }) { photo ->
                PhotoCell(photo, numberOf(photo.uri.toString())) { onToggle(photo.uri) }
            }
        }
    }
}

/** How many pictures a page of the gallery reads. */
private const val PAGE = 120

/** One picture: its thumbnail as soon as it is read (cancelled should the cell leave first), its number or an empty ring. */
@Composable
private fun PhotoCell(photo: GalleryPhoto, number: Int?, onClick: () -> Unit) {
    val resolver = LocalContext.current.contentResolver
    val thumb by produceState(GalleryThumbnails.cached(photo.id), photo.id) { if (value == null) value = GalleryThumbnails.load(resolver, photo) }
    val chosen = number != null
    val veil = Tokens.Cream.copy(alpha = 0.28f)
    Box(
        Modifier
            .aspectRatio(1f)
            .padding(1.dp)
            .background(Tokens.CreamDark)
            .clickable(role = Role.Checkbox, onClickLabel = L10n.Messages.attachImage, onClick = onClick)
            .semantics {
                contentDescription = L10n.Messages.attachImage
                selected = chosen
            },
    ) {
        thumb?.let {
            Image(
                it, null,
                Modifier.fillMaxSize().drawWithContent {
                    drawContent()
                    if (chosen) drawRect(veil)
                },
                contentScale = ContentScale.Crop,
            )
        }
        if (number != null) NumberBadge(number, Modifier.align(Alignment.TopEnd).padding(6.dp))
        else Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(6.dp)
                .size(22.dp)
                .border(1.5.dp, Color.White.copy(alpha = 0.92f), CircleShape)
                .background(Color.Black.copy(alpha = 0.12f), CircleShape),
        )
    }
}

/** 「選擇更多相片」: the first cell while only some pictures are allowed — the system's choice again. */
@Composable
private fun MoreTile(onClick: () -> Unit) {
    Column(
        Modifier
            .aspectRatio(1f)
            .padding(1.dp)
            .background(Tokens.ButtonTonal)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        OrganicIcon(IconName.Plus, size = 22.dp, color = Tokens.ButtonOnTonal, strokeWidth = Tokens.Ink.value)
        BasicText(
            L10n.Messages.galleryMore,
            style = AppFonts.body(12f, 600, lineHeight = 1.3f, color = Tokens.ButtonOnTonal).copy(textAlign = TextAlign.Center),
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}

/**
 * The gallery before it can show anything (round 22 §6.2): a short word on why — and 「允許讀取相片」 (the
 * system's question; 「前往設定」 once it won't be asked again) — beside 「改用系統選擇器」, so sending
 * pictures never depends on the permission.
 */
@Composable
internal fun GalleryPrompt(forever: Boolean, onAllow: () -> Unit, onSystemPicker: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        OrganicIcon(IconName.Image, size = 30.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
        BasicText(
            L10n.Messages.galleryPrimer,
            style = AppFonts.body(14f, lineHeight = 1.55f, color = Tokens.Text).copy(textAlign = TextAlign.Center),
        )
        OrganicButton(if (forever) L10n.Messages.galleryOpenSettings else L10n.Messages.galleryAllow, onClick = onAllow)
        QuietButton(L10n.Messages.gallerySystemPicker, onClick = onSystemPicker)
    }
}
