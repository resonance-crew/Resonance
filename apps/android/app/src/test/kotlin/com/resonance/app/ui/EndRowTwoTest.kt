package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.AvatarGroup
import com.resonance.design.Grain
import com.resonance.design.OrganicIcon
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.segmentCentre
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
 * Row 2 under the capsule and the note field's envelope (round 26 §U1.2, the note in place item 2) as their twins draw
 * them — the web's, where iOS differs (the screens' review: Android's stood apart from both). 收藏 a bare glyph in the
 * muted text ink with the one pen, its glyph 12 in from the row's end in its 48 box (the web's 44 button, centred, on
 * the row's end); the faces centred on the 共振 segment's centre (round 29 §S11); the envelope muted at 18. Drawn for real and
 * measured pixel by pixel.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "xxhdpi")
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
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
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

    @Test fun theFacesStandCentredOnTheCentreGivenOneTwoOrThreeAndTheEndIsTheRowsEnd() {
        // Round 29 §S11: the group's centre on the 共振 segment's — one face, two, three (the stack's widths) alike.
        var count by mutableStateOf(1)
        compose.setContent {
            Box(Modifier.width(320.dp).testTag("column")) {
                EndRowTwo(Modifier.width(320.dp), facesCentre = 70.dp, faces = { Box(Modifier.size(AvatarGroup.width(count, TapFaceSize), 28.dp).testTag("face")) }) {
                    Box(Modifier.size(48.dp).testTag("end"))
                }
            }
        }
        for (faces in 1..3) {
            count = faces
            compose.waitForIdle()
            val row = compose.onNodeWithTag("column").getBoundsInRoot()
            val face = compose.onNodeWithTag("face").getBoundsInRoot()
            val end = compose.onNodeWithTag("end").getBoundsInRoot()
            // Not 12 in from the row's start (the leading edge it stood on): centred on 70.
            assertEquals("$faces faces", 70f, ((face.left + face.right) / 2 - row.left).value, 0.5f)
            // Centred in the row's 48 too; 收藏's 48 on the row's end.
            assertEquals(((row.top + row.bottom) / 2).value, ((face.top + face.bottom) / 2).value, 0.5f)
            assertEquals(row.right.value, end.right.value, 0.5f)
            assertEquals(Row2Height.value, (row.bottom - row.top).value, 0.5f)
        }
    }

    @Test fun aGroupWiderThanTwiceTheCentreStopsAtTheRowsStart() {
        compose.setContent {
            Box(Modifier.width(320.dp).testTag("column")) {
                EndRowTwo(Modifier.width(320.dp), facesCentre = 20.dp, faces = { Box(Modifier.size(64.dp, 28.dp).testTag("face")) }) {
                    Box(Modifier.size(48.dp))
                }
            }
        }
        val row = compose.onNodeWithTag("column").getBoundsInRoot()
        assertEquals(row.left.value, compose.onNodeWithTag("face").getBoundsInRoot().left.value, 0.5f)
    }

    @Test fun theCentreIsTheTapSegmentsAsTheCapsuleDrawsIt() {
        // The capsule's three segments as a phone's 300 draws them, and the two-line form's 共振 alone: the faces under
        // the 共振 segment's own centre, not the capsule's.
        val forms = listOf(
            listOf(Segment("tap", "共振", IconName.Wave) { }, Segment("note", "寄小紙條", IconName.Note) { }, Segment("reply", "寫卡片", IconName.Pen) { }),
            listOf(Segment("tap", "共振", IconName.Wave) { }),
        )
        var shown by mutableStateOf(forms[0])
        compose.setContent {
            Column(Modifier.width(300.dp)) {
                SegmentedActionBar(shown, Modifier.width(300.dp))
                EndRowTwo(Modifier.width(300.dp), facesCentre = segmentCentre(shown, 300.dp), faces = { Box(Modifier.size(AvatarGroup.width(3, TapFaceSize), 28.dp).testTag("face")) }) { }
            }
        }
        for (segments in forms) {
            shown = segments
            compose.waitForIdle()
            val seg = compose.onNode(hasClickAction() and hasText("共振")).getBoundsInRoot()
            val face = compose.onNodeWithTag("face").getBoundsInRoot()
            assertEquals("${segments.size} segments", ((seg.left + seg.right) / 2).value, ((face.left + face.right) / 2).value, 1f)
        }
    }

    @Test fun theNotesEnvelopeIsMutedAtEighteen() {
        var muted = Color.Unspecified
        compose.setContent {
            muted = Tokens.TextMuted
            Box(Modifier.background(Color.White).testTag("lead")) { NoteLeadGlyph() }
        }
        val lead = map("lead")
        assertEquals((18 * density).toInt(), lead.width)
        assertTrue("the envelope is drawn in the muted text ink", near(ink(lead), muted))
    }
}
