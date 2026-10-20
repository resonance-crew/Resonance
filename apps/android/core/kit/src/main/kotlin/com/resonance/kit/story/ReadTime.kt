package com.resonance.kit.story

/**
 * How long a story takes to read, in whole minutes (at least 1) — the twin of src/lib/readTime.ts,
 * the read time every list shows beside a card (the server stores it with the card; the writer's
 * publish step counts it the same way for the card it previews).
 *
 * Chinese and Japanese run on without spaces and are read a character at a time; English is read a
 * word at a time. A story can hold both, so each part is counted at its own rate and the two added
 * up, with no locale needed.
 */
object ReadTime {
    /** CJK characters read per minute (CJK_CHARS_PER_MINUTE). */
    const val CJK_CHARS_PER_MINUTE = 320
    /** Words read per minute, for text that spaces its words (WORDS_PER_MINUTE). */
    const val WORDS_PER_MINUTE = 230

    /**
     * Han, kana, Hangul and bopomofo by their script extensions, with the punctuation set among
     * them: the CJK block's 、。「」 (U+3000–303F) and the full-width forms' ，！１ (U+FF00–FFEF).
     */
    private fun isCjk(cp: Int): Boolean =
        StoryScripts.isHanKanaOrHangul(cp) ||
            Character.UnicodeScript.of(cp) == Character.UnicodeScript.BOPOMOFO ||
            cp in 0x3000..0x303F || cp in 0xFF00..0xFFEF

    /** JavaScript's `\s`: white space and line terminators, the ideographic space among them. */
    private fun isSpace(cp: Int): Boolean =
        cp == 0xFEFF || Character.isWhitespace(cp) || Character.isSpaceChar(cp)

    private fun isWordLike(cp: Int): Boolean = Character.isLetter(cp) || Character.isDigit(cp) ||
        Character.getType(cp).let { it == Character.LETTER_NUMBER.toInt() || it == Character.OTHER_NUMBER.toInt() }

    fun minutes(text: String): Int {
        var chars = 0
        var words = 0
        var i = 0
        // `([CJK]+)|[^\s CJK]+`: a run of CJK characters (each read), or anything else up to the next
        // space or CJK character — a word when it holds a letter or a digit, else marks that stand
        // alone (Chinese text's …… and ——, Markdown's ## and -), counted as characters as they always were.
        while (i < text.length) {
            val cp = text.codePointAt(i)
            when {
                isCjk(cp) -> {
                    while (i < text.length && isCjk(text.codePointAt(i))) {
                        // JavaScript's length counts UTF-16 units, so an astral character is two.
                        chars += Character.charCount(text.codePointAt(i))
                        i += Character.charCount(text.codePointAt(i))
                    }
                }
                isSpace(cp) -> i += Character.charCount(cp)
                else -> {
                    val start = i
                    var wordLike = false
                    while (i < text.length) {
                        val c = text.codePointAt(i)
                        if (isSpace(c) || isCjk(c)) break
                        if (isWordLike(c)) wordLike = true
                        i += Character.charCount(c)
                    }
                    if (wordLike) words++ else chars += i - start
                }
            }
        }
        return maxOf(1, Math.round(chars.toDouble() / CJK_CHARS_PER_MINUTE + words.toDouble() / WORDS_PER_MINUTE).toInt())
    }
}
