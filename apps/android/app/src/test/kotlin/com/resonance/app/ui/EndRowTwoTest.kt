package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Density
import com.resonance.design.TagPill
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.Strings
import java.io.File
import kotlin.math.abs
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The faces' line over the capsule (round 30 §S1; row 2 under it until then), 收藏 beside the tags (a phone) or the
 * capsule (wide; round 28 §S2–§S4) as their twins draw them — the web's, where iOS differs (the screens' review: Android's stood apart from both). 收藏 a bare glyph in the
 * muted text ink with the one pen, its glyph 12 in from the row's end in its 48 box (the web's 44 button, centred, on
 * the row's end); a face 12 in from the row's start (the web's 6 + 6). Drawn for real and
 * measured pixel by pixel.
 */
@RunWith(RobolectricTestRunner::class)
// Wide enough for a tablet's column (680) beside a phone's (335).
@Config(application = Application::class, qualifiers = "w1000dp-h1600dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EndRowTwoTest {
    private val compose = createComposeRule()

    // The app's own manifest has no host for a composed screen: the test's activity is made known before the rule starts it.
    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    private val language = Strings.language
    private val density get() = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        AppFonts.init(RuntimeEnvironment.getApplication())
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun map(tag: String): PixelMap = compose.onNodeWithTag(tag).captureToImage().toPixelMap()

    /** The colour most of the glyph's pixels are (its pen's, the edges' blends aside). */
    private fun ink(map: PixelMap): Color =
        (0 until map.height).flatMap { y -> (0 until map.width).map { x -> map[x, y] } }
            .filter { it != Color.White }
            .groupingBy { it }.eachCount().maxBy { it.value }.key

    /** How many pixels lie between the last inked column and the image's end. */
    private fun endGap(map: PixelMap): Int {
        val last = (map.width - 1 downTo 0).first { x -> (0 until map.height).any { y -> map[x, y] != Color.White } }
        return map.width - 1 - last
    }

    private fun near(a: Color, b: Color) = abs(a.red - b.red) < 0.02f && abs(a.green - b.green) < 0.02f && abs(a.blue - b.blue) < 0.02f

    @Test fun bookmarkIsTheMutedTextInkWithTheOnePenItsGlyphTwelveInFromTheEnd() {
        var muted = Color.Unspecified
        var label = Color.Unspecified
        compose.setContent {
            muted = Tokens.TextMuted
            label = Tokens.ButtonOnTonal
            Column(Modifier.background(Color.White)) {
                Box(Modifier.testTag("button")) { BookmarkButton(saved = false) {} }
                Box(Modifier.testTag("saved")) { BookmarkButton(saved = true) {} }
                // The glyph alone in its own 20: where its drawing ends inside its box.
                Box(Modifier.testTag("glyph")) { OrganicIcon(IconName.Bookmark, size = BookmarkGlyph, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
            }
        }
        val button = map("button")
        assertEquals((48 * density).toInt(), button.width)
        // The text's muted ink, never the capsule's label brown — at rest and saved.
        assertTrue("收藏 is drawn in the muted text ink", near(ink(button), muted))
        assertNotEquals(label, ink(button))
        assertTrue("saved, filled in the same ink", near(ink(map("saved")), muted))
        // Its glyph's box ends 12 in from the 48's end (centred, it ended 14 in).
        val inside = endGap(map("glyph"))
        val expected = (Row2GlyphEnd.value * density).toInt() + inside
        assertTrue("the glyph ends ${endGap(button)} px in, expected $expected", abs(endGap(button) - expected) <= 1)
    }

    @Test fun aFaceStandsTwelveInFromTheRowsStartAndNothingEndsTheRow() {
        compose.setContent {
            Box(Modifier.width(320.dp).testTag("column")) {
                // A face as the group draws it now: the 28 itself, nothing round it (round 26: the pads are gone).
                EndRowTwo(Modifier.width(320.dp)) { Box(Modifier.size(28.dp).testTag("face")) }
            }
        }
        val row = compose.onNodeWithTag("column").getBoundsInRoot()
        val face = compose.onNodeWithTag("face").getBoundsInRoot()
        // The face's rim 12 in, the web's — where it stood when a pad of 3 came before it.
        assertEquals(12f, (face.left - row.left).value, 0.5f)
        // The row 48 tall with a face or none (the reader's own slides in without moving the page), 收藏 not on it (round 28 §S4).
        assertEquals(Row2Height.value, (row.bottom - row.top).value, 0.5f)
        compose.onAllNodesWithContentDescription("收藏").assertCountEquals(0)
    }

    private fun tags(n: Int) = listOf("散文", "早晨", "咖啡", "搬家", "一個人", "城市", "日常", "回憶", "台北", "練習").take(n)

    private fun toggle(saved: Boolean = false) = BookmarkToggle(launch = { error("nothing sent") }, writer = { null }).apply { read(saved) }

    /** The tags' row on a column [width] wide, 收藏 beside them as a reader sees it, at the text scale [fontScale]. */
    private fun tagsRow(names: List<String>, width: Int, saved: Boolean = false, fontScale: Float = 1f) {
        val toggle = toggle(saved)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(LocalDensity.current.density, fontScale)) {
                Column {
                    // One pill alone: a line's height at this text scale.
                    TagFlow(Modifier.testTag("single")) { TagPill(names.firstOrNull() ?: "散文", fill = Tokens.TerracottaLight) }
                    Box(Modifier.width(width.dp).testTag("column")) {
                        StoryTagsRow(names, toggle, Modifier.testTag("row"), tagsModifier = Modifier.testTag("tags"))
                    }
                }
            }
        }
    }

    private fun lineHeight() = compose.onNodeWithTag("single").getBoundsInRoot().let { (it.bottom - it.top).value }

    @Test fun onAPhone收藏EndsTheTagsRowCentredOnTheFirstLineAndTheRowStaysTheTags() {
        tagsRow(tags(2), 335)
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val one = compose.onNodeWithTag("tags").getBoundsInRoot()
        val mark = compose.onNodeWithContentDescription("收藏").getBoundsInRoot()
        // Its 48 flush with the column's end; the tags in their own column, 12 + 48 short of it.
        assertEquals(335f, mark.right.value, 0.5f)
        assertEquals(48f, (mark.right - mark.left).value, 0.5f)
        assertTrue("the tags keep to their column", one.right.value <= 335f - 60f + 0.5f)
        // One line: the box centred on it, the row the pills' height — the box hangs over it, not taller.
        val line = (one.bottom - one.top).value
        assertTrue("a pill is shorter than 收藏's box ($line)", line < 48f)
        assertEquals(line, (row.bottom - row.top).value, 0.5f)
        assertEquals((one.top.value + one.bottom.value) / 2, (mark.top.value + mark.bottom.value) / 2, 0.5f)
    }

    @Test fun manyTagsWrapUnderTheFirstLineAnd收藏StaysOnIt() {
        tagsRow(tags(10), 335)
        val line = lineHeight()
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val all = compose.onNodeWithTag("tags").getBoundsInRoot()
        val mark = compose.onNodeWithContentDescription("收藏").getBoundsInRoot()
        assertTrue("ten tags take more than one line", (all.bottom - all.top).value > line * 2)
        assertEquals((all.bottom - all.top).value, (row.bottom - row.top).value, 0.5f)
        // Centred on the first line, not the whole.
        assertEquals(all.top.value + line / 2, (mark.top.value + mark.bottom.value) / 2, 0.5f)
    }

    @Test fun noTags收藏AloneIsTheRowAndWideItIsNotThere() {
        tagsRow(emptyList(), 335, saved = true)
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        // Saved, it is named by what a tap does.
        val mark = compose.onNodeWithContentDescription("取消收藏").getBoundsInRoot()
        assertEquals(48f, (row.bottom - row.top).value, 0.5f)
        assertEquals(row.top.value, mark.top.value, 0.5f)
        assertEquals(335f, mark.right.value, 0.5f)
    }

    @Test fun wideTheTagsRowIsTheTagsAlone() {
        // Wide, 收藏 ends the capsule's row: the tags' row is the tags alone, across the column.
        tagsRow(tags(2), 680)
        compose.onAllNodesWithContentDescription("收藏").assertCountEquals(0)
    }

    @Test fun theOwnersLargeTextKeeps收藏OnTheFirstLineWithoutGrowingTheRow() {
        // The owner's Pixel: font 1.5× (round 17 and 24 shipped cut-off text there).
        tagsRow(tags(6), 335, fontScale = 1.5f)
        val line = lineHeight()
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val all = compose.onNodeWithTag("tags").getBoundsInRoot()
        val mark = compose.onNodeWithContentDescription("收藏").getBoundsInRoot()
        assertTrue("six tags wrap at 1.5×", (all.bottom - all.top).value > line * 1.5f)
        assertEquals((all.bottom - all.top).value, (row.bottom - row.top).value, 0.5f)
        assertEquals(335f, mark.right.value, 0.5f)
        assertEquals(all.top.value + line / 2, (mark.top.value + mark.bottom.value) / 2, 0.5f)
    }

    @Test fun wide收藏EndsTheCapsulesRowCentredOnItAndTheRowIsTheCapsules() {
        compose.setContent {
            Box(Modifier.width(680.dp).testTag("column")) {
                EndBeside(
                    main = { Box(Modifier.size(width = 420.dp, height = 40.dp).testTag("capsule")) },
                    end = { BookmarkButton(saved = false, glyphEnd = BylineGlyphEnd) {} },
                    modifier = Modifier.width(680.dp).testTag("row"),
                )
            }
        }
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val mark = compose.onNodeWithContentDescription("收藏").getBoundsInRoot()
        assertEquals(680f, mark.right.value, 0.5f)
        assertEquals(40f, (row.bottom - row.top).value, 0.5f)
        assertEquals((capsule.top.value + capsule.bottom.value) / 2, (mark.top.value + mark.bottom.value) / 2, 0.5f)
        assertEquals(0f, capsule.left.value, 0.5f)
    }

    @Test fun wide收藏sGlyphEndsWhereTheBylinesEllipsisDoes() {
        // The byline's ⋯ is a bare 48 with its 20 glyph centred, flush with the column's end: 14 in. 收藏 matches it
        // (the spec: share the byline's right edge), where on a phone's tags row it keeps the web's 12.
        assertEquals(14f, BylineGlyphEnd.value, 0.01f)
        compose.setContent {
            Column(Modifier.background(Color.White)) {
                Box(Modifier.testTag("wide")) { BookmarkButton(saved = false, glyphEnd = BylineGlyphEnd) {} }
                Box(Modifier.testTag("glyph")) { OrganicIcon(IconName.Bookmark, size = BookmarkGlyph, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
            }
        }
        val expected = (BylineGlyphEnd.value * density).toInt() + endGap(map("glyph"))
        val seen = endGap(map("wide"))
        assertTrue("the glyph ends $seen px in, expected $expected", abs(seen - expected) <= 1)
    }

    /** A reader's end as the page stacks it: the tags (收藏 at their end on a phone), their air, the faces' line, the capsule. */
    private fun readerEnd(width: Int, names: List<String>, twoLines: Boolean = false, wide: Boolean = false) {
        val toggle = toggle()
        compose.setContent {
            Column(Modifier.width(width.dp)) {
                StoryTagsRow(names, if (wide) null else toggle, Modifier.padding(bottom = endRowAir(reader = true).dp).testTag("tagsRow"))
                ReaderEndStack(
                    capsuleWidth = (if (wide) 420 else width).dp,
                    faces = { Box(Modifier.size(28.dp).testTag("face")) },
                    firstLine = { Box(Modifier.size((if (wide) 420 else width).dp, 48.dp).testTag("capsule")) },
                    bookmark = if (wide) ({ BookmarkButton(saved = false, glyphEnd = BylineGlyphEnd) {} }) else null,
                    secondLine = if (twoLines) ({ Box(Modifier.size(width.dp, 48.dp).testTag("second")) }) else null,
                ) { Box(Modifier.size(width.dp, 10.dp).testTag("note")) }
            }
        }
    }

    @Test fun theFacesLineStandsRightOverTheCapsuleSixteenUnderTheTags() {
        // Round 30 §S1 (「把它移到共振按鈕的上方」): tags → 16 → the faces' line (48) → 0 → the capsule — 64 from the
        // tags to the capsule, a face or none; the note's place under the capsule (it keeps its own 12 over the field).
        readerEnd(335, tags(2))
        val tagsRow = compose.onNodeWithTag("tagsRow").getBoundsInRoot()
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val face = compose.onNodeWithTag("face").getBoundsInRoot()
        val note = compose.onNodeWithTag("note").getBoundsInRoot()
        assertEquals(16f + Row2Height.value, (capsule.top - tagsRow.bottom).value, 0.5f)
        assertEquals(64f, (capsule.top - tagsRow.bottom).value, 0.5f)
        // The face centred in its 48 line, 12 in, and wholly over the capsule.
        assertEquals(capsule.top.value - Row2Height.value / 2, (face.top.value + face.bottom.value) / 2, 0.5f)
        assertEquals(12f, face.left.value, 0.5f)
        assertTrue(face.bottom.value <= capsule.top.value)
        assertEquals(capsule.bottom.value, note.top.value, 0.5f)
        // Every other end keeps the 40 under the tags.
        assertEquals(40f, endRowAir(reader = false), 0f)
    }

    @Test fun noTagsTheFacesLineStartsSixteenUnderTheStory() {
        // Wide, no tags: the tags' row is empty, and the end row starts its 16 under what stood above it.
        readerEnd(680, emptyList(), wide = true)
        val tagsRow = compose.onNodeWithTag("tagsRow").getBoundsInRoot()
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        // (The tag is inside the row's padding: the tags' own bounds, empty here.)
        assertEquals(0f, (tagsRow.bottom - tagsRow.top).value, 0.5f)
        assertEquals(tagsRow.bottom.value + 16f + Row2Height.value, capsule.top.value, 0.5f)
    }

    @Test fun onTwoLinesTheFacesStandOverTheFirstAndTheNoteUnderTheSecond() {
        readerEnd(300, tags(1), twoLines = true)
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val second = compose.onNodeWithTag("second").getBoundsInRoot()
        val face = compose.onNodeWithTag("face").getBoundsInRoot()
        val note = compose.onNodeWithTag("note").getBoundsInRoot()
        assertTrue(face.bottom.value <= capsule.top.value)
        assertEquals(EndRowLayout.LINE_GAP, (second.top - capsule.bottom).value, 0.5f)
        assertEquals(second.bottom.value, note.top.value, 0.5f)
    }

    @Test fun wide收藏StaysCentredOnTheCapsulesLineNotTheFaces() {
        // Round 28's place, unchanged (§S1): at the column's end, centred on the capsule; nothing ends the faces' line.
        readerEnd(680, tags(2), wide = true)
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        val mark = compose.onNodeWithContentDescription("收藏").getBoundsInRoot()
        assertEquals(680f, mark.right.value, 0.5f)
        assertEquals((capsule.top.value + capsule.bottom.value) / 2, (mark.top.value + mark.bottom.value) / 2, 0.5f)
    }
}
