package com.resonance.design

import android.text.Layout
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * A story's table in the reader (round 8 §5.2): its rows and columns, the head in the story's bold,
 * each column aligned as written and 4–18 em wide before its words wrap; one that fits its column
 * stays put, one wider scrolls sideways inside it; TalkBack meets it as 表格, a table of its rows and
 * columns.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTableTest {
    @get:Rule val compose = createComposeRule()

    private val cjk = StoryType(StoryScript.Cjk, compact = true)

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    private fun story(markdown: String, width: Int = 360) = compose.setContent {
        Box(Modifier.width(width.dp)) { StoryMarkdown(StoryParser.parse(markdown), cjk, "zh-TW", {}) { _, _, _ -> } }
    }

    @Test fun aTableIsAnnouncedAsOneWithItsRowsAndColumns() {
        story("| 名稱 | 數量 |\n| --- | ---: |\n| 蘋果 | 3 |\n| 香蕉 | 12 |")
        compose.onNodeWithContentDescription(L10n.Card.table)
            .assert(SemanticsMatcher("a table of 3 rows and 2 columns") { node ->
                node.config.getOrElseNullable(SemanticsProperties.CollectionInfo) { null }?.let { it.rowCount == 3 && it.columnCount == 2 } == true
            })
        for (word in listOf("名稱", "數量", "蘋果", "3", "香蕉", "12")) compose.onNodeWithText(word).assertExists()
        // The columns line up row after row: 數量's column starts where 3's and 12's do.
        val head = compose.onNodeWithText("數量").getBoundsInRoot()
        val cell = compose.onNodeWithText("12").getBoundsInRoot()
        assertEquals(head.left, cell.left)
        // A table that fits its column doesn't scroll.
        compose.onNodeWithContentDescription(L10n.Card.table).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.HorizontalScrollAxisRange).or(
            SemanticsMatcher("nothing to scroll") { it.config[SemanticsProperties.HorizontalScrollAxisRange].maxValue() == 0f },
        ))
    }

    @Test fun aTableWiderThanItsColumnScrollsSidewaysInsideIt() {
        val wide = (1..8).joinToString(" | ", "| ", " |") { "第${it}欄的標題" }
        val rule = (1..8).joinToString(" | ", "| ", " |") { "---" }
        val row = (1..8).joinToString(" | ", "| ", " |") { "內容$it" }
        story("$wide\n$rule\n$row", width = 320)
        compose.onNodeWithContentDescription(L10n.Card.table).assert(
            SemanticsMatcher("scrolls sideways") { it.config[SemanticsProperties.HorizontalScrollAxisRange].maxValue() > 0f },
        )
    }

    @Test fun aColumnIsItsWidestWordsBetweenFourAndEighteenEm() {
        val natural = mapOf((-1 to 0) to 10f, (0 to 0) to 30f, (1 to 0) to 20f, (-1 to 1) to 500f, (0 to 1) to 900f, (1 to 1) to 100f)
        val widths = tableColumns(2, { r, c -> natural.getValue(r to c) }, rows = 2, min = 4 * 16f, max = 18 * 16f)
        // The first column's widest words (30) are under its 4 em (64); the second's (900) over its 18 (288).
        assertEquals(listOf(64f, 288f), widths)
        assertEquals(listOf(100f), tableColumns(1, { _, _ -> 99.2f }, rows = 0, min = 10f, max = 200f))
    }

    @Test fun aTablesWordsAreSetNotJustifiedItsHeadBoldItsFiguresTabular() {
        val body = ProseStyle.body(cjk, "zh-TW").copy(size = 15f * 0.94f, justified = false, tabular = true, align = Layout.Alignment.ALIGN_OPPOSITE)
        val (layout, _) = buildRichLayout(listOf(InlineRun("12")), body, 200, Density(1f, 1f))
        assertEquals(Layout.Alignment.ALIGN_OPPOSITE, layout.alignment)
        assertTrue(layout.paint.fontFeatureSettings!!.contains("'tnum'"))
        // The number sits at its column's end.
        assertTrue(layout.getLineLeft(0) > 100f)
    }
}
