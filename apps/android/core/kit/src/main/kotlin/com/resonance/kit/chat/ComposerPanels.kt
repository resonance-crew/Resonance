package com.resonance.kit.chat

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * What lies under the composer's capsule (round 22 §4.1–4.2): nothing (the navigation bar), the
 * keyboard, or one of the two panels that take the keyboard's place — the stickers (☺) or what can
 * go with the message (＋: pictures, cards).
 */
enum class ComposerPanel { None, Keyboard, Stickers, Attach }

/**
 * The composer's foot as a value: which [panel] shows, whether the sticker panel is grown to under the
 * header ([expanded]), and whether a panel's room is still kept while the keyboard comes up over it
 * ([holding]: the panel is laid out first and the keyboard rises over it, so the capsule never dips).
 */
data class PanelState(val panel: ComposerPanel = ComposerPanel.None, val expanded: Boolean = false, val holding: Boolean = false) {
    /** A panel is on show (and so takes the back gesture). */
    val panelOpen: Boolean get() = panel == ComposerPanel.Stickers || panel == ComposerPanel.Attach

    /** The panel's room is kept under the capsule: it shows, or the keyboard is still rising over it. */
    val keepsRoom: Boolean get() = panelOpen || holding
}

/** What the composer's end segment does now (round 22 §4.1): send, or — the sticker panel open with nothing to send — grow it (↑) or bring it back down (↓). */
enum class SegmentRole { Send, Expand, Collapse }

/**
 * The composer's panels as a state machine (round 22 §4.1–4.2), pure, so every platform's rules are the
 * same and tested: ☺ swaps the keyboard for the sticker panel and becomes ⌨ (back to the keyboard); ＋
 * swaps it for the attach panel; a tap on the field, or the keyboard coming up any other way, brings the
 * keyboard back over the panel's kept room; back closes a panel; sending a sticker leaves its panel open.
 */
object PanelMachine {
    /** ☺ (or ⌨ while the stickers show). */
    fun stickerButton(s: PanelState): PanelState =
        if (s.panel == ComposerPanel.Stickers) PanelState(ComposerPanel.Keyboard, holding = true)
        else PanelState(ComposerPanel.Stickers)

    /** ＋: the attach panel, or — open already — back to the keyboard. */
    fun attachButton(s: PanelState): PanelState =
        if (s.panel == ComposerPanel.Attach) PanelState(ComposerPanel.Keyboard, holding = true)
        else PanelState(ComposerPanel.Attach)

    /** The field was tapped (or took the focus with the keyboard): the keyboard, over a panel's room if one was open. */
    fun keyboardShown(s: PanelState): PanelState = when {
        s.panelOpen -> PanelState(ComposerPanel.Keyboard, holding = true)
        s.panel == ComposerPanel.Keyboard -> s
        else -> PanelState(ComposerPanel.Keyboard)
    }

    /** The keyboard has risen all the way (or a moment passed): the panel's room is let go. */
    fun keyboardSettled(s: PanelState): PanelState = if (s.holding && s.panel == ComposerPanel.Keyboard) s.copy(holding = false) else s

    /** The keyboard went away by itself (its own hide key, the system): nothing under the capsule, unless a panel shows. */
    fun keyboardHidden(s: PanelState): PanelState = if (s.panel == ComposerPanel.Keyboard) PanelState() else s

    /** Back: a panel closes (true: back was taken); otherwise it is the screen's. */
    fun back(s: PanelState): Pair<PanelState, Boolean> = if (s.panelOpen) PanelState() to true else s to false

    /** The thread's blank (or the foot's paper) was tapped: the keyboard and any panel go. */
    fun dismissed(@Suppress("UNUSED_PARAMETER") s: PanelState): PanelState = PanelState()

    /** The end segment's role: ↑/↓ only for the sticker panel with nothing to send. */
    fun segment(s: PanelState, hasSomethingToSend: Boolean): SegmentRole = when {
        hasSomethingToSend || s.panel != ComposerPanel.Stickers -> SegmentRole.Send
        s.expanded -> SegmentRole.Collapse
        else -> SegmentRole.Expand
    }

    /** ↑ / ↓ (or a drag that settled past the middle): the sticker panel grown or back to the keyboard's height. */
    fun setExpanded(s: PanelState, expanded: Boolean): PanelState = if (s.panelOpen) s.copy(expanded = expanded) else s
}

/**
 * How tall the keyboard is on this device, remembered per orientation across launches (round 22
 * §4.1), so a panel can be laid out in its place before the keyboard goes: what the keyboard measured
 * when it last stood still — a floating, split or hardware keyboard (shorter than [MIN_DOCKED]) is no
 * measure — else [FALLBACK]; a phone on its side keeps it under [LANDSCAPE_CAP]; never more than
 * [MAX_SHARE] of the window. Heights in dp.
 */
class KeyboardHeights(private val storage: Storage) {
    interface Storage {
        fun read(key: String): Float?
        fun write(key: String, value: Float)
    }

    /** Where a panel takes the keyboard's place: its height for this orientation and window. */
    fun panelHeight(landscape: Boolean, windowHeight: Float, phone: Boolean = true): Float {
        val kept = storage.read(key(landscape))?.takeIf { it >= MIN_DOCKED } ?: FALLBACK
        var h = kept
        if (landscape && phone) h = minOf(h, LANDSCAPE_CAP)
        return minOf(h, windowHeight * MAX_SHARE).coerceAtLeast(MIN_PANEL)
    }

    /** The keyboard stood still at [height] (from the navigation bar's top): remembered when it is a docked one. */
    fun note(landscape: Boolean, height: Float) {
        if (height < MIN_DOCKED) return
        val k = key(landscape)
        if (storage.read(k) != height) storage.write(k, height)
    }

    private fun key(landscape: Boolean) = if (landscape) "keyboard.landscape" else "keyboard.portrait"

    companion object {
        const val FALLBACK = 300f
        const val LANDSCAPE_CAP = 200f
        const val MIN_DOCKED = 120f
        const val MIN_PANEL = 160f
        const val MAX_SHARE = 0.6f
    }
}

/**
 * At most [max] stickers playing at once in the thread (round 22 §4.5): a sticker that starts while
 * [max] play stops the one playing longest ([start]'s answer), which rests on its key pose.
 */
class PlaybackLimiter(private val max: Int = 3) {
    private val playing = ArrayList<String>()

    /** [key] starts playing; the keys that must stop for it. */
    @Synchronized
    fun start(key: String): List<String> {
        playing.remove(key)
        playing.add(key)
        val over = playing.size - max
        if (over <= 0) return emptyList()
        val stop = playing.take(over)
        playing.removeAll(stop.toSet())
        return stop
    }

    /** [key] finished its plays, or left the screen. */
    @Synchronized
    fun stop(key: String) {
        playing.remove(key)
    }

    @get:Synchronized
    val now: List<String> get() = playing.toList()
}

/**
 * The pictures chosen to go with the next message (round 22 §4.2), in the order chosen — each one's
 * number is its place — at most [ChatAlbum.MAX] in all, counting those that came another way (a
 * paste, the system's picker: [others]).
 */
object PictureSelection {
    /** [key] chosen or let go: the new order, and whether it was refused (already [ChatAlbum.MAX]). */
    fun <K> toggle(chosen: List<K>, key: K, others: Int = 0, max: Int = ChatAlbum.MAX): Pair<List<K>, Boolean> = when {
        key in chosen -> chosen.filter { it != key } to false
        chosen.size + others >= max -> chosen to true
        else -> chosen + key to false
    }

    /** [key]'s number (1 first), or null when it isn't chosen. */
    fun <K> number(chosen: List<K>, key: K, before: Int = 0): Int? = chosen.indexOf(key).takeIf { it >= 0 }?.let { it + 1 + before }
}

/**
 * The phone's pictures, read a page at a time (round 22 §6.2: newest first, [pageSize] a page), so a
 * library of tens of thousands opens at once: [items] grows with [loadMore]; [refreshHead] reads the
 * first page again (a picture taken, or deleted, while the panel is open) and keeps every page after it.
 * [load] reads `limit` items from `offset` (off the main thread: the caller's); [keyOf] tells items
 * apart and [orderOf] is what they are sorted by, newest (largest) first.
 */
class GalleryPager<T>(
    private val pageSize: Int = 120,
    private val keyOf: (T) -> Long,
    private val orderOf: (T) -> Long = keyOf,
    private val load: suspend (offset: Int, limit: Int) -> List<T>,
) {
    private val lock = Mutex()

    @Volatile
    var items: List<T> = emptyList()
        private set

    /** Every page has been read (the last came short). */
    @Volatile
    var end: Boolean = false
        private set

    /** The first page has been read at least once. */
    @Volatile
    var loaded: Boolean = false
        private set

    /** Reads the next page (nothing at the end, or while another read runs — it waits for it). */
    suspend fun loadMore(): List<T> = lock.withLock {
        if (end) return items
        val page = load(items.size, pageSize)
        val seen = items.mapTo(HashSet()) { keyOf(it) }
        items = items + page.filter { keyOf(it) !in seen }
        end = page.size < pageSize
        loaded = true
        items
    }

    /**
     * Reads the first page again: what it now holds leads, and what was read before follows — less
     * what the new first page holds, and less what it should hold and doesn't (deleted): an item of the
     * old list newer than the new first page's last, or any when that page came short, is gone.
     */
    suspend fun refreshHead(): List<T> = lock.withLock {
        val head = load(0, pageSize)
        val headKeys = head.mapTo(HashSet()) { keyOf(it) }
        val full = head.size >= pageSize
        val oldest = head.lastOrNull()?.let(orderOf)
        items = head + items.filter { keyOf(it) !in headKeys && full && oldest != null && orderOf(it) < oldest }
        if (!loaded || !full) end = !full
        loaded = true
        items
    }
}
