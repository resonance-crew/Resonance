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
 * every cell at its start edge whatever its delimiter says (round 9 §6), each column 4–18 em wide
 * before its words wrap; one that fits its column stays put, one wider scrolls sideways inside it;
 * TalkBack meets it as 表格, a table of its rows and columns. Its rules are drawn by hand with a light
 * pen: the head's ±1.0 past the table's ends, the rows' ±0.7 short of them, a turn per ~90.
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

    @Test fun aTablesWordsAreSetNotJustifiedItsFiguresTabularEveryCellAtItsStart() {
        // A column the delimiter row put at its end (---:) still starts its words at the cell's start edge.
        val asked = ProseStyle.body(cjk, "zh-TW").copy(align = Layout.Alignment.ALIGN_OPPOSITE, justified = true)
        val body = tableBodyStyle(asked)
        assertEquals(Layout.Alignment.ALIGN_NORMAL, body.align)
        assertEquals(false, body.justified)
        assertEquals(asked.size * 0.94f, body.size, 1e-4f)
        val (layout, _) = buildRichLayout(listOf(InlineRun("12")), body, 200, Density(1f, 1f))
        assertTrue(layout.paint.fontFeatureSettings!!.contains("'tnum'"))
        assertEquals(0f, layout.getLineLeft(0), 0.5f)
    }

    @Test fun theRulesAreDrawnByHandAndKeepTheirWobble() {
        fun ys(rule: List<com.resonance.geometry.PathCommand>) = rule.flatMap { c ->
            when (c) {
                is com.resonance.geometry.PathCommand.Move -> listOf(c.y)
                is com.resonance.geometry.PathCommand.Cubic -> listOf(c.y)
                else -> emptyList()
            }
        }
        fun ends(rule: List<com.resonance.geometry.PathCommand>) = rule.mapNotNull { c ->
            when (c) {
                is com.resonance.geometry.PathCommand.Move -> c.x
                is com.resonance.geometry.PathCommand.Cubic -> c.x
                else -> null
            }
        }
        val head = tableRule(360f, 41.0, 0, head = true)
        val row = tableRule(360f, 41.0, 2, head = false)
        // The head runs 1.5 past each end, a row stops 2 short: as drawn from -1.5 and 2.
        assertEquals(363.0, ends(head).last(), 1e-6)
        assertEquals(356.0, ends(row).last(), 1e-6)
        // One turn per ~90, at least 3; never past ±1.0 (head) and ±0.7 (row), and never straight.
        assertEquals(4, head.size - 1)
        assertEquals(4, row.size - 1)
        assertEquals(3, tableRule(120f, 41.0, 0, head = true).size - 1)
        assertTrue(ys(head).all { kotlin.math.abs(it) <= TABLE_HEAD_AMP + 1e-9 })
        assertTrue(ys(row).all { kotlin.math.abs(it) <= TABLE_ROW_AMP + 1e-9 })
        assertTrue(ys(head).any { kotlin.math.abs(it) > 0.05 })
        // Seeded by the table and the row: the same rule each time, another row's another.
        assertEquals(row, tableRule(360f, 41.0, 2, head = false))
        assertTrue(row != tableRule(360f, 41.0, 3, head = false))
    }
}
