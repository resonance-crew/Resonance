package com.resonance.kit.chat

/**
 * A picture a message carries (the message document's `image: { id, width, height }`): kept by the
 * server for the two people of the conversation, read through GET /api/v1/chat-images/{id} — the
 * thread's size (`thumb`, at most 960 on its longest side) or the whole of it (at most 2048). Its
 * [width] and [height] are the picture's as kept, so its place in the thread is known before it loads.
 */
data class ChatImage(val id: String, val width: Int, val height: Int) {
    companion object {
        /** What the contract takes as a picture's id (a document id): anything else names no picture, and nothing is asked for it. */
        private val ID = Regex("^[A-Za-z0-9_-]{1,128}$")

        fun isValidId(id: String): Boolean = ID.matches(id)

        /** The `image` field of a message document; null when it isn't one (a missing or odd id). An odd size reads as unknown (0). */
        fun from(map: Map<*, *>?): ChatImage? {
            val id = (map?.get("id") as? String)?.takeIf(::isValidId) ?: return null
            fun side(key: String) = (map[key] as? Number)?.toDouble()?.takeIf { it.isFinite() && it > 0 && it <= MAX_SIDE }?.toInt() ?: 0
            return ChatImage(id, side("width"), side("height"))
        }

        /** No picture is kept larger than this on a side (the server's 2048, with room). */
        private const val MAX_SIDE = 16_384.0
    }
}

/**
 * A picture on its way out with a message (Outbox): what goes up — made ready on the device, a
 * JPEG (or a WebP keeping transparency) at most 2048 on its longest side, or a GIF as it was — and
 * its size, for the thread to draw it at once from the device while it goes. Not a data class: its
 * bytes are its own, compared by identity.
 */
class OutgoingImage(val bytes: ByteArray, val mimeType: String, val width: Int, val height: Int)

/**
 * Where a picture sits in its bubble (round 7 §4.3), from its size before it loads, so nothing
 * jumps: as wide as the bubble allows ([maxWidth]), at most [maxHeight] tall, its shape kept —
 * except that one longer than 2:1 either way is shown at 2:1 (or 1:2), the picture filling it and
 * cut at its ends. A picture whose size isn't known is a square.
 */
object PictureBox {
    /** The tallest a picture stands in the thread. */
    const val MAX_HEIGHT = 320f
    /** Narrower than 1:2 or wider than 2:1 is cut to it. */
    const val MIN_ASPECT = 0.5f
    const val MAX_ASPECT = 2f

    data class Size(val width: Float, val height: Float)

    fun of(width: Int, height: Int, maxWidth: Float, maxHeight: Float = MAX_HEIGHT): Size {
        val aspect = if (width > 0 && height > 0) (width.toFloat() / height).coerceIn(MIN_ASPECT, MAX_ASPECT) else 1f
        val across = maxWidth.coerceAtLeast(0f)
        val tall = across / aspect
        return if (tall <= maxHeight) Size(across, tall) else Size(maxHeight * aspect, maxHeight)
    }
}
