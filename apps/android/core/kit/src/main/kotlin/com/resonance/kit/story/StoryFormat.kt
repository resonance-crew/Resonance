package com.resonance.kit.story

import com.resonance.kit.chat.Linkify
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlBlock
import org.commonmark.node.HtmlInline
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

/**
 * A story's Markdown as the reader lays it out — the blocks the web's
 * StoryMarkdown (react-markdown + remark-gfm) produces, with its paragraph
 * rules: a paragraph holding only a card link is an embedded card, only a
 * photo is an image block, only a link of the web is a standalone link (drawn
 * as its page's card when the card page brought a preview for it), only the
 * blank marker (U+00A0) is extra space. A web address written bare in the text
 * is a link, as remark-gfm makes it. The twin of iOS's StoryFormat.
 */
sealed interface StoryBlock {
    data class Heading(val level: Int, val runs: List<InlineRun>) : StoryBlock
    data class Paragraph(val runs: List<InlineRun>) : StoryBlock
    data object Blank : StoryBlock
    data class Image(val url: String, val alt: String) : StoryBlock
    data class CardEmbed(val href: String, val title: String) : StoryBlock
    /**
     * A paragraph that is one link of the web and nothing else ([StoryLinks]): [key] is the address
     * its preview is found by; [runs] are the paragraph as written, drawn when there is no preview.
     */
    data class SoleLink(val key: String, val runs: List<InlineRun>) : StoryBlock
    data class Quote(val children: List<StoryBlock>) : StoryBlock
    data class ListBlock(val ordered: Boolean, val start: Int, val items: List<List<StoryBlock>>) : StoryBlock
    data object Rule : StoryBlock
    data class CodeBlock(val code: String) : StoryBlock
}

data class InlineRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val strikethrough: Boolean = false,
    val code: Boolean = false,
    val link: String? = null,
)

object StoryParser {
    private val parser = Parser.builder()
        .extensions(listOf(StrikethroughExtension.create(), TablesExtension.create()))
        .build()

    fun parse(markdown: String): List<StoryBlock> = children(parser.parse(markdown)).mapNotNull(::block)

    private fun children(node: Node): List<Node> = generateSequence(node.firstChild) { it.next }.toList()

    private fun block(node: Node): StoryBlock? = when (node) {
        is Paragraph -> paragraph(node)
        is Heading -> StoryBlock.Heading(node.level, inlines(node))
        is BlockQuote -> StoryBlock.Quote(children(node).mapNotNull(::block))
        is BulletList -> StoryBlock.ListBlock(false, 1, children(node).filterIsInstance<ListItem>().map { item -> children(item).mapNotNull(::block) })
        is OrderedList -> StoryBlock.ListBlock(true, node.markerStartNumber ?: 1, children(node).filterIsInstance<ListItem>().map { item -> children(item).mapNotNull(::block) })
        is ThematicBreak -> StoryBlock.Rule
        is FencedCodeBlock -> StoryBlock.CodeBlock(node.literal.removeSuffix("\n"))
        is IndentedCodeBlock -> StoryBlock.CodeBlock(node.literal.removeSuffix("\n"))
        // The site renders stories without raw HTML: it shows as text.
        is HtmlBlock -> StoryBlock.Paragraph(listOf(InlineRun(node.literal.trim('\n'))))
        is TableBlock -> StoryBlock.Paragraph(listOf(InlineRun(tableText(node))))
        else -> null
    }

    /** The web's `p` override (StoryMarkdown.tsx). */
    private fun paragraph(p: Paragraph): StoryBlock {
        val meaningful = children(p).filterNot { it is Text && it.literal.isBlank() }
        val only = meaningful.singleOrNull()
        if (only is Link && only.destination.startsWith("/card/")) return StoryBlock.CardEmbed(only.destination, plain(only))
        if (only is Image) return StoryBlock.Image(only.destination, plain(only))
        val runs = inlines(p)
        val linkKey = when (only) {
            // A linked picture is a picture, not a link of its own.
            is Link -> only.destination.takeIf { !holdsImage(only) }?.let(StoryLinks::keyOf)
            is Text -> StoryLinks.bareKey(only.literal)
            else -> null
        }
        if (linkKey != null) return StoryBlock.SoleLink(linkKey, runs)
        val text = runs.joinToString("") { it.text }
        if (text.isNotEmpty() && text.all { it == ' ' || it.isWhitespace() }) return StoryBlock.Blank
        return StoryBlock.Paragraph(runs)
    }

    /**
     * The runs of [node]'s children. [link] is where a tap on them goes (null: nowhere); [inLink]
     * whether they are a link's words at all — a link the reader can't open among them, whose words
     * are plain text but still never hold a link of their own.
     */
    private fun inlines(
        node: Node,
        bold: Boolean = false,
        italic: Boolean = false,
        strike: Boolean = false,
        link: String? = null,
        inLink: Boolean = false,
    ): List<InlineRun> {
        val runs = ArrayList<InlineRun>()
        for (child in children(node)) {
            when (child) {
                is Text -> runs += textRuns(child.literal, bold, italic, strike, link, inLink)
                is SoftLineBreak -> runs += InlineRun(" ", bold, italic, strike, link = link)
                is HardLineBreak -> runs += InlineRun("\n", bold, italic, strike, link = link)
                is Code -> runs += InlineRun(child.literal, bold, italic, strike, code = true, link = link)
                is StrongEmphasis -> runs += inlines(child, true, italic, strike, link, inLink)
                is Emphasis -> runs += inlines(child, bold, true, strike, link, inLink)
                is Strikethrough -> runs += inlines(child, bold, italic, true, link, inLink)
                // A link the reader can't open (tel:, another app's scheme…) is plain text (StoryLink) — a link's words all the same.
                is Link -> runs += inlines(child, bold, italic, strike, child.destination.takeIf(StoryLink::isTappable), inLink = true)
                // An image inside running text keeps its alt text in the line.
                is Image -> runs += InlineRun(plain(child), bold, italic, strike, link = link)
                is HtmlInline -> runs += InlineRun(child.literal, bold, italic, strike, link = link)
                else -> runs += inlines(child, bold, italic, strike, link, inLink)
            }
        }
        return runs
    }

    /**
     * A run of plain text, with the web addresses written bare in it as links — as the web's reader
     * makes them (GFM's autolinks) — by the link rules the apps share with the server ([Linkify]):
     * `https://…` and `www.…`, ending where a sentence goes on. A link's words ([inLink]) are that
     * link's, tappable or not: GFM never makes a link inside a link (`[https://a.com](tel:1)` reads
     * as plain words).
     */
    private fun textRuns(text: String, bold: Boolean, italic: Boolean, strike: Boolean, link: String?, inLink: Boolean): List<InlineRun> {
        val found = if (!inLink) Linkify.find(text) else emptyList()
        if (found.isEmpty()) return listOf(InlineRun(text, bold, italic, strike, link = link))
        val runs = ArrayList<InlineRun>()
        var at = 0
        for (bare in found) {
            if (bare.range.first > at) runs += InlineRun(text.substring(at, bare.range.first), bold, italic, strike)
            runs += InlineRun(text.substring(bare.range.first, bare.range.last + 1), bold, italic, strike, link = bare.url)
            at = bare.range.last + 1
        }
        if (at < text.length) runs += InlineRun(text.substring(at), bold, italic, strike)
        return runs
    }

    private fun plain(node: Node): String = inlines(node).joinToString("") { it.text }

    private fun holdsImage(node: Node): Boolean = node is Image || children(node).any(::holdsImage)

    private fun tableText(table: TableBlock): String {
        val rows = ArrayList<String>()
        fun walk(n: Node) {
            for (c in children(n)) {
                if (c.javaClass.simpleName == "TableRow") rows += children(c).filterIsInstance<TableCell>().joinToString("  ·  ") { plain(it) }
                else walk(c)
            }
        }
        walk(table)
        return rows.joinToString("\n")
    }
}

/**
 * The room a story's blocks keep around them — src/styles/story.css's margins, in dp at the normal
 * text size, as the story's type resolves them (the design layer's `StoryType.spacing()`, from the
 * generated tokens; this module sees no tokens): [paragraph] after a paragraph, a list, a quote, a
 * code block (1.3em of the body); a heading's room above and below in its own em (`#` and `##`
 * as the reader's h2, `###` and below as its h3); [block] around a picture, a link card or an
 * embedded card; [rule] around the pen rule; [blank] a blank line's own height (1.6em); [item]
 * above and below each list item.
 */
data class ProseSpacing(
    val paragraph: Float,
    val h2Above: Float,
    val h2Below: Float,
    val h3Above: Float,
    val h3Below: Float,
    val block: Float,
    val rule: Float,
    val blank: Float,
    val item: Float,
)

/**
 * The CSS margins (top, bottom) of each block, and the gap between two blocks: the larger of the
 * facing margins, as CSS collapses them (story.css). Nothing above a story's first block or below
 * its last (`.story-prose > :first-child` / `:last-child`); inside a quote — its own formatting
 * context — a first heading has none above it (`:first-child`) while a picture or a card keeps its
 * room. A standalone link is a paragraph unless it is drawn as its page's card ([drawnAsCard]).
 */
object ProseMetrics {
    fun margins(block: StoryBlock, spacing: ProseSpacing, drawnAsCard: (StoryBlock.SoleLink) -> Boolean = { false }): Pair<Float, Float> = when (block) {
        is StoryBlock.Heading -> if (block.level <= 2) spacing.h2Above to spacing.h2Below else spacing.h3Above to spacing.h3Below
        StoryBlock.Blank -> 0f to 0f
        is StoryBlock.Image, is StoryBlock.CardEmbed -> spacing.block to spacing.block
        is StoryBlock.SoleLink -> if (drawnAsCard(block)) spacing.block to spacing.block else 0f to spacing.paragraph
        StoryBlock.Rule -> spacing.rule to spacing.rule
        // A list's first item's room collapses through the list's own top (it has no border or padding there).
        is StoryBlock.ListBlock -> spacing.item to spacing.paragraph
        is StoryBlock.Paragraph, is StoryBlock.Quote, is StoryBlock.CodeBlock -> 0f to spacing.paragraph
    }

    /**
     * The room above each block of a column: the story's own ([nested] false: none above the
     * first), or a quote's ([nested]: its first block keeps its own top margin, unless it is a
     * heading or text).
     */
    fun gaps(
        blocks: List<StoryBlock>,
        spacing: ProseSpacing,
        nested: Boolean = false,
        drawnAsCard: (StoryBlock.SoleLink) -> Boolean = { false },
    ): List<Float> = blocks.indices.map { i ->
        val top = margins(blocks[i], spacing, drawnAsCard).first
        if (i == 0) {
            if (!nested || blocks[i] is StoryBlock.Heading) 0f else top
        } else {
            maxOf(margins(blocks[i - 1], spacing, drawnAsCard).second, top)
        }
    }

    /**
     * The room above each item of a list after the first: the items' own room (0.3em each side,
     * collapsing to one), or more when an item ends on a block that keeps room below it (a nested
     * list) — never a paragraph's, which an item's last paragraph gives up (`li > p:last-child`).
     */
    fun itemGaps(items: List<List<StoryBlock>>, spacing: ProseSpacing, drawnAsCard: (StoryBlock.SoleLink) -> Boolean = { false }): List<Float> =
        items.indices.map { i ->
            if (i == 0) return@map 0f
            val last = items[i - 1].lastOrNull()
            val below = when (last) {
                null, is StoryBlock.Paragraph -> 0f
                is StoryBlock.SoleLink -> if (drawnAsCard(last)) spacing.block else 0f
                else -> margins(last, spacing, drawnAsCard).second
            }
            maxOf(spacing.item, below)
        }
}
