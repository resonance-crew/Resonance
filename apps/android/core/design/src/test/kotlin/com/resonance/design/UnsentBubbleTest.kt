package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * An unsent message's dashed outline (the owner's review on a Pixel 10 Pro, round 17): a bubble of its run like any
 * other (alone, every corner round alike); nothing of its pen cut at its box (the row clips as it closes over a message
 * being unsent); its dashes even all the way round, no seam.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class UnsentBubbleTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @Test fun theDashesGoRoundTheOutlineAWholeNumberOfTimes() {
        for ((w, h) in listOf(100f to 40f, 173f to 37f, 291f to 41f)) {
            val path = Path().apply { asAndroidPath().addRect(0f, 0f, w, h, android.graphics.Path.Direction.CW) }
            val dash = evenDashes(path, 4f)
            val periods = 2 * (w + h) / (2 * dash)
            assertEquals("${w}x$h", periods.roundToInt().toFloat(), periods, 1e-3f)
            // The nearest such dash to the asked 4.
            assertTrue("${w}x$h: $dash", abs(dash - 4f) <= 4f / periods.roundToInt() + 1e-3f)
        }
    }

    @Test fun theOutlineAndItsPenStayInsideTheBox() {
        val pen = 3.6f
        for (seed in listOf(7.0, 183.0, 4021.0)) for (mine in listOf(true, false)) {
            val size = Size(480f, 111f)
            val path = unsentOutline(MessageBubbleShape(seed, mine), size, pen, LayoutDirection.Ltr, Density(3f))
            val b = android.graphics.RectF().also { path.asAndroidPath().computeBounds(it, true) }
            assertEquals(pen / 2, b.left, 0.01f)
            assertEquals(pen / 2, b.top, 0.01f)
            assertEquals(size.width - pen / 2, b.right, 0.01f)
            assertEquals(size.height - pen / 2, b.bottom, 0.01f)
        }
    }

    @Test fun yourUnsentMessageIsDrawnWithinItsBoxEveryCornerRound() = unsentWithinItsBox(mine = true)

    @Test fun theirUnsentMessageIsDrawnWithinItsBoxEveryCornerRound() = unsentWithinItsBox(mine = false)

    private fun unsentWithinItsBox(mine: Boolean) {
        val three = Density(3f, 1f)
        run {
            compose.setContent {
                CompositionLocalProvider(LocalDensity provides three) {
                    Box(Modifier.background(Color.White).padding(8.dp)) {
                        Box(Modifier.testTag("unsent")) { UnsentBubble("你收回了一則訊息", mine, seed = 183.0) }
                    }
                }
            }
            compose.waitForIdle()
            val box = compose.onNodeWithTag("unsent").getBoundsInRoot()
            val pixels = compose.onRoot().captureToImage().toPixelMap()
            val (l, t, r, b) = listOf(box.left, box.top, box.right, box.bottom).map { (it.value * 3).roundToInt() }
            fun inked(x: Int, y: Int) = pixels[x, y].let { it.red < 0.97f || it.green < 0.97f || it.blue < 0.97f }
            // Nothing of the pen past the box (a row that clips as it closes cuts none of it).
            for (x in 0 until pixels.width) for (y in 0 until pixels.height) {
                if (x in l until r && y in t until b) continue
                assertFalse("mine=$mine: ink outside the box at $x, $y", inked(x, y))
            }
            // Its pen reaches the box's edge on every side: fitted, not shrunk away from it.
            assertTrue((l until r).any { x -> (t until t + 3).any { y -> inked(x, y) } })
            assertTrue((l until r).any { x -> (b - 3 until b).any { y -> inked(x, y) } })
            // Every corner round alike: none of them inked square into its corner, whichever side it is on.
            for ((cx, cy) in listOf(l to t, r - 1 to t, l to b - 1, r - 1 to b - 1)) {
                val dx = if (cx == l) 1 else -1
                val dy = if (cy == t) 1 else -1
                for (i in 0 until 6) for (j in 0 until 6) assertFalse("mine=$mine: corner $cx, $cy", inked(cx + dx * i, cy + dy * j))
            }
        }
    }
}
