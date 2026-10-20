package com.resonance.app.ui.share

import com.resonance.api.models.CardDetail
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * What a share sends, and when there is anything to share — the twin of src/lib/share/links.ts.
 * The link carries no locale (the site gives whoever opens it their own language) and no tracking
 * parameter.
 */
object ShareLinks {
    /**
     * Whether a card can be shared: published and public, and not in the trash — whoever gets the
     * link can open it then (an anonymous card too: its link names no one). The card's own state
     * alone: never the viewer, a connection or a block, so sharing tells no one anything. A
     * private, connections-only, draft or trashed card shows no share at all.
     */
    fun canShare(detail: CardDetail): Boolean =
        canShare(published = detail.card.publishedAt != null, public = detail.visibility == CardDetail.Visibility.`public`, trashed = detail.card.trashedAt != null)

    fun canShare(published: Boolean, public: Boolean, trashed: Boolean): Boolean = published && public && !trashed

    /**
     * The key a card is shared under: its slug, else its id — and always its id when it is
     * anonymous. A slug that collided carries its author's pen name (`-{handle}`), and a slug
     * never changes: a card made anonymous after it was published would name its author in it.
     */
    fun cardKey(id: String, slug: String?, anonymous: Boolean): String =
        if (anonymous) id else slug?.takeIf { it.isNotEmpty() } ?: id

    /** `{origin}/card/{key}` ([cardKey]). */
    fun card(origin: String, id: String, slug: String?, anonymous: Boolean): String =
        "${origin.trimEnd('/')}/card/${encodeComponent(cardKey(id, slug, anonymous))}"

    /** `{origin}/u/{handle}`. */
    fun profile(origin: String, handle: String): String = "${origin.trimEnd('/')}/u/${encodeComponent(handle)}"

    /** JavaScript's `encodeURIComponent`: UTF-8, every byte escaped but A–Z a–z 0–9 and `-_.!~*'()`. */
    fun encodeComponent(text: String): String {
        val out = StringBuilder(text.length)
        for (b in text.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xff
            if (c < 0x80 && (c.toChar().isLetterOrDigit() || c.toChar() in UNRESERVED)) out.append(c.toChar())
            else out.append('%').append(HEX[c shr 4]).append(HEX[c and 0xf])
        }
        return out.toString()
    }

    private const val UNRESERVED = "-_.!~*'()"
    private const val HEX = "0123456789ABCDEF"

    /** The share picture's file in the app's cache: `resonance-{key}.jpg`, the key kept to safe characters. */
    fun imageName(key: String): String = "resonance-${safe(key)}.jpg"

    /** A saved picture's name in Pictures/Resonance: `resonance-{key}-{yyyyMMdd-HHmmss}.jpg`. */
    fun savedName(key: String, at: LocalDateTime): String = "resonance-${safe(key)}-${at.format(SAVED)}.jpg"

    private val SAVED = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")

    private fun safe(key: String): String = key.replace(Regex("[^A-Za-z0-9_-]"), "-").take(80)
}
