package com.resonance.kit.story

/**
 * How a story is set: CJK (a Ming title over a Hei body, justified) or Latin (Playfair over DM Sans,
 * ragged) — the web's `StoryScript` (src/lib/text/script.ts).
 */
enum class StoryScript { Cjk, Latin }

/** What the publish panel's mirror tells apart: the CJK scripts one by one, Latin, and anything else (or nothing). */
enum class DraftScript { Han, Kana, Hangul, Latin, Other }

/** How a story is set, and the language its words are in ([lang]: zh-TW, ja, ko, en — or none). */
data class StoryText(val script: StoryScript, val lang: String?)

/**
 * Which script a text is written in — the twin of src/lib/text/script.ts, line for line, one rule
 * for the web's card page and writer and both apps' readers and writers (native/fixtures/
 * story-script.json pins it; iOS has the same twin). Pure: no Android.
 *
 * A text is read as a reader reads it: a CJK character against a word. Only its prose counts —
 * Markdown, link targets and bare addresses are left out ([PlainText.plainText], the web's
 * plainText) — and only its start, [SCRIPT_READ_CHARS] of title and story together, so a 200 000
 * character story is judged in a moment.
 *
 * Where JavaScript and the JVM read characters differently, this spells JavaScript's reading out:
 * `\p{scx=Han}` (Script_Extensions: Han and the marks CJK text shares — 「」、。・ and the like) has no
 * JVM regex, so the four sets the rule asks about are range tables here ([HAN], [KANA], [HANGUL],
 * [LATIN_SCX]), written from the server's own engine:
 *
 *     node -e 'for (const re of [/\p{scx=Han}/u, /[\p{scx=Hira}\p{scx=Kana}]/u, /\p{scx=Hang}/u, /\p{scx=Latn}/u]) …'
 *
 * (every code point tested, consecutive hits joined; Unicode 17). A device's or a JDK's own Unicode
 * tables may be a version older or newer: the same text then reads the same here everywhere.
 */
object StoryScripts {
    /** How much of a text, title and story together, is read from its start (UTF-16 units, as `slice`). */
    const val SCRIPT_READ_CHARS = 4_000

    /**
     * How much a draft must hold — CJK characters and other words together, as the mirror counts
     * them (the web's MIN_DRAFT_UNITS) — before the writer re-sets it by what it reads.
     */
    const val WRITER_SCRIPT_FLOOR = 15

    /**
     * How far past even a draft must lean before the writer changes its type: set as CJK, it turns
     * Latin once CJK characters are at most this share of what it holds; set as Latin, it turns CJK
     * once they are at least 1 − this. Between the two it keeps the type it has.
     */
    const val WRITER_SCRIPT_LEAN = 0.4

    /** What a text holds: its CJK characters by script, and the words of the other scripts. */
    data class Measure(
        val han: Int,
        val kana: Int,
        val hangul: Int,
        /** han + kana + hangul */
        val cjk: Int,
        /** Words in the scripts that space them, digits alone included. */
        val words: Int,
        /** Words with a Latin letter in them. */
        val latinWords: Int,
        /** Words with any letter in them (not digits alone). */
        val letterWords: Int,
    )

    /** A run of letters in a script that spaces its words (Latin, Cyrillic, Greek…): JavaScript's `[\p{L}\p{N}][\p{L}\p{N}'’-]*`. */
    private val SpacedWord = Regex("[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*")
    private val Letter = Regex("\\p{L}")

    /** CJK characters and the other words of a text. */
    fun measure(text: String): Measure {
        var han = 0
        var kana = 0
        var hangul = 0
        // The text with every CJK character a space: what is left between them are the other scripts' words.
        val spaced = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val isHan = inRanges(HAN, cp)
            val isKana = inRanges(KANA, cp)
            val isHangul = inRanges(HANGUL, cp)
            if (isHan) han++
            if (isKana) kana++
            if (isHangul) hangul++
            if (isHan || isKana || isHangul) spaced.append(' ') else spaced.appendCodePoint(cp)
            i += Character.charCount(cp)
        }
        val words = SpacedWord.findAll(spaced).map { it.value }.toList()
        val latinWords = words.count { w -> w.codePoints().anyMatch { inRanges(LATIN_SCX, it) } }
        val letterWords = words.count { Letter.containsMatchIn(it) }
        return Measure(han, kana, hangul, han + kana + hangul, words.size, latinWords, letterWords)
    }

    /** The prose of a title and story's first [SCRIPT_READ_CHARS] characters. */
    fun readableProse(title: String, story: String): String = PlainText.plainText("$title\n\n$story".take(SCRIPT_READ_CHARS))

    private fun scriptOf(m: Measure): DraftScript {
        if (m.cjk == 0 && m.words == 0) return DraftScript.Other
        if (m.cjk >= m.words) {
            if (m.hangul > m.han + m.kana) return DraftScript.Hangul
            return if (m.kana * 10 >= m.cjk) DraftScript.Kana else DraftScript.Han
        }
        return if (m.latinWords * 2 >= m.words) DraftScript.Latin else DraftScript.Other
    }

    /**
     * The script the draft is mostly written in, by what a reader reads most of: a CJK character
     * against a word. Kana make Han Japanese; a Latin-script draft may hold a Chinese name and stays Latin.
     */
    fun draftScript(title: String, story: String): DraftScript = scriptOf(measure(readableProse(title, story)))

    /** The language tag each script stands for: Han is the site's own zh-TW (so TalkBack keeps its Taiwan voice). */
    private fun langOf(script: DraftScript): String? = when (script) {
        DraftScript.Han -> "zh-TW"
        DraftScript.Kana -> "ja"
        DraftScript.Hangul -> "ko"
        DraftScript.Latin -> "en"
        DraftScript.Other -> null
    }

    /**
     * How a story is set, and the language its words are in (on the title and the prose only, never
     * on what is around them, which is in the reader's own language).
     *
     * - `script`: CJK when the mirror reads Han, kana or Hangul; Latin otherwise. A text with no
     *   letters at all — empty, or digits and marks alone — is neither, and takes [fallback]: the
     *   writer passes its UI language's ([localeScript]); everyone else takes CJK, the site's own.
     * - `lang`: zh-TW, ja, ko or en; none for a text with no letters or one in a script we can't name.
     */
    fun storyType(title: String, story: String, fallback: StoryScript = StoryScript.Cjk): StoryText {
        val m = measure(readableProse(title, story))
        if (m.cjk == 0 && m.letterWords == 0) return StoryText(fallback, null)
        val script = scriptOf(m)
        val cjk = script == DraftScript.Han || script == DraftScript.Kana || script == DraftScript.Hangul
        return StoryText(if (cjk) StoryScript.Cjk else StoryScript.Latin, langOf(script))
    }

    /** How a story is set ([storyType]'s `script`). */
    fun storyScript(title: String, story: String, fallback: StoryScript = StoryScript.Cjk): StoryScript =
        storyType(title, story, fallback).script

    /** The language a story's words are in ([storyType]'s `lang`). */
    fun storyLang(title: String, story: String): String? = storyType(title, story).lang

    private val CjkLocale = Regex("^(zh|ja|ko)\\b", RegexOption.IGNORE_CASE)

    /** The script an empty draft starts in, from the UI's language: en is Latin, zh-TW (and any CJK locale) is CJK. */
    fun localeScript(locale: String): StoryScript = if (CjkLocale.containsMatchIn(locale)) StoryScript.Cjk else StoryScript.Latin

    /**
     * The type a story being written is set in, re-read as it is written (the writer asks on its
     * autosave tick, never per keystroke). [current] is what it is set in now — for a new draft its
     * UI language's ([localeScript]), for a draft opened again [storyType]'s reading of it. The draft
     * changes type only once it holds [WRITER_SCRIPT_FLOOR] units and leans clearly the other way
     * ([WRITER_SCRIPT_LEAN]); a draft with no letters keeps what it has.
     */
    fun writerScript(current: StoryScript, title: String, story: String): StoryScript {
        val m = measure(readableProse(title, story))
        val units = m.cjk + m.words
        if (units < WRITER_SCRIPT_FLOOR || (m.cjk == 0 && m.letterWords == 0)) return current
        val share = m.cjk.toDouble() / units
        return when (current) {
            StoryScript.Cjk -> if (share <= WRITER_SCRIPT_LEAN) StoryScript.Latin else StoryScript.Cjk
            StoryScript.Latin -> if (share >= 1 - WRITER_SCRIPT_LEAN) StoryScript.Cjk else StoryScript.Latin
        }
    }

    /**
     * Where an apostrophe stands inside a Latin word (don’t, it’s, rock’n’roll): the UTF-16 indices
     * of each U+2018 / U+2019 with a Latin letter (Script=Latin, the code point itself) immediately
     * before and after it. A CJK face draws these marks full-width, which would open a half-em hole
     * inside the word, so a CJK story sets them in its Latin face. A mark beside anything else —
     * 他’s, James’ book, ‘OK’ — keeps the CJK form, as CJK typesetting wants.
     */
    fun latinMarks(text: String): List<Int> {
        val marks = ArrayList<Int>()
        for (i in text.indices) {
            val c = text[i]
            if (c != '‘' && c != '’') continue
            if (i == 0 || i + 1 >= text.length) continue
            if (isLatinScript(text.codePointBefore(i)) && isLatinScript(text.codePointAt(i + 1))) marks += i
        }
        return marks
    }

    /** `[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}]`: a character CJK text is read by (ReadTime counts these one by one). */
    internal fun isHanKanaOrHangul(cp: Int): Boolean = inRanges(HAN, cp) || inRanges(KANA, cp) || inRanges(HANGUL, cp)

    private fun isLatinScript(cp: Int): Boolean = Character.UnicodeScript.of(cp) == Character.UnicodeScript.LATIN

    private fun inRanges(ranges: IntArray, cp: Int): Boolean {
        // Pairs of [first, last], ascending: the last pair whose first is ≤ cp holds it or nothing does.
        var lo = 0
        var hi = ranges.size / 2 - 1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            when {
                cp < ranges[mid * 2] -> hi = mid - 1
                cp > ranges[mid * 2 + 1] -> lo = mid + 1
                else -> return true
            }
        }
        return false
    }

    /** `\p{scx=Han}`: Han, and what CJK text shares with it. */
    private val HAN = intArrayOf(
        0xB7, 0xB7, 0x2E80, 0x2E99, 0x2E9B, 0x2EF3, 0x2F00, 0x2FD5,
        0x2FF0, 0x2FFF, 0x3001, 0x3003, 0x3005, 0x3011, 0x3013, 0x301F,
        0x3021, 0x302D, 0x3030, 0x3030, 0x3037, 0x303F, 0x30FB, 0x30FB,
        0x3190, 0x319F, 0x31C0, 0x31E5, 0x31EF, 0x31EF, 0x3220, 0x3247,
        0x3280, 0x32B0, 0x32C0, 0x32CB, 0x32FF, 0x32FF, 0x3358, 0x3370,
        0x337B, 0x337F, 0x33E0, 0x33FE, 0x3400, 0x4DBF, 0x4E00, 0x9FFF,
        0xA700, 0xA707, 0xF900, 0xFA6D, 0xFA70, 0xFAD9, 0xFE45, 0xFE46,
        0xFF61, 0xFF65, 0x16FE2, 0x16FE3, 0x16FF0, 0x16FF6, 0x1D360, 0x1D371,
        0x1F250, 0x1F251, 0x20000, 0x2A6DF, 0x2A700, 0x2B81D, 0x2B820, 0x2CEAD,
        0x2CEB0, 0x2EBE0, 0x2EBF0, 0x2EE5D, 0x2F800, 0x2FA1D, 0x30000, 0x3134A,
        0x31350, 0x33479,
    )

    /** `[\p{scx=Hira}\p{scx=Kana}]`. */
    private val KANA = intArrayOf(
        0x305, 0x305, 0x323, 0x323, 0x3001, 0x3003, 0x3008, 0x3011,
        0x3013, 0x301F, 0x3030, 0x3035, 0x3037, 0x3037, 0x303C, 0x303D,
        0x3041, 0x3096, 0x3099, 0x30FF, 0x31F0, 0x31FF, 0x32D0, 0x32FE,
        0x3300, 0x3357, 0xFE45, 0xFE46, 0xFF61, 0xFF9F, 0x1AFF0, 0x1AFF3,
        0x1AFF5, 0x1AFFB, 0x1AFFD, 0x1AFFE, 0x1B000, 0x1B122, 0x1B132, 0x1B132,
        0x1B150, 0x1B152, 0x1B155, 0x1B155, 0x1B164, 0x1B167, 0x1F200, 0x1F200,
    )

    /** `\p{scx=Hang}`. */
    private val HANGUL = intArrayOf(
        0x1100, 0x11FF, 0x3001, 0x3003, 0x3008, 0x3011, 0x3013, 0x301F,
        0x302E, 0x3030, 0x3037, 0x3037, 0x30FB, 0x30FB, 0x3131, 0x318E,
        0x3200, 0x321E, 0x3260, 0x327E, 0xA960, 0xA97C, 0xAC00, 0xD7A3,
        0xD7B0, 0xD7C6, 0xD7CB, 0xD7FB, 0xFE45, 0xFE46, 0xFF61, 0xFF65,
        0xFFA0, 0xFFBE, 0xFFC2, 0xFFC7, 0xFFCA, 0xFFCF, 0xFFD2, 0xFFD7,
        0xFFDA, 0xFFDC,
    )

    /** `\p{scx=Latn}`: what makes a word a Latin one. */
    private val LATIN_SCX = intArrayOf(
        0x41, 0x5A, 0x61, 0x7A, 0xAA, 0xAA, 0xB7, 0xB7,
        0xBA, 0xBA, 0xC0, 0xD6, 0xD8, 0xF6, 0xF8, 0x2B8,
        0x2BC, 0x2BC, 0x2C7, 0x2C7, 0x2C9, 0x2CB, 0x2CD, 0x2CD,
        0x2D7, 0x2D7, 0x2D9, 0x2D9, 0x2E0, 0x2E4, 0x300, 0x30E,
        0x310, 0x311, 0x313, 0x313, 0x323, 0x325, 0x32D, 0x32E,
        0x330, 0x331, 0x358, 0x358, 0x35E, 0x35E, 0x363, 0x36F,
        0x485, 0x486, 0x951, 0x952, 0x10FB, 0x10FB, 0x1D00, 0x1D25,
        0x1D2C, 0x1D5C, 0x1D62, 0x1D65, 0x1D6B, 0x1D77, 0x1D79, 0x1DBE,
        0x1DF8, 0x1DF8, 0x1E00, 0x1EFF, 0x202F, 0x202F, 0x2071, 0x2071,
        0x207F, 0x207F, 0x2090, 0x209C, 0x20F0, 0x20F0, 0x212A, 0x212B,
        0x2132, 0x2132, 0x214E, 0x214E, 0x2160, 0x2188, 0x2C60, 0x2C7F,
        0x2E17, 0x2E17, 0xA700, 0xA707, 0xA722, 0xA787, 0xA78B, 0xA7DC,
        0xA7F1, 0xA7FF, 0xA92E, 0xA92E, 0xAB30, 0xAB5A, 0xAB5C, 0xAB64,
        0xAB66, 0xAB69, 0xFB00, 0xFB06, 0xFF21, 0xFF3A, 0xFF41, 0xFF5A,
        0x10780, 0x10785, 0x10787, 0x107B0, 0x107B2, 0x107BA, 0x1DF00, 0x1DF1E,
        0x1DF25, 0x1DF2A,
    )
}
