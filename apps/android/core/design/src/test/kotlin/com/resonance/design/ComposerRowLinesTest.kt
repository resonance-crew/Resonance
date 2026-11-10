package com.resonance.design

import android.content.Context
import android.content.res.Configuration
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * A riding row's two lines (round 24, the owner: 「回覆的內容…上面都會有回覆誰嘛，然後下面是內容，這兩個文字之間的間距好像要縮小
 * 一點點…這兩個項目加起來的高度有一點太高了」): the label over the detail a line of 1.2 apart — never the CJK font's own
 * 1.45, which a single line otherwise keeps — the pair fitting the 44 row at the owner's text size 1.5, the row growing
 * past that rather than clipping. Drawn with the real fonts (native graphics), at the owner's display size (500 dpi).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "500dpi")
class ComposerRowLinesTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    private fun layoutOf(text: String): TextLayoutResult {
        val results = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(text).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!.invoke(results)
        return results.single()
    }

    /**
     * The density a window gets at text size [fontScale]: `Density(context)`, as `AndroidComposeView`'s own, so sp go
     * through Android's non-linear text scaling (Compose's tables, the platform's on Android 14 and later) — at 1.5,
     * 12 sp is 18 dp and 12.5 sp is 19 dp, not 18.75.
     */
    private fun densityAt(context: Context, fontScale: Float): Density =
        Density(context.createConfigurationContext(Configuration(context.resources.configuration).apply { this.fontScale = fontScale }))

    @Test fun theLabelAndItsDetailSitALineOf12ApartAndALargeTextSizeGrowsTheRowRatherThanClippingIt() {
        val scale = mutableFloatStateOf(1f)
        var density = 1f
        var scaled: Density = Density(1f)
        compose.setContent {
            density = LocalDensity.current.density
            val context = LocalContext.current
            val fontScale = scale.floatValue
            scaled = remember(fontScale) { densityAt(context, fontScale) }
            CompositionLocalProvider(LocalDensity provides scaled) {
                Box(Modifier.width(360.dp)) {
                    ComposerRow("回覆 阿澄", "我知道了 ok", "取消回覆", {}, Modifier.testTag("row")) { ComposerReplyMark() }
                }
            }
        }
        /** [sp] at the text size in use, in dp. */
        fun dpOf(sp: Float): Float = with(scaled) { sp.sp.toDp().value }
        fun check(height: Float) {
            compose.waitForIdle()
            val row = compose.onNodeWithTag("row").getBoundsInRoot()
            val labelBox = compose.onNodeWithText("回覆 阿澄").getBoundsInRoot()
            val detailBox = compose.onNodeWithText("我知道了 ok").getBoundsInRoot()
            val label = layoutOf("回覆 阿澄")
            val detail = layoutOf("我知道了 ok")
            // (Within a pixel: boxes are whole pixels.)
            assertEquals("the row at ${scale.floatValue}", height, (row.bottom - row.top).value, 1f)
            // Baseline to baseline: the detail's line of 1.2 (a little more where its words sit low in it), not the font's 1.45.
            val pitch = (detailBox.top.value + detail.firstBaseline / density) - (labelBox.top.value + label.firstBaseline / density)
            val size = dpOf(12.5f)
            assertTrue("the lines $pitch apart at ${scale.floatValue} (${size})", pitch <= size * 1.32f && pitch >= size * 1.1f)
            // Each text whole in its own box: nothing clipped.
            assertFalse(label.didOverflowHeight)
            assertFalse(detail.didOverflowHeight)
            // The two lines' boxes (1.2 each) in the middle of the row.
            val lines = dpOf(12f) * ComposerRowLine + dpOf(12.5f) * ComposerRowLine
            val linesTop = labelBox.top.value + (labelBox.bottom - labelBox.top).value / 2 - dpOf(12f) * ComposerRowLine / 2
            assertEquals(row.top.value + ((row.bottom - row.top).value - lines) / 2, linesTop, 1f)
        }
        fun pair() = dpOf(12f) * ComposerRowLine + dpOf(12.5f) * ComposerRowLine
        compose.waitForIdle()
        // The owner's display size, and the window's own density.
        assertEquals(3.125f, density, 0.001f)
        assertEquals(density, scaled.density, 0.001f)
        check(ComposerRowHeight.value)
        assertTrue(pair() < ComposerRowHeight.value - 12f)
        // The owner's 1.5, scaled as the phone does (18 + 19 dp, not 18 + 18.75): the pair 44.4, the row's 44 and that
        // fraction of a dp more (one pixel at 500 dpi) rather than clipping it.
        scale.floatValue = 1.5f
        compose.waitForIdle()
        assertEquals(18f, dpOf(12f), 0.01f)
        assertEquals(19f, dpOf(12.5f), 0.01f)
        check(maxOf(ComposerRowHeight.value, pair()))
        assertTrue("the pair ${pair()} at 1.5", pair() <= ComposerRowHeight.value + 1f)
        // Larger still (24 + 24.5 dp at 2): the row grows to hold them.
        scale.floatValue = 2f
        compose.waitForIdle()
        assertEquals(24.5f, dpOf(12.5f), 0.01f)
        assertTrue(pair() > ComposerRowHeight.value)
        check(pair())
    }
}
