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
import com.resonance.design.generated.ResonanceColors
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
 * largest the shade draws a sender for this screen. Always in light terracotta's ink and
 * fallback colour, whatever the app wears: the shade is the system's, and the face is the same
 * sticker the person's avatar is everywhere.
 */
internal object ChatAvatar {
    /** The conversation icon's side in the shade, the largest a sender is drawn. */
    private const val SIZE_DP = 48
    /** How long the photo may take before the notification shows the initials instead (it is usually in Coil's caches already). */
    const val PHOTO_MILLIS = 4_000L

    /** An adaptive icon's canvas (108 dp) and the part of it a shape is cut from (72 dp). */
    private const val ICON_CANVAS = 108
    private const val ICON_VIEWPORT = 72

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
    ): Bitmap = round(push, px, push.fromAvatarUrl?.let { photo(context, loader, it, px) })

    /**
     * [push]'s sender twice, from one read of the photo: [Faces.round] for a line of the
     * notification, and [Faces.icon] for the conversation's shortcut ([PushCenter.showChatMessage]),
     * which the shade draws large with the app's mark at its corner. Blocks as [draw] does.
     */
    fun faces(
        context: Context,
        push: ChatPush,
        px: Int = sidePx(context.resources.displayMetrics.density),
        loader: ImageLoader = SingletonImageLoader.get(context),
    ): Faces {
        val photo = push.fromAvatarUrl?.let { photo(context, loader, it, px) }
        return Faces(round(push, px, photo), icon(push, px, photo))
    }

    class Faces(val round: Bitmap, val icon: Bitmap)

    /**
     * An adaptive icon's canvas is half again as wide as what shows of it: the system cuts its own
     * shape (a circle on a Pixel) out of the middle two thirds.
     */
    fun iconSidePx(px: Int): Int = px * ICON_CANVAS / ICON_VIEWPORT

    private fun round(push: ChatPush, px: Int, photo: Bitmap?): Bitmap {
        val face = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(face)
        val r = px / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { color = fillOf(push) }
        canvas.drawCircle(r, r, r, paint)
        if (photo != null) {
            // Its middle square, only where the disc is: a transparent photo sits on the colour, as in the app.
            paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
            canvas.drawBitmap(photo, middleSquare(photo), RectF(0f, 0f, px.toFloat(), px.toFloat()), paint)
        } else {
            drawInitials(canvas, push, px, r)
        }
        return face
    }

    /**
     * The same face as an adaptive icon's bitmap ([iconSidePx] of [px]): the sender's colour to
     * every edge, and the photo's middle square — or the initials — in the middle two thirds, [px]
     * wide, so whatever shape the system cuts shows the face whole and never an edge of the photo.
     */
    private fun icon(push: ChatPush, px: Int, photo: Bitmap?): Bitmap {
        val side = iconSidePx(px)
        val face = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(face)
        canvas.drawColor(fillOf(push))
        val inset = (side - px) / 2f
        if (photo != null) {
            canvas.drawBitmap(photo, middleSquare(photo), RectF(inset, inset, inset + px, inset + px), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        } else {
            drawInitials(canvas, push, px, side / 2f)
        }
        return face
    }

    private fun fillOf(push: ChatPush): Int = (push.fromColor?.let(OklchColor::parse) ?: ResonanceColors.LightTerracotta.TerracottaLight).toArgb()

    private fun middleSquare(photo: Bitmap): Rect {
        val side = min(photo.width, photo.height)
        val x = (photo.width - side) / 2
        val y = (photo.height - side) / 2
        return Rect(x, y, x + side, y + side)
    }

    /** The initials as on a face [px] wide, centred on ([centre], [centre]). */
    private fun drawInitials(canvas: Canvas, push: ChatPush, px: Int, centre: Float) {
        val initials = push.fromInitials ?: initialsOf(push.title)
        val text = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
            // The avatar's own face (AppFonts is set up with the app, before any push reaches it).
            typeface = runCatching { AppFonts.typeface(AppFonts.Family.Body, 700) }.getOrNull() ?: Typeface.DEFAULT_BOLD
            textSize = px * initialsScale(initials)
            textAlign = Paint.Align.CENTER
            color = ResonanceColors.LightTerracotta.Text.toArgb()
        }
        val m = text.fontMetrics
        canvas.drawText(initials, centre, centre - (m.ascent + m.descent) / 2, text)
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
