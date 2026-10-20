package com.resonance.app.ui.share

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.InputStream

/**
 * Where a share's pictures live: `cacheDir/share`, emptied before each share (the last share's
 * targets have long read theirs) and on sign-out, handed to other apps only as content URIs of the
 * app's own FileProvider (`{package}.share`, res/xml/share_paths.xml: that folder alone).
 */
object ShareFiles {
    const val DIR = "share"
    /** Instagram's movable layer and its background (written only when Stories is offered). */
    const val STICKER = "sticker.png"
    const val BACKDROP = "backdrop.jpg"

    fun dir(context: Context): File = File(context.cacheDir, DIR)

    /** Empties [dir] (the folder itself stays out of the way of the next share). */
    fun clear(dir: File) {
        dir.listFiles()?.forEach { it.deleteRecursively() }
    }

    /** A file of the share folder by its own name, never a path that leads out of it. */
    fun file(context: Context, name: String): File? {
        if (name.isEmpty() || name.contains('/') || name.contains('\\') || name.startsWith(".")) return null
        return File(dir(context), name)
    }

    /** The content URI another app reads [file] by (read access granted with the intent). */
    fun uri(context: Context, file: File): Uri = FileProvider.getUriForFile(context, authority(context), file)

    fun authority(context: Context): String = "${context.packageName}.share"

    /** [bitmap] as a JPEG (the composite, the backdrop: opaque) or a PNG (the sticker: its alpha kept), written to [file]. */
    fun write(bitmap: Bitmap, file: File, png: Boolean) {
        file.parentFile?.mkdirs()
        file.outputStream().buffered().use { out ->
            bitmap.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, if (png) 100 else JPEG_QUALITY, out)
        }
    }

    /** The recipe's JPEG quality (share-card.json `jpegQuality` 0.9). */
    const val JPEG_QUALITY = 90
}

/**
 * 儲存圖片: the share picture into the shared Pictures/Resonance folder (MediaStore, no permission
 * from API 29 on), written while pending so the gallery never shows half a picture; null when it
 * couldn't be (the folder full, the picture gone).
 */
object ImageSaver {
    const val FOLDER = "Pictures/Resonance"

    fun save(context: Context, source: InputStream, displayName: String): Uri? {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, ShareIntents.JPEG)
            put(MediaStore.Images.Media.RELATIVE_PATH, FOLDER)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values) ?: return null
        return try {
            resolver.openOutputStream(uri)?.use { out -> source.copyTo(out) } ?: error("no stream")
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            uri
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            null
        }
    }
}
