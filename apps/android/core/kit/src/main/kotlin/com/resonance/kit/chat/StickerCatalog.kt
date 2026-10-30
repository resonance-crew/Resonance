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

    /** A sticker: what a message names ([ref]), its names by language tag, how long it plays, its content version. */
    data class Sticker(
        val pack: String,
        val id: String,
        val names: Map<String, String>,
        val durationMs: Int,
        val frames: Int,
        val v: String,
    ) {
        val ref: ChatSticker get() = ChatSticker(pack, id)

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
    private data class StickerJson(val id: String, val name: Map<String, String> = emptyMap(), val durationMs: Int = 0, val frames: Int = 0, val v: String = "0")

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
                    .map { Sticker(p.id, it.id, it.name, it.durationMs, it.frames, it.v) }
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
