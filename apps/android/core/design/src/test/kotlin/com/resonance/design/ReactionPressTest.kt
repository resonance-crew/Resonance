package com.resonance.design

import android.provider.Settings
import androidx.compose.animation.core.Spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.ReactionId
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * The reaction tray's stickers grow under the finger as Instagram's do (round 17, the owner: 「被点击或是 hover 的时候，
 * 它是变大的」): the one pressed to 1.45× and 6 up on a soft spring, back as it is let go or the finger slides off it,
 * the chosen disc staying as it is — and, with animations off, no growth (a press dips it, as before). Read off the
 * screen: the ink of the pressed sticker, measured against itself at rest.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReactionPressTest {
    private companion object {
        const val REMOVE = "remove"
    }

    @get:Rule val compose = createComposeRule()

    private val one = Density(1f, 1f)
    private val resolver get() = RuntimeEnvironment.getApplication().contentResolver

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    @After fun animationsBack() {
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    }

    @Test fun theGrowthIsInstagramsSoftSpringToOneAndAHalfAndALittleUp() {
        assertEquals(1.45f, ReactionPressScale, 0f)
        assertEquals(6.dp, ReactionPressRise)
        assertEquals(0.6f, ReactionPressSpring.dampingRatio, 0f)
        assertEquals(Spring.StiffnessMediumLow, ReactionPressSpring.stiffness, 0f)
        assertEquals(1f, reactionPressScale(0f), 0f)
        assertEquals(1.45f, reactionPressScale(1f), 0.0001f)
        // Past it for a moment on the spring's swing, as a spring does.
        assertTrue(reactionPressScale(1.1f) > 1.45f)
        // With animations off it never grows: a press dips it, as it always did.
        assertEquals(0.9f, reactionPressScale(1f, dipped = true), 0f)
    }

    @Test fun theStickerUnderTheFingerGrowsAndRisesThenSettlesWhenTheFingerSlidesOff() {
        tray(chosen = null)
        val rest = ink("laugh")
        val neighbour = ink("hug")
        compose.onNodeWithContentDescription("laugh").performTouchInput { down(center) }
        compose.waitForIdle()
        val grown = ink("laugh")
        // 1.45× as big (the sticker's own ink, whatever its drawing), about the middle of its 32 box, and 6 higher.
        near(rest.height * 1.45f, grown.height, 2f, "the pressed sticker's height")
        near(rest.width * 1.45f, grown.width, 2f, "the pressed sticker's width")
        val box = middleOf("laugh")
        near(box + (rest.middle - box) * 1.45f - 6f, grown.middle, 1.5f, "the pressed sticker's middle")
        // Only the one under the finger.
        assertEquals(neighbour, ink("hug"))
        // The finger slides off it: the press is let go without a choice, and the sticker settles back.
        compose.onNodeWithContentDescription("laugh").performTouchInput { moveTo(Offset(center.x, -200f)) }
        compose.waitForIdle()
        assertEquals(rest, ink("laugh"))
        compose.onNodeWithContentDescription("laugh").performTouchInput { up() }
        compose.waitForIdle()
        assertEquals(emptyList<ReactionId>(), chosen)
    }

    @Test fun slidingAcrossHandsTheGrowthOnAndLiftingChoosesTheOneUnderTheFinger() {
        tray(chosen = null)
        // At rest a sticker's ink lies within 18 of its middle (a grown neighbour's starts 21 out).
        val laugh = ink("laugh", half = 18f)
        val hug = ink("hug")
        compose.onNodeWithContentDescription("laugh").performTouchInput { down(center) }
        compose.waitForIdle()
        assertTrue("the first sticker under the finger grew", ink("laugh").height > laugh.height * 1.35f)
        // On to the next one: it grows, the one left behind settles, and nothing is chosen on the way.
        val to = compose.onNodeWithContentDescription("hug").getBoundsInRoot()
        val from = compose.onNodeWithContentDescription("laugh").getBoundsInRoot()
        compose.onNodeWithContentDescription("laugh").performTouchInput {
            moveTo(Offset(center.x + (to.left - from.left).value, center.y))
        }
        compose.waitForIdle()
        assertEquals(laugh, ink("laugh", half = 18f))
        assertTrue("the sticker now under the finger grew", ink("hug").height > hug.height * 1.35f)
        assertEquals(emptyList<ReactionId>(), chosen)
        compose.onNodeWithContentDescription("laugh").performTouchInput { up() }
        compose.waitForIdle()
        // Lifted over it: that one is chosen, once.
        assertEquals(listOf(ReactionId.Hug), chosen)
        assertEquals(hug, ink("hug"))
    }

    @Test fun whichStickerAPointIsOver() {
        // 6 of padding, then cells of 44: the padding counts for the cell beside it; off the tray, none.
        assertEquals(ReactionId.Heart, trayCellAt(2f, 26f))
        assertEquals(ReactionId.Heart, trayCellAt(49f, 26f))
        assertEquals(ReactionId.Moved, trayCellAt(51f, 26f))
        assertEquals(ReactionId.Laugh, trayCellAt(116f, 1f))
        assertEquals(ReactionId.Thumbs, trayCellAt(230f, 50f))
        assertEquals(null, trayCellAt(116f, -1f))
        assertEquals(ReactionId.Laugh, trayCellAt(116f, 55f))
        assertEquals(null, trayCellAt(116f, 57f))
        assertEquals(null, trayCellAt(-1f, 26f))
        assertEquals(null, trayCellAt(233f, 26f))
    }

    @Test fun eachStickerStaysANamedButtonForTalkBackTheChosenOneSelected() {
        tray(chosen = ReactionId.Heart)
        compose.onNodeWithContentDescription(REMOVE)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertIsSelected()
        compose.onNodeWithContentDescription("moved")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
            .assertIsNotSelected()
            .performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()
        assertEquals(listOf(ReactionId.Moved), chosen)
    }

    @Test fun letGoItIsChosenAndSettles() {
        tray(chosen = null)
        val rest = ink("thumbs")
        compose.onNodeWithContentDescription("thumbs").performTouchInput {
            down(center)
            up()
        }
        compose.waitForIdle()
        assertEquals(listOf(ReactionId.Thumbs), chosen)
        assertEquals(rest, ink("thumbs"))
    }

    @Test fun theChosenDiscStaysAsItIsWhileItsStickerGrows() {
        tray(chosen = ReactionId.Heart)
        val cell = compose.onNodeWithContentDescription(REMOVE).getBoundsInRoot()
        val before = compose.onRoot().captureToImage().toPixelMap()
        compose.onNodeWithContentDescription(REMOVE).performTouchInput { down(center) }
        compose.waitForIdle()
        assertTrue("the chosen sticker grew", ink(REMOVE).height > ink(REMOVE, before).height * 1.35f)
        val after = compose.onRoot().captureToImage().toPixelMap()
        val disc = discColour(before, cell)!!
        // Wherever neither drawing has the sticker's ink, the disc is where it was: none of it gone to the page, none
        // of the page turned to disc (a disc that grew, shrank or rose would do one or the other).
        var checked = 0
        for (y in cell.top.value.toInt() until cell.bottom.value.toInt()) for (x in cell.left.value.toInt() until cell.right.value.toInt()) {
            val a = before[x, y]
            val b = after[x, y]
            if (same(a, disc) && isPage(b)) error("the disc left ($x, $y)")
            if (isPage(a) && same(b, disc)) error("the disc spread to ($x, $y)")
            if (same(a, disc) && same(b, disc)) checked++
        }
        assertTrue("some of the disc still shows beside the sticker ($checked)", checked > 40)
        compose.onNodeWithContentDescription(REMOVE).performTouchInput { moveTo(Offset(center.x, -200f)); up() }
    }

    @Test fun withAnimationsOffNothingGrows() {
        Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
        tray(chosen = null)
        val rest = ink("laugh")
        compose.onNodeWithContentDescription("laugh").performTouchInput { down(center) }
        compose.waitForIdle()
        val pressed = ink("laugh")
        // A dip, as a press always gave, never a growth or a rise.
        assertTrue("no growth: ${pressed.height} against ${rest.height}", pressed.height < rest.height)
        val box = middleOf("laugh")
        near(box + (rest.middle - box) * 0.9f, pressed.middle, 1.5f, "the pressed sticker's middle")
        compose.onNodeWithContentDescription("laugh").performTouchInput { moveTo(Offset(center.x, -200f)); up() }
    }

    // The tray on a white page of its own, with room over it for a sticker that rises.

    private val chosen = mutableListOf<ReactionId>()

    private fun tray(chosen: ReactionId?) {
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides one) {
                Box(Modifier.background(Color.White).padding(start = 40.dp, top = 60.dp, end = 40.dp, bottom = 40.dp)) {
                    ReactionTray(
                        chosen,
                        label = { it.name.lowercase() },
                        removeLabel = REMOVE,
                        groupLabel = "reactions",
                        onChoose = { this@ReactionPressTest.chosen += it },
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private data class Ink(val left: Int, val top: Int, val right: Int, val bottom: Int) {
        val width get() = (right - left + 1).toFloat()
        val height get() = (bottom - top + 1).toFloat()
        val middle get() = (top + bottom) / 2f
    }

    /**
     * A sticker's ink, found by its cell's name: every pixel within [half] of its cell's middle (26: a grown sticker's
     * half is 23, its neighbours' ink at rest starts 28 out) that is neither the page nor its cell's disc.
     */
    private fun ink(name: String, map: PixelMap = compose.onRoot().captureToImage().toPixelMap(), half: Float = 26f): Ink {
        val c = compose.onNodeWithContentDescription(name).getBoundsInRoot()
        val disc = discColour(map, c)
        val mid = (c.left.value + c.right.value) / 2f
        var l = Int.MAX_VALUE; var t = Int.MAX_VALUE; var r = -1; var b = -1
        for (y in 0 until map.height) for (x in (mid - half).toInt()..(mid + half).toInt()) {
            val p = map[x, y]
            // Ink, not the page or the disc: clearly coloured (an edge's faintest pixels left out, so a size reads true).
            if (3f - p.red - p.green - p.blue < 0.6f || (disc != null && near(p, disc))) continue
            if (x < l) l = x
            if (x > r) r = x
            if (y < t) t = y
            if (y > b) b = y
        }
        return Ink(l, t, r, b)
    }

    /** The disc's colour, when the cell has one: what lies 4 in from the cell's start on its middle line. */
    private fun discColour(map: PixelMap, c: DpRect): Color? {
        val p = map[(c.left.value + 4f).toInt(), ((c.top.value + c.bottom.value) / 2f).toInt()]
        return if (isPage(p)) null else p
    }

    private fun isPage(p: Color) = p.red > 0.98f && p.green > 0.98f && p.blue > 0.98f

    /** The middle line of a cell, found by its name: its sticker's 32 box is centred on it. */
    private fun middleOf(name: String): Float = compose.onNodeWithContentDescription(name).getBoundsInRoot().let { (it.top.value + it.bottom.value) / 2f }

    private fun near(a: Color, b: Color) = abs(a.red - b.red) < 0.08f && abs(a.green - b.green) < 0.08f && abs(a.blue - b.blue) < 0.08f

    private fun same(a: Color, b: Color) = abs(a.red - b.red) < 0.01f && abs(a.green - b.green) < 0.01f && abs(a.blue - b.blue) < 0.01f

    private fun near(expected: Float, actual: Float, within: Float, what: String) =
        assertTrue("$what: expected $expected, was $actual", abs(expected - actual) <= within)
}
