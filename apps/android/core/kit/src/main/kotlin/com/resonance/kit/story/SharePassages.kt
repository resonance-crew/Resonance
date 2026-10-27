package com.resonance.kit.story

import com.resonance.kit.api.CardKey
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Document
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Image
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.Text
import org.commonmark.parser.IncludeSourceSpans
import org.commonmark.parser.Parser
import java.text.BreakIterator
import java.util.Locale

/**
 * What a share card quotes from a story — the twin of src/lib/markdown/sharePassages.ts, pinned case
 * by case by native/fixtures/share-passages.json (iOS has the same twin). The apps' 9:16 share image
 * and the web's link-preview image both quote its [opening].
 *
 * The story's first [READ_CHARS] characters are read as CommonMark without GFM (as the server reads
 * it for this, and as the story-link rule does: no tables, no strikethrough, a bare address is text),
 * block by block in reading order: every paragraph — at the top level, and inside quotes and list
 * items (each item on its own). Headings, code, thematic breaks and HTML are not prose to quote, nor
 * is a paragraph that is only pictures, a standalone link (one that gets a link card: [StoryLinks],
 * the reader's own rule) or an embedded card (`[title](/card/…)` alone in its paragraph). A block's
 * text is [PlainText.plainText] of its source — Markdown out, a link's text kept, a bare address left
 * out, character references and escapes read as what they stand for.
 */
object SharePassages {
    /** How much of a story is read, from its start (UTF-16 units; one less when the last would split a surrogate pair). */
    const val READ_CHARS = 20_000
    /** A block shorter than this, in graphemes, is left out (a line like 「嗯。」 is no passage). */
    const val MIN_GRAPHEMES = 6
    /** At most this many blocks are read. */
    const val MAX = 40
    /** A passage, and the opening, is cut at this many graphemes, with "…". */
    const val MAX_GRAPHEMES = 600

    // The server's reading of a share card's blocks has no GFM; source spans give each paragraph's offsets in the story.
    private val parser = Parser.builder().includeSourceSpans(IncludeSourceSpans.BLOCKS).build()

    /**
     * The story's opening: its quotable blocks joined by line breaks, cut at [MAX_GRAPHEMES]
     * graphemes. A share card then truncates it by its own lines. Empty when the story holds nothing
     * to quote.
     */
    fun opening(story: String): String = cut(blocks(story).joinToString("\n"))

    /**
     * The story's quotable blocks, in reading order, as plain text: at most [MAX] of them, each of
     * at least [MIN_GRAPHEMES] graphemes, whole (not yet cut).
     */
    fun blocks(whole: String): List<String> {
        val story = head(whole)
        // Too costly to read as a tree (StoryNesting): drawn as its words, quoted from nowhere — as iOS and the web.
        if (isJsBlank(story) || StoryNesting.tooComplex(story)) return emptyList()
        val blocks = ArrayList<String>()
        fun walk(node: Node) {
            if (blocks.size >= MAX) return
            when (node) {
                is Paragraph -> {
                    val spans = node.sourceSpans
                    if (spans.isEmpty()) return
                    if (soleLink(node) || picturesOnly(node) || embedsCard(node)) return
                    val start = spans.first().inputIndex
                    val end = spans.last().let { it.inputIndex + it.length }
                    val text = PlainText.plainText(story.substring(start, end))
                    if (graphemeCount(text) >= MIN_GRAPHEMES) blocks += text
                }
                // Quotes and lists hold paragraphs; headings, code, rules and HTML hold no prose to quote.
                is Document, is BlockQuote, is BulletList, is OrderedList, is ListItem -> children(node).forEach(::walk)
                else -> Unit
            }
        }
        walk(parser.parse(story))
        return blocks
    }

    /** [text] cut at [max] graphemes, with "…" when anything was cut. */
    fun cut(text: String, max: Int = MAX_GRAPHEMES): String {
        val ends = graphemeEnds(text)
        return if (ends.size > max) text.substring(0, ends[max - 1]) + "…" else text
    }

    /** The story's first [READ_CHARS] UTF-16 units, one less when the last would split a surrogate pair. */
    private fun head(story: String): String {
        if (story.length <= READ_CHARS) return story
        val end = if (Character.isHighSurrogate(story[READ_CHARS - 1])) READ_CHARS - 1 else READ_CHARS
        return story.substring(0, end)
    }

    private fun children(node: Node): List<Node> = generateSequence(node.firstChild) { it.next }.toList()

    /**
     * A paragraph's children as the web's Markdown tree has them, less the blank text between: a soft
     * line break is part of a text there (so it is blank text here too), a hard one a node of its own.
     */
    private fun meaningful(node: Node): List<Node> = children(node).filterNot {
        it is SoftLineBreak || (it is Text && isJsBlank(it.literal))
    }

    /** A paragraph of pictures alone (a linked picture counts as one). */
    private fun picturesOnly(p: Paragraph): Boolean {
        fun picture(n: Node): Boolean = n is Image || (n is Link && meaningful(n).let { it.isNotEmpty() && it.all(::picture) })
        val kids = meaningful(p)
        return kids.isNotEmpty() && kids.all(::picture)
    }

    /** A card link alone in its paragraph: the story embeds that card. */
    private fun embedsCard(p: Paragraph): Boolean {
        val only = meaningful(p).singleOrNull() as? Link ?: return false
        return cardKeyOfHref(only.destination) != null
    }

    /** A paragraph that is one link of the web and nothing else (the reader's rule, [StoryLinks]). */
    private fun soleLink(p: Paragraph): Boolean = when (val only = meaningful(p).singleOrNull()) {
        // A link with words of its own reads as those words (round 16 §6): quoted like any line.
        is Link -> !holdsImage(only) && StoryLinks.wordsAreTheAddress(words(only), only.destination) && StoryLinks.keyOf(only.destination) != null
        is Text -> StoryLinks.bareKey(only.literal) != null
        else -> false
    }

    private fun holdsImage(node: Node): Boolean = node is Image || children(node).any(::holdsImage)

    /** The words a node shows (a link's text, however it is emphasized inside: the web's `wordsOf`). */
    private fun words(node: Node): String = when (node) {
        is org.commonmark.node.Text -> node.literal
        is org.commonmark.node.Code -> node.literal
        else -> children(node).joinToString("") { words(it) }
    }

    /**
     * The card a `/card/…` link names, or null — the server's cardKeyOfHref: the segment after
     * `/card/`, percent-decoded (a malformed escape names nothing), and a card key ([CardKey]) at all.
     */
    internal fun cardKeyOfHref(href: String): String? {
        if (!href.startsWith("/card/")) return null
        val segment = href.substring(6).takeWhile { it != '/' && it != '?' && it != '#' }
        if (segment.isEmpty()) return null
        val key = percentDecodedAscii(segment) ?: return null
        return key.takeIf(CardKey::isValid)
    }

    /**
     * [text] with its `%XX` escapes decoded — or null when one is malformed or decodes past ASCII,
     * which `decodeURIComponent` would either refuse or turn into something no card key is.
     */
    private fun percentDecodedAscii(text: String): String? {
        if ('%' !in text) return text
        val out = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (c != '%') {
                out.append(c)
                i++
                continue
            }
            // Two hex digits must follow the %.
            if (i + 2 >= text.length) return null
            val hex = text.substring(i + 1, i + 3)
            if (!hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
            val byte = hex.toInt(16)
            if (byte >= 0x80) return null
            out.append(byte.toChar())
            i += 3
        }
        return out.toString()
    }

    /** JavaScript's `!text.trim()`: nothing but its WhiteSpace and LineTerminator characters. */
    private fun isJsBlank(text: String): Boolean = text.all {
        it == '\t' || it == '\n' || it == '\u000B' || it == '\u000C' || it == '\r' || it == '\u2028' || it == '\u2029' || it == '\uFEFF' ||
            Character.getType(it) == Character.SPACE_SEPARATOR.toInt()
    }

    /** Where each grapheme of [text] ends (extended grapheme clusters, as `Intl.Segmenter` counts them). */
    private fun graphemeEnds(text: String): List<Int> {
        if (text.isEmpty()) return emptyList()
        val it = BreakIterator.getCharacterInstance(Locale.ROOT)
        it.setText(text)
        val ends = ArrayList<Int>()
        var end = it.next()
        while (end != BreakIterator.DONE) {
            ends += end
            end = it.next()
        }
        return ends
    }

    /** How many graphemes [text] holds. */
    fun graphemeCount(text: String): Int = graphemeEnds(text).size
}
