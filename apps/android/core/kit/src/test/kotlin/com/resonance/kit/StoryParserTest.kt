package com.resonance.kit

import com.resonance.api.models.LinkPreview as ApiLinkPreview
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.ProseMetrics
import com.resonance.kit.story.ProseSpacing
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryLinks
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.TableAlign
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.math.roundToInt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The reader's block rules against native/fixtures/markdown-corpus.json (same cases as iOS). */
class StoryParserTest {
    // The fixtures' pictures are on example hosts: read as before any API is configured (another test may have set one).
    @kotlin.test.BeforeTest fun noSiteYet() {
        com.resonance.kit.story.StoryPictures.siteHost = null
    }

    private val corpus: Map<String, String> = Json.parseToJsonElement(
        File(System.getProperty("repoRoot"), "native/fixtures/markdown-corpus.json").readText(),
    ).jsonObject["cases"]!!.jsonArray.associate {
        it.jsonObject["id"]!!.jsonPrimitive.content to it.jsonObject["canonical"]!!.jsonPrimitive.content
    }

    private fun blocks(id: String) = StoryParser.parse(corpus.getValue(id))
    private fun text(block: StoryBlock) = (block as StoryBlock.Paragraph).runs.joinToString("") { it.text }

    // Tables (round 8 §5.2): a GFM table is a table block — its head, its rows, each column's alignment.

    private fun cells(row: List<List<InlineRun>>) = row.map { cell -> cell.joinToString("") { it.text } }

    @Test fun aStoryNestedPastWhatItCanDescendIsReadAsItsWords() {
        // The mapping (and the reader drawing it) recurses per level: thousands of quotes ran it out
        // of stack. Past the limit the story is its paragraphs of words, as written (the iOS reader's
        // rule); at the limit it is parsed as ever.
        val deep = "> ".repeat(20_000) + "雨停了\n\n第二段"
        assertTrue(com.resonance.kit.story.StoryNesting.tooDeep(deep))
        assertEquals(
            listOf(StoryBlock.Paragraph(listOf(InlineRun("> ".repeat(20_000) + "雨停了"))), StoryBlock.Paragraph(listOf(InlineRun("第二段")))),
            StoryParser.parse(deep),
        )
        val atLimit = "> ".repeat(com.resonance.kit.story.StoryNesting.LIMIT) + "雨停了"
        assertTrue(!com.resonance.kit.story.StoryNesting.tooDeep(atLimit))
        assertIs<StoryBlock.Quote>(StoryParser.parse(atLimit).first())
        // Lists nest by indenting too.
        val indented = (0 until 200).joinToString("\n") { "  ".repeat(it) + "- a" }
        assertTrue(com.resonance.kit.story.StoryNesting.tooDeep(indented))
        assertTrue(!com.resonance.kit.story.StoryNesting.tooDeep("- a\n  - b\n    - c"))
    }

    @Test fun aParagraphOfDelimitersThatNeverPairIsReadAsItsWords() {
        val nesting = com.resonance.kit.story.StoryNesting
        val deep = "**".repeat(5_000) + "雨" + "**".repeat(5_000)
        assertTrue(nesting.tooComplex(deep))
        assertEquals(1, StoryParser.parse(deep).size)
        for (flood in listOf("*_".repeat(2_000) + "x", "~~a ".repeat(2_000), "*[".repeat(2_000) + "x")) assertTrue(nesting.tooComplex(flood))
        val half = nesting.PARAGRAPH_DELIMITERS / 4
        assertTrue(!nesting.tooComplex("*_".repeat(half) + "雨" + "_*".repeat(half)))
        val ordinary = (0 until 40).joinToString("\n\n") { "這段有 **重點** 和 *強調*，第${it}段。" }
        assertTrue(!nesting.tooComplex(ordinary))
        assertTrue(!nesting.tooComplex("```\n" + "snake_case_name = other_value * __dunder__\n".repeat(300) + "```"))
        val wide = "|" + "a|".repeat(1_000) + "\n|" + "-|".repeat(1_000) + "\n" + "a\n".repeat(80_000)
        assertTrue(nesting.tooComplex(wide))
        assertTrue(!nesting.tooComplex("| a | b | c |\n| --- | --- | --- |\n" + "| x | y | z |\n".repeat(400)))
        // The cells are the story's, not a table's; a table needs no pipe; a CR ends a line as LF does.
        assertTrue(nesting.tooComplex("a\n:-\n" + "a\n".repeat(90_000)))
        assertTrue(nesting.tooComplex(List(200) { "|" + "a|".repeat(100) + "\n|" + "-|".repeat(100) + "\n" + "a\n".repeat(48) }.joinToString("\n")))
        assertTrue(nesting.tooComplex("|" + "a|".repeat(1_000) + "\r|" + "-|".repeat(1_000) + "\r" + "a\r".repeat(80_000)))
        assertTrue(nesting.tooComplex("x\r" + "> ".repeat(5_000) + "x"))
        assertTrue(!nesting.tooComplex(List(6) { "| a | b | c |\n| --- | --- | --- |\n" + "| x | y | z |\n".repeat(40) }.joinToString("\n")))
        assertTrue(!nesting.tooComplex("> 一\r\n> > 二\r\n\r\n**粗體** 與 *斜體*\r\n\r\n".repeat(2_000)))
        assertTrue(!nesting.tooComplex(("一行詩\n".repeat(400) + "---\n").repeat(6)))
        // Only what CommonMark reads as a fence hides its inside, and a fence ends with its container.
        val big = "|" + "a|".repeat(1_000) + "\n|" + "-|".repeat(1_000) + "\n" + "a\n".repeat(1_000)
        for (before in listOf("    ```\n\n", "```a`\n\n", "> ```\n\n", "- ```\n  code\nx\n\n")) assertTrue(nesting.tooComplex(before + big))
        assertTrue(nesting.tooComplex("    ```\n\n" + List(30) { "*a ".repeat(2_000) }.joinToString("\n\n")))
        assertTrue(!nesting.tooComplex("- 步驟\n\n  ```js\n" + "  const snake_case = a_b * c_d;\n".repeat(200) + "  ```\n\n- 下一步"))
        assertTrue(!nesting.tooComplex("> ```\n" + "> snake_case_name = __dunder__\n".repeat(200) + "> ```"))
        assertTrue(!nesting.tooComplex("~~~\n" + "a_b_c * d\n".repeat(200) + "~~~\n\n````md\n```\n" + "x_y * z\n".repeat(200) + "````"))
        val many = List(40) { "*a ".repeat(nesting.PARAGRAPH_DELIMITERS - 10) }.joinToString("\n\n")
        assertTrue(nesting.tooComplex(many))
        assertEquals(emptyList(), com.resonance.kit.story.SharePassages.blocks(deep + "\n\n第二段，平平常常的一段話，也值得被讀到。"))
    }

    @Test fun onlyTheSitesPicturesAreDrawnAnyOtherIsALink() {
        val pictures = com.resonance.kit.story.StoryPictures
        pictures.siteHost = "resonance.channel"
        try {
            assertEquals(StoryBlock.Image("https://img.resonance.channel/a.webp", "ours"), StoryParser.parse("![ours](https://img.resonance.channel/a.webp)").single())
            assertEquals(StoryBlock.Image("/api/emulator-storage/x.webp", ""), StoryParser.parse("![](/api/emulator-storage/x.webp)").single())
            for (elsewhere in listOf("https://pictures.example.invalid/p.png", "https://img.resonance.channel.example.invalid/p.png", "https://img.resonance.channel@pictures.example.invalid/p.png")) {
                val block = StoryParser.parse("![那裡]($elsewhere)").single()
                assertEquals(StoryBlock.Paragraph(listOf(InlineRun("那裡", link = elsewhere))), block)
            }
        } finally {
            pictures.siteHost = null
        }
    }

    @Test fun aTableIsItsHeadItsRowsAndItsColumnsAlignments() {
        val b = blocks("table-basic")
        assertEquals(3, b.size)
        assertEquals("前言", text(b[0]))
        val t = assertIs<StoryBlock.Table>(b[1])
        assertEquals(listOf("名稱", "數量"), cells(t.head))
        assertEquals(listOf(listOf("蘋果", "3"), listOf("香蕉", "12")), t.rows.map(::cells))
        // None written reads from the start; `---:` at the end.
        assertEquals(listOf(TableAlign.Start, TableAlign.End), t.align)
        assertEquals("結尾", text(b[2]))
    }

    @Test fun aTablesCellsKeepTheirMarksAndEachColumnItsAlignment() {
        val t = assertIs<StoryBlock.Table>(blocks("table-padded-and-marked").single())
        assertEquals(listOf(TableAlign.Start, TableAlign.Center, TableAlign.End), t.align)
        assertEquals(listOf("地點", "時間", "心情"), cells(t.head))
        assertEquals(listOf(InlineRun("台北", bold = true)), t.rows[0][0])
        assertEquals(listOf(InlineRun("高雄", link = "https://example.com")), t.rows[1][0])
        assertEquals(listOf(InlineRun("普通", code = true)), t.rows[1][2])
    }

    @Test fun anEscapedPipeIsACellsOwn() {
        val t = assertIs<StoryBlock.Table>(blocks("table-escaped-pipe").single())
        assertEquals(listOf(listOf("a | b", "或")), t.rows.map(::cells))
    }

    @Test fun aTableInAQuoteAndTextAroundOneStayWhereTheyAre() {
        val quote = assertIs<StoryBlock.Quote>(blocks("table-in-quote").single())
        val t = assertIs<StoryBlock.Table>(quote.children.single())
        assertEquals(listOf(listOf("2024", "搬家")), t.rows.map(::cells))
        val after = blocks("table-then-text")
        assertIs<StoryBlock.Table>(after[0])
        assertEquals("表格之後的一段話。", text(after[1]))
        val before = blocks("table-after-a-line")
        assertEquals("下面是清單：", text(before[0]))
        assertEquals(listOf("項目", "說明"), cells(assertIs<StoryBlock.Table>(before[1]).head))
    }

    @Test fun everyRowHasAsManyCellsAsTheHead() {
        // A short row is filled with empty cells, a long one cut, as GFM reads it.
        val t = assertIs<StoryBlock.Table>(StoryParser.parse("| a | b | c |\n| - | - | - |\n| 1 |\n| 1 | 2 | 3 | 4 |").single())
        assertEquals(listOf(listOf("1", "", ""), listOf("1", "2", "3")), t.rows.map(::cells))
        // A head with no rows is a table all the same.
        assertEquals(emptyList(), assertIs<StoryBlock.Table>(StoryParser.parse("| a | b |\n|:-:|:-|").single()).rows)
    }

    @Test fun aTableKeepsABlocksAirAsAPictureDoes() {
        val spacing = ProseSpacing(paragraph = 20f, h2Above = 40f, h2Below = 16f, h3Above = 30f, h3Below = 12f, block = 28f, rule = 36f, blank = 24f, item = 4f)
        val gaps = ProseMetrics.gaps(blocks("table-basic"), spacing)
        // Above it the larger of the paragraph's 20 and its 28; below, its 28 over the next paragraph's 0.
        assertEquals(listOf(0f, 28f, 28f), gaps)
    }

    @Test fun aLoneCardLinkIsAnEmbeddedCard() {
        val b = blocks("card-embed")
        assertEquals(3, b.size)
        assertEquals(StoryBlock.CardEmbed("/card/a-walk-after-the-rain", "一場雨後的散步"), b[1])
    }

    @Test fun aCardLinkInsideASentenceStaysALink() {
        val p = blocks("card-link-mid-sentence").first() as StoryBlock.Paragraph
        assertEquals("見 一場雨後的散步 這張卡片。", p.runs.joinToString("") { it.text })
        assertTrue(p.runs.any { it.link == "/card/a-walk-after-the-rain" && it.text == "一場雨後的散步" })
    }

    @Test fun aLonePhotoIsAnImageBlock() {
        assertEquals(StoryBlock.Image("https://cdn.example.com/image/u1/rain.avif", "巷口的積水"), blocks("image-block")[1])
        assertEquals(StoryBlock.Image("https://cdn.example.com/x.avif", "alt"), blocks("image-then-text-no-gap").first())
    }

    @Test fun theBlankMarkerIsExtraSpace() {
        assertEquals(listOf(false, true, false), blocks("blank-paragraph").map { it == StoryBlock.Blank })
    }

    @Test fun headingsQuotesListsRulesAndCode() {
        assertEquals(3, (blocks("headings")[2] as StoryBlock.Heading).level)
        assertEquals(2, (blocks("blockquote").first() as StoryBlock.Quote).children.size)
        val lists = blocks("lists")
        assertEquals(false to 2, (lists[0] as StoryBlock.ListBlock).let { it.ordered to it.items.size })
        assertEquals(Triple(true, 1, 2), (lists[1] as StoryBlock.ListBlock).let { Triple(it.ordered, it.start, it.items.size) })
        assertEquals(StoryBlock.Rule, blocks("rule")[1])
        assertEquals(listOf<StoryBlock>(StoryBlock.CodeBlock("const a = 1;")), blocks("code-block"))
    }

    @Test fun inlineMarksAndBreaks() {
        val runs = (blocks("inline-marks").first() as StoryBlock.Paragraph).runs
        assertTrue(runs.contains(InlineRun("粗體", bold = true)))
        assertTrue(runs.contains(InlineRun("斜體", italic = true)))
        assertTrue(runs.contains(InlineRun("刪除線", strikethrough = true)))
        assertTrue(runs.any { it.text == "code" && it.code })
        assertEquals("第一行\n第二行", text(blocks("hard-break")[0]))
    }

    @Test fun escapedSyntaxAndHtmlStayText() {
        assertEquals("*不是粗體*，1. 不是清單，# 不是標題，a_b_c。", text(blocks("escapes")[0]))
        assertEquals("<b>不是 HTML</b> 與 <script>x</script>", text(blocks("html-is-text")[0]))
    }

    /** A CJK story's room on a wide window (18px body): story.css's margins as the type resolves them. */
    private val cjkWide = ProseSpacing(
        paragraph = 23.4f, h2Above = 46.8f, h2Below = 14.04f, h3Above = 40.32f, h3Below = 10.08f,
        block = 32f, rule = 40f, blank = 28.8f, item = 5.4f,
    )

    private fun rounded(gaps: List<Float>) = gaps.map { (it * 100).roundToInt() / 100.0 }

    @Test fun proseMarginsCollapseLikeCss() {
        val p = StoryBlock.Paragraph(emptyList())
        val gaps = ProseMetrics.gaps(listOf(p, StoryBlock.Heading(2, emptyList()), p, StoryBlock.Blank, p, StoryBlock.Heading(4, emptyList()), p), cjkWide)
        // The heading's room above wins over the paragraph's below it; its own below binds it to the text after.
        assertEquals(listOf(0.0, 46.8, 14.04, 23.4, 0.0, 40.32, 10.08), rounded(gaps))
        assertIs<StoryBlock.Blank>(blocks("blank-paragraph")[1])
    }

    @Test fun picturesCardsAndRulesKeepTheirOwnRoom() {
        val p = StoryBlock.Paragraph(emptyList())
        val link = StoryBlock.SoleLink("https://example.com/", emptyList())
        val blocks = listOf(p, StoryBlock.Image("a.jpg", ""), p, StoryBlock.Rule, p, link, p, StoryBlock.CardEmbed("/card/x", "x"), StoryBlock.ListBlock(false, 1, listOf(listOf(p))))
        // A standalone link with a preview is a card's block; without one it is a paragraph.
        assertEquals(listOf(0.0, 32.0, 32.0, 40.0, 40.0, 32.0, 32.0, 32.0, 32.0), rounded(ProseMetrics.gaps(blocks, cjkWide) { true }))
        assertEquals(listOf(0.0, 32.0, 32.0, 40.0, 40.0, 23.4, 23.4, 32.0, 32.0), rounded(ProseMetrics.gaps(blocks, cjkWide) { false }))
    }

    @Test fun aQuoteKeepsAPictureRoomAboveButNotAHeadings() {
        val p = StoryBlock.Paragraph(emptyList())
        assertEquals(listOf(32.0, 32.0), rounded(ProseMetrics.gaps(listOf(StoryBlock.Image("a.jpg", ""), p), cjkWide, nested = true)))
        assertEquals(listOf(0.0, 10.08), rounded(ProseMetrics.gaps(listOf(StoryBlock.Heading(3, emptyList()), p), cjkWide, nested = true)))
        assertEquals(listOf(0.0, 23.4), rounded(ProseMetrics.gaps(listOf(p, p), cjkWide, nested = true)))
    }

    @Test fun listItemsPartByTheirOwnRoomUnlessANestedListEndsOne() {
        val p = StoryBlock.Paragraph(emptyList())
        val nested = StoryBlock.ListBlock(false, 1, listOf(listOf(p)))
        assertEquals(listOf(0.0, 5.4, 23.4), rounded(ProseMetrics.itemGaps(listOf(listOf(p), listOf(p, nested), listOf(p)), cjkWide)))
    }

    // Standalone links (native/fixtures/story-link-cards.json, the server's and the web's own cases)

    private class LinkCase(val id: String, val markdown: String, val soleLinks: List<String>, val inline: List<String>)

    private val linkCases: List<LinkCase> = Json.parseToJsonElement(
        File(System.getProperty("repoRoot"), "native/fixtures/story-link-cards.json").readText(),
    ).jsonObject["cases"]!!.jsonArray.map { c ->
        val o = c.jsonObject
        fun list(name: String) = o[name]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
        LinkCase(o["id"]!!.jsonPrimitive.content, o["markdown"]!!.jsonPrimitive.content, list("soleLinks"), list("inline"))
    }

    /** Every block of the story, in reading order: inside quotes and list items too. */
    private fun flatten(blocks: List<StoryBlock>): List<StoryBlock> = blocks.flatMap { b ->
        when (b) {
            is StoryBlock.Quote -> listOf(b) + flatten(b.children)
            is StoryBlock.ListBlock -> listOf(b) + b.items.flatMap(::flatten)
            else -> listOf(b)
        }
    }

    private fun runsOf(block: StoryBlock): List<InlineRun> = when (block) {
        is StoryBlock.Paragraph -> block.runs
        is StoryBlock.SoleLink -> block.runs
        else -> emptyList()
    }

    @Test fun everyStandaloneLinkOfTheSharedCasesIsFoundUnderTheServersKey() {
        assertTrue(linkCases.size >= 20)
        for (case in linkCases) {
            val found = flatten(StoryParser.parse(case.markdown)).filterIsInstance<StoryBlock.SoleLink>().map { it.key }
            assertEquals(case.soleLinks, found, case.id)
        }
    }

    @Test fun aLinkInsideASentenceStaysALinkInTheLine() {
        for (case in linkCases.filter { it.inline.isNotEmpty() }) {
            val blocks = flatten(StoryParser.parse(case.markdown))
            assertTrue(blocks.none { it is StoryBlock.SoleLink }, case.id)
            // Still the paragraph it was, its words all there, and each link in it tappable — a bare address too, as the web's reader makes it.
            assertTrue(blocks.any { it is StoryBlock.Paragraph }, case.id)
            // The fixture names each by the server's key (its URL parser's), so each run's link is compared as that key too:
            // a link as written (`?q=what's`) and its key (`?q=what%27s`) are the same link.
            val links = blocks.flatMap(::runsOf).mapNotNull { run -> run.link?.let { StoryLinks.keyOf(it) ?: it } }
            for (url in case.inline) assertTrue(url in links, "${case.id}: $url in $links")
        }
    }

    @Test fun anAddressWrittenBareInTheTextIsALink() {
        val runs = runsOf(StoryParser.parse("我讀了 https://example.com/a 和 www.example.org/b。").single())
        assertEquals(
            listOf(
                InlineRun("我讀了 "),
                InlineRun("https://example.com/a", link = "https://example.com/a"),
                InlineRun(" 和 "),
                InlineRun("www.example.org/b", link = "https://www.example.org/b"),
                InlineRun("。"),
            ),
            runs,
        )
        // Marked as the words around it are; inside a link, or in code, it is that link's (or none).
        assertEquals(listOf(InlineRun("https://example.com/b", bold = true, link = "https://example.com/b")), runsOf(StoryParser.parse("**https://example.com/b**").single()))
        assertEquals(listOf(InlineRun("see https://example.com/x", link = "https://example.com/y")), runsOf(StoryParser.parse("[see https://example.com/x](https://example.com/y)").single()))
        // A link the reader can't open is plain words — and still a link's words, which GFM never links on their own.
        assertEquals(listOf(InlineRun("https://example.com/a")), runsOf(StoryParser.parse("[https://example.com/a](tel:1)").single()))
        assertEquals(
            listOf(InlineRun("call "), InlineRun("www.example.com", bold = true), InlineRun(" now")),
            runsOf(StoryParser.parse("[call **www.example.com** now](tel:+886212345678)").single()),
        )
        assertEquals(listOf(InlineRun("https://example.com/c", code = true)), runsOf(StoryParser.parse("`https://example.com/c`").single()))
        // Not an address by the link rules: plain text.
        assertEquals(listOf(InlineRun("example.com 和 http://localhost/x")), runsOf(StoryParser.parse("example.com 和 http://localhost/x").single()))
    }

    @Test fun aStandaloneLinkKeepsItsWordsForWhenThereIsNoPreview() {
        val block = StoryParser.parse("前一段。\n\n[一篇好文章](https://blog.example.com/post/42)\n\n後一段。")[1]
        assertIs<StoryBlock.SoleLink>(block)
        assertEquals(listOf(InlineRun("一篇好文章", link = "https://blog.example.com/post/42")), runsOf(block))
        // A bare one, with no preview, is still a link to tap (and to TalkBack), as on the web.
        val bare = StoryParser.parse("https://no-such-host.invalid/page").single()
        assertEquals(
            StoryBlock.SoleLink("https://no-such-host.invalid/page", listOf(InlineRun("https://no-such-host.invalid/page", link = "https://no-such-host.invalid/page"))),
            bare,
        )
    }

    @Test fun anAddressInDisguiseIsReadAsTheDottedFourABrowserReads() {
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("127.1"))
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("0x7f.1"))
        assertEquals("127.0.0.1", StoryLinks.dottedQuad("2130706433"))
        assertEquals("10.0.0.8", StoryLinks.dottedQuad("012.0.0.010"))
        assertEquals("1.2.3.4", StoryLinks.dottedQuad("1.2.3.4."))
        assertNull(StoryLinks.dottedQuad("256.1.1.1"))
        assertNull(StoryLinks.dottedQuad("1.2.3.4.5"))
        assertNull(StoryLinks.dottedQuad("4294967296"))
        assertNull(StoryLinks.dottedQuad("example.com"))
        assertEquals("https://127.0.0.1/x", StoryLinks.keyOf("https://127.1/x"))
        // Only the scheme's own port, and never a name before the host.
        assertNull(StoryLinks.keyOf("https://example.com:8443/"))
        assertEquals("https://example.com/", StoryLinks.keyOf("https://example.com:443/"))
        assertNull(StoryLinks.keyOf("https://user@127.1/"))
        assertNull(StoryLinks.keyOf("www.example.com"))
    }

    @Test fun aKeyIsTheAddressAsTheServersUrlParserWritesIt() {
        // Each pinned against node's `new URL(link).href`, which the server keys a preview by (normalizeLink).
        val cases = mapOf(
            // Each part with its own percent-encode set: `'` in the query only, `{ }` in the path only.
            "https://example.com/search?q=what's+up" to "https://example.com/search?q=what%27s+up",
            "https://example.com/p'q" to "https://example.com/p'q",
            "https://example.com/q?a'b#c'd" to "https://example.com/q?a%27b#c'd",
            "https://example.com/p{1}?x={1}#{f}" to "https://example.com/p%7B1%7D?x={1}#{f}",
            "https://example.com/a\"b" to "https://example.com/a%22b",
            "https://example.com/a`b?c`d#e`f" to "https://example.com/a%60b?c`d#e%60f",
            "https://example.com/a<b>?c<d>#e<f>" to "https://example.com/a%3Cb%3E?c%3Cd%3E#e%3Cf%3E",
            "https://example.com/a^b" to "https://example.com/a%5Eb",
            "https://example.com/a|b?c|d#e|f" to "https://example.com/a|b?c|d#e|f",
            "https://example.com/a[b]?c[d]#e[f]" to "https://example.com/a[b]?c[d]#e[f]",
            "https://example.com/中文?q=中#中" to "https://example.com/%E4%B8%AD%E6%96%87?q=%E4%B8%AD#%E4%B8%AD",
            "https://example.com/%zz?%" to "https://example.com/%zz?%",
            // Dot segments resolved (`%2e` is a dot too); one ending the path leaves its slash.
            "https://example.com/a/./b/../c" to "https://example.com/a/c",
            "https://example.com/a/b/.." to "https://example.com/a/",
            "https://example.com/a/." to "https://example.com/a/",
            "https://example.com/.." to "https://example.com/",
            "https://example.com/a/%2e%2E/b" to "https://example.com/b",
            "https://example.com/a/%2e/b" to "https://example.com/a/b",
            "https://example.com//x" to "https://example.com//x",
            // No path: the empty path is `/`.
            "https://example.com?x" to "https://example.com/?x",
            "https://example.com#f" to "https://example.com/#f",
            // The scheme's own port goes; the other of 80 and 443 stays, as written.
            "https://example.com:80/x" to "https://example.com:80/x",
            "http://example.com:443/x" to "http://example.com:443/x",
            "https://EXAMPLE.com:0443/x" to "https://example.com/x",
            "https://example.com:080/x" to "https://example.com:80/x",
            // A host in Unicode, written as a link's address, is its punycode.
            "https://例子.tw/x" to "https://xn--fsqu00a.tw/x",
        )
        for ((written, key) in cases) {
            assertEquals(key, StoryLinks.keyOf(written), written)
            // A key is its own key: the previews (the server's addresses) are found under what a paragraph derives.
            assertEquals(key, StoryLinks.keyOf(key), key)
        }
        // In running text: the same keys, but a host in Unicode is no link of the server's there.
        assertEquals("https://example.com/a'b?c%27d", StoryLinks.bareKey("https://example.com/a'b?c'd"))
        assertEquals("https://www.example.org/q?x=%271%27x", StoryLinks.bareKey("www.example.org/q?x='1'x"))
        assertNull(StoryLinks.bareKey("https://例子.tw/x"))
    }

    @Test fun aPreviewIsFoundUnderTheKeyItsParagraphDerives() {
        val previews = StoryLinks.previews(
            listOf(ApiLinkPreview("https://example.com/search?q=what%27s+up", "What's up", null, null, null)),
            "https://resonance.channel",
        )
        val block = StoryParser.parse("https://example.com/search?q=what's+up").single()
        assertIs<StoryBlock.SoleLink>(block)
        assertEquals("What's up", previews[block.key]?.title)
    }

    @Test fun thePreviewsAreFoundByTheirAddressWithAPictureOnlyFromTheProxy() {
        val origin = "http://10.0.2.2:3300"
        val previews = StoryLinks.previews(
            listOf(
                ApiLinkPreview("https://en.wikipedia.org/wiki/Jiufen", " Jiufen - Wikipedia ", null, "Wikipedia", "/api/link-image?u=a&s=b"),
                // Not a picture of ours: drawn without one.
                ApiLinkPreview("https://example.com/a", "A", "", null, "https://evil.example/x.png"),
                // No title, or no address the app opens: not drawn at all.
                ApiLinkPreview("https://example.com/b", "  ", null, null, null),
                ApiLinkPreview("ftp://example.com/c", "C", null, null, null),
            ),
            origin,
        )
        assertEquals(listOf("https://en.wikipedia.org/wiki/Jiufen", "https://example.com/a"), previews.keys.toList())
        val jiufen = previews.getValue("https://en.wikipedia.org/wiki/Jiufen")
        assertEquals("Jiufen - Wikipedia", jiufen.title)
        assertEquals("$origin/api/link-image?u=a&s=b", jiufen.imageUrl)
        assertNull(previews.getValue("https://example.com/a").imageUrl)
        assertNull(previews.getValue("https://example.com/a").description)
        assertEquals(emptyMap(), StoryLinks.previews(null, origin))
    }
}
