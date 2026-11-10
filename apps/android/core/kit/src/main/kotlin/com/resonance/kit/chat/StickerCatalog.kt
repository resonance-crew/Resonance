package com.resonance.kit.chat

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * The 小紙團 stickers this build knows (round 22): `public/stickers/catalog.json`, bundled with the app
 * (the build copies `public/stickers` into its assets) and — for a pack a later build added — the
 * site's own copy, read when a message names a sticker the bundle lacks ([merged]). Five packs, one per
 * puppet as its protagonist, in the picker's order; each sticker's files are `<pack>/<id>.webp` (the
 * animated one, its two plays baked in), `<pack>/<id>.thumb.webp` (the key pose) and the pack's
 * `<pack>/icon.webp`, each URL carrying its content version (`?v=`).
 */
class StickerCatalog(val version: Int, val packs: List<Pack>) {
    /** A pack: its character ([hero]), its names by language tag, its tab icon and its stickers in order. */
    data class Pack(
        val id: String,
        val hero: String,
        val names: Map<String, String>,
        val icon: String,
        val iconV: String,
        val stickers: List<Sticker>,
    ) {
        /** Its name in [language] (a tag: `zh-TW`, `en`), else in Chinese, else any. */
        fun name(language: String): String = pick(names, language) ?: id

        /** The icon's path on the site, versioned. */
        val iconUrl: String get() = "/stickers/$icon?v=$iconV"
    }

    /**
     * A sticker: what a message names ([ref]), its names by language tag, how long it plays, its content version, and
     * where its drawing sits in its square (round 24): [box] over every frame of its animation, [poseBox] its key pose's.
     */
    data class Sticker(
        val pack: String,
        val id: String,
        val names: Map<String, String>,
        val durationMs: Int,
        val frames: Int,
        val v: String,
        val box: StickerBox = StickerBox.Whole,
        val poseBox: StickerBox = StickerBox.Whole,
    ) {
        val ref: ChatSticker get() = ChatSticker(pack, id)

        /**
         * Where its key pose's drawing starts inside the thread's room for it ([StickerBox.trimTop]), of its side: a
         * sticker answering a quote comes up over it by its drawing, not its room (round 22's overlap, round 24 — the
         * web's `stickerArtTop`, iOS's twin). 0 for a sticker the catalog has no numbers for.
         */
        val artTop: Float get() = maxOf(0f, poseBox.top - box.trimTop)

        /** Its name in [language] (for TalkBack, the preview, the quote), else in Chinese, else its id. */
        fun name(language: String): String = pick(names, language) ?: id

        /** The animated file, relative to the stickers' folder (the bundle's, or the site's `/stickers/`). */
        val file: String get() = "$pack/$id.webp"

        /** The key pose, relative to the stickers' folder. */
        val thumb: String get() = "$pack/$id.thumb.webp"

        /** The animated file's path on the site, versioned (cached for good there). */
        val url: String get() = "/stickers/$file?v=$v"

        /** The key pose's path on the site, versioned. */
        val thumbUrl: String get() = "/stickers/$thumb?v=$v"
    }

    private val byRef: Map<ChatSticker, Sticker> = packs.flatMap { it.stickers }.associateBy { it.ref }

    /** The sticker a message names, if this catalog knows it. */
    fun find(ref: ChatSticker): Sticker? = byRef[ref]

    fun pack(id: String): Pack? = packs.firstOrNull { it.id == id }

    /** Every sticker, in the picker's order (pack by pack). */
    val all: List<Sticker> get() = packs.flatMap { it.stickers }

    /**
     * This catalog with the packs and stickers [other] has and it lacks (the site's, read for a
     * sticker a later build added): what is bundled stays as it is — its files are on the device.
     */
    fun merged(other: StickerCatalog): StickerCatalog {
        val mine = packs.associateBy { it.id }
        val out = packs.map { pack ->
            val theirs = other.pack(pack.id) ?: return@map pack
            val known = pack.stickers.map { it.id }.toSet()
            pack.copy(stickers = pack.stickers + theirs.stickers.filter { it.id !in known })
        } + other.packs.filter { it.id !in mine }
        return StickerCatalog(maxOf(version, other.version), out)
    }

    @Serializable
    private data class StickerJson(
        val id: String,
        val name: Map<String, String> = emptyMap(),
        val durationMs: Int = 0,
        val frames: Int = 0,
        val v: String = "0",
        // Absent from a catalog written before round 24 (an older bundle, or the site's before it): the whole square.
        val box: List<Double>? = null,
        val poseBox: List<Double>? = null,
    )

    @Serializable
    private data class PackJson(
        val id: String,
        val hero: String = "",
        val name: Map<String, String> = emptyMap(),
        val icon: String = "",
        val iconV: String = "0",
        val stickers: List<StickerJson> = emptyList(),
    )

    @Serializable
    private data class CatalogJson(val version: Int = 0, val packs: List<PackJson> = emptyList())

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /**
         * `catalog.json` as the site writes it; null when it can't be read. A pack or a sticker whose ids
         * the contract wouldn't take is left out (it could never be sent, nor named by a message).
         */
        fun parse(text: String): StickerCatalog? {
            val raw = runCatching { json.decodeFromString(CatalogJson.serializer(), text) }.getOrNull() ?: return null
            val packs = raw.packs.mapNotNull { p ->
                val stickers = p.stickers.filter { ChatSticker.isValid(p.id, it.id) }
                    .distinctBy { it.id }
                    .map { Sticker(p.id, it.id, it.name, it.durationMs, it.frames, it.v, StickerBox.of(it.box), StickerBox.of(it.poseBox)) }
                if (stickers.isEmpty()) null
                else Pack(p.id, p.hero, p.name, p.icon.ifEmpty { "${p.id}/icon.webp" }, p.iconV, stickers)
            }.distinctBy { it.id }
            return StickerCatalog(raw.version, packs)
        }

        private fun pick(names: Map<String, String>, language: String): String? =
            names[language]?.takeIf { it.isNotBlank() } ?: names["zh-TW"]?.takeIf { it.isNotBlank() } ?: names.values.firstOrNull { it.isNotBlank() }
    }
}

/**
 * Where a sticker's drawing sits in its 432² square (round 24; `catalog.json`'s `box` / `poseBox`, alpha > 8), as
 * fractions of the side: [left], [top], [right], [bottom]. The whole square for a sticker the catalog has no numbers for.
 */
data class StickerBox(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top

    /**
     * The part of the square a sticker in the thread takes room for (the owner: no empty paper above it): its drawing
     * and [TRIM_MARGIN] above and below — from [trimTop] (never above the square's top) to [trimBottom], [trimHeight]
     * tall (never more than the square), as the web's `stickerTrim` and iOS's `StickerTrim`: `max(0, top − m)` and
     * `min(1, bottom − top + 2m)`: the room is the drawing's height and both margins wherever it starts, so one drawn
     * within [TRIM_MARGIN] of the square's foot ends a hair past it (點點's 謝謝你！, 0.001 of the side; clear there). The square
     * is drawn whole, [trimTop] of its side up: every frame lies inside the sticker's [StickerCatalog.Sticker.box], so
     * nothing drawn is cut.
     */
    val trimTop: Float get() = (top - TRIM_MARGIN).coerceIn(0f, 1f)
    val trimHeight: Float get() = (height + 2 * TRIM_MARGIN).coerceIn(0f, 1f)
    val trimBottom: Float get() = trimTop + trimHeight

    /**
     * A quoted sticker's thumb (this [StickerBox] its key pose's): drawn [quoteScale] times its square, as large as fits
     * with a [QUOTE_MARGIN] margin round the pose and never smaller than the square ([QUOTE_FILL] / its longer side, at
     * least 1), so that the pose stands in the middle (點點 no longer below the half).
     */
    val quoteScale: Float get() = maxOf(1f, QUOTE_FILL / maxOf(width, height, 0.0001f))

    /** Where the scaled square's top-left corner goes, as fractions of the quote's side: the pose's centre on the quote's. */
    val quoteX: Float get() = 0.5f - quoteScale * (left + right) / 2
    val quoteY: Float get() = 0.5f - quoteScale * (top + bottom) / 2

    companion object {
        val Whole = StickerBox(0f, 0f, 1f, 1f)

        /** The air a sticker in the thread keeps above and below its drawing, of its side. */
        const val TRIM_MARGIN = 0.02f

        /** A quoted pose's margin each side, of the quote's side (4 %): it fills the rest. */
        const val QUOTE_MARGIN = 0.04f
        const val QUOTE_FILL = 1f - 2 * QUOTE_MARGIN

        /** `[left, top, right, bottom]` as the catalog writes it; the whole square for anything else (absent, short, out of the square, empty). */
        fun of(values: List<Double>?): StickerBox {
            if (values == null || values.size != 4 || values.any { !it.isFinite() || it < 0.0 || it > 1.0 }) return Whole
            val (l, t, r, b) = values.map { it.toFloat() }
            return if (r > l && b > t) StickerBox(l, t, r, b) else Whole
        }
    }
}

/**
 * The stickers an account sent last on this device (round 22 §4.1: the pack bar's 🕘 tab, shown once
 * there is one), newest first, at most [MAX] — kept per account, like its drafts, and gone with it on
 * sign-out ([forget]).
 */
class StickerRecents(private val storage: Storage) {
    interface Storage {
        fun read(account: String): String?
        fun write(account: String, value: String?)
    }

    /** One account's recents. */
    inner class Account(val id: String) {
        /** Newest first. */
        fun list(): List<ChatSticker> = synchronized(this@StickerRecents) { load(id) }

        /** [sticker] was just sent: it leads the list, once. */
        fun used(sticker: ChatSticker): List<ChatSticker> = synchronized(this@StickerRecents) {
            val next = (listOf(sticker) + load(id).filter { it != sticker }).take(MAX)
            storage.write(id, json.encodeToString(ListSerializer(String.serializer()), next.map { "${it.pack}/${it.id}" }))
            next
        }
    }

    fun of(account: String): Account = Account(account)

    @Synchronized
    fun forget(account: String) = storage.write(account, null)

    private fun load(account: String): List<ChatSticker> {
        val raw = storage.read(account) ?: return emptyList()
        val keys = runCatching { json.decodeFromString(ListSerializer(String.serializer()), raw) }.getOrElse { emptyList() }
        return keys.mapNotNull { key ->
            val pack = key.substringBefore('/', "")
            val id = key.substringAfter('/', "")
            if (ChatSticker.isValid(pack, id)) ChatSticker(pack, id) else null
        }.distinct().take(MAX)
    }

    companion object {
        const val MAX = 8
        private val json = Json { ignoreUnknownKeys = true }
    }
}
