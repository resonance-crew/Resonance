package com.resonance.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.ui.graphics.toArgb
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.size.Scale
import coil3.size.Size
import coil3.toBitmap
import com.resonance.design.AppFonts
import com.resonance.design.OklchColor
import com.resonance.design.generated.Tokens
import com.resonance.design.initialsScale
import com.resonance.kit.chat.ChatPush
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The sender's face on a chat message's notification ([PushCenter.showChatMessage]): their
 * profile photo, else their avatar as the app draws it — the initials in ink on their colour — so
 * the shade never shows the system's own letter in its place. Drawn round (the shade rounds a
 * sender's picture itself on most versions; a round one looks the same either way), at the
 * largest the shade draws a sender for this screen.
 */
internal object ChatAvatar {
    /** The conversation icon's side in the shade, the largest a sender is drawn. */
    private const val SIZE_DP = 48
    /** How long the photo may take before the notification shows the initials instead (it is usually in Coil's caches already). */
    const val PHOTO_MILLIS = 4_000L

    /** The face's side in pixels for [density]: the shade scales it down, never up. */
    fun sidePx(density: Float): Int = (SIZE_DP * density).roundToInt().coerceIn(96, 256)

    /**
     * [push]'s sender as a round bitmap of [px]. Blocks while the photo loads (at most
     * [PHOTO_MILLIS]): call it off the main thread, as FCM's worker is.
     */
    fun draw(
        context: Context,
        push: ChatPush,
        px: Int = sidePx(context.resources.displayMetrics.density),
        loader: ImageLoader = SingletonImageLoader.get(context),
    ): Bitmap {
        val photo = push.fromAvatarUrl?.let { photo(context, loader, it, px) }
        val face = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(face)
        val r = px / 2f
        val fill = push.fromColor?.let(OklchColor::parse) ?: Tokens.TerracottaLight
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { color = fill.toArgb() }
        canvas.drawCircle(r, r, r, paint)
        if (photo != null) {
            // Its middle square, only where the disc is: a transparent photo sits on the colour, as in the app.
            val side = min(photo.width, photo.height)
            val x = (photo.width - side) / 2
            val y = (photo.height - side) / 2
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
            canvas.drawBitmap(photo, Rect(x, y, x + side, y + side), RectF(0f, 0f, px.toFloat(), px.toFloat()), paint)
        } else {
            val initials = push.fromInitials ?: initialsOf(push.title)
            val text = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
                // The avatar's own face (AppFonts is set up with the app, before any push reaches it).
                typeface = runCatching { AppFonts.typeface(AppFonts.Family.Body, 700) }.getOrNull() ?: Typeface.DEFAULT_BOLD
                textSize = px * initialsScale(initials)
                textAlign = Paint.Align.CENTER
                color = Tokens.Text.toArgb()
            }
            val m = text.fontMetrics
            canvas.drawText(initials, r, r - (m.ascent + m.descent) / 2, text)
        }
        return face
    }

    /** What an avatar without a photo shows, from a pen name, as the server makes it for a profile: its first two letters, upper case. */
    fun initialsOf(name: String): String {
        val trimmed = name.trim()
        val end = if (trimmed.codePointCount(0, trimmed.length) > 2) trimmed.offsetByCodePoints(0, 2) else trimmed.length
        return trimmed.substring(0, end).uppercase()
    }

    /** The photo in software pixels (it is drawn on a plain Canvas), at least [px] on its short side; null when it doesn't come in time. */
    private fun photo(context: Context, loader: ImageLoader, url: String, px: Int): Bitmap? = runCatching {
        runBlocking {
            withTimeoutOrNull(PHOTO_MILLIS) {
                val request = ImageRequest.Builder(context).data(url).size(Size(px, px)).scale(Scale.FILL).allowHardware(false).build()
                (loader.execute(request) as? SuccessResult)?.image?.toBitmap()
            }
        }
    }.getOrNull()
}
