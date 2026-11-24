package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.WindowLayout
import com.resonance.design.scrollFadeBelowSpan
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
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
 * Round 34 (the owner: 「略過/關閉」不需要滚动时恢复原本实色 footer，需要滚动时用浮动 tonal 药丸 + 贴边渐变；判定首次渲染就稳定 …
 * 两种状态按钮相对纸张右下角位置完全一致): the family's foot in its two states — content that fits its cap is the classic
 * footer (no fade, the pill 18 under the content), content taller scrolls down to the paper's border with the pill
 * floating over its fade — the pill 24 above the paper's bottom and 24 in from its right in both, and the state the
 * first frame's: the paper's height never changes after it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w390dp-h844dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TapListFootTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    private val cap = 400.dp
    private val row = 60.dp
    private val paperMatcher = SemanticsMatcher.keyIsDefined(SemanticsProperties.PaneTitle)

    private lateinit var scroll: ScrollState
    private lateinit var rows: MutableState<Int>

    private fun show(n: Int) {
        scroll = ScrollState(0)
        rows = mutableStateOf(n)
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
                TapListModal(
                    onDismiss = {}, title = "t", seed = 41.0, exit = "關閉", maxWidth = 400.dp, cap = cap, scroll = scroll,
                    exitModifier = Modifier.testTag("exit"), regionModifier = Modifier.testTag("region"),
                ) {
                    repeat(rows.value) { Box(Modifier.fillMaxWidth().height(row).testTag("row-$it")) }
                }
            }
        }
    }

    private fun bounds(tag: String): DpRect = compose.onNodeWithTag(tag, useUnmergedTree = true).getBoundsInRoot()
    private fun paper(): DpRect = compose.onNode(paperMatcher, useUnmergedTree = true).getBoundsInRoot()
    private fun paperHeightOrNull(): Dp? = runCatching { paper() }.getOrNull()?.let { it.bottom - it.top }

    /** The pill's offset from the paper's bottom-right corner: (right, bottom). */
    private fun pillOffset(): Pair<Float, Float> {
        val p = paper()
        val e = bounds("exit")
        return (p.right - e.right).value to (p.bottom - e.bottom).value
    }

    @Test fun contentThatFitsIsTheClassicFooterNoFadeThePillUnderTheContent() {
        show(3)
        compose.waitForIdle()
        assertEquals("nothing to scroll: no fade", 0, scroll.maxValue)
        val p = paper()
        val region = bounds("region")
        val last = bounds("row-2")
        val exit = bounds("exit")
        // The content, 18, the pill (44), the paper's 24.
        assertEquals(18f, (exit.top - last.bottom).value, 1f)
        assertEquals(44f, (exit.bottom - exit.top).value, 0.5f)
        assertEquals(24f, (p.bottom - exit.bottom).value, 1f)
        assertEquals(24f, (p.right - exit.right).value, 1f)
        // Nothing over the content; the dialog as tall as its rows and that foot.
        assertTrue(exit.top >= last.bottom)
        assertEquals(p.bottom.value, region.bottom.value, 1f)
        assertEquals((3 * row.value) + FloatingExitRoom.value, (region.bottom - region.top).value, 1f)
        // The constants the spec names: 24 + 44 + 18.
        assertEquals(24f, FloatingExitBottom.value)
        assertEquals(44f, FloatingExitHeight.value)
        assertEquals(18f, FloatingExitGap.value)
        assertEquals(86f, FloatingExitRoom.value)
    }

    @Test fun contentTallerScrollsToTheBorderThePillFloatsAndTheEndKeepsItsRoom() {
        show(10)
        compose.waitForIdle()
        assertTrue("it scrolls", scroll.maxValue > 0)
        val p = paper()
        val region = bounds("region")
        // The region is the cap and runs to the paper's bottom edge — no padding under it.
        assertEquals(cap.value, (region.bottom - region.top).value, 1f)
        assertEquals(p.bottom.value, region.bottom.value, 1f)
        // The fade's opaque end on the region's bottom edge, i.e. the paper's border.
        val h = region.bottom.value - region.top.value
        val (start, end) = scrollFadeBelowSpan(h, 18f, (FloatingExitBottom + FloatingExitHeight).value)
        assertEquals(h, end, 0f)
        assertEquals(h - 18f - 68f, start, 0f)
        // The pill over the region, at the footer's coordinates.
        val exit = bounds("exit")
        assertTrue(exit.top >= region.top && exit.bottom <= region.bottom)
        assertEquals(24f, (p.bottom - exit.bottom).value, 1f)
        assertEquals(24f, (p.right - exit.right).value, 1f)
        // Scrolled to the end, the last row stands 18 over the pill, the list's end keeping 24 + 44 + 18.
        runBlocking { scroll.scrollTo(scroll.maxValue) }
        compose.waitForIdle()
        val last = bounds("row-9")
        assertEquals(FloatingExitRoom.value, (region.bottom - last.bottom).value, 1f)
        assertEquals(18f, (bounds("exit").top - last.bottom).value, 1f)
    }

    @Test fun thePillsOffsetFromThePapersCornerIsTheSameInBothStates() {
        show(3)
        compose.waitForIdle()
        val footer = pillOffset()
        compose.runOnIdle { rows.value = 10 }
        compose.waitForIdle()
        assertTrue(scroll.maxValue > 0)
        val floating = pillOffset()
        assertEquals(footer.first, floating.first, 0.5f)
        assertEquals(footer.second, floating.second, 0.5f)
        assertEquals(24f, footer.first, 1f)
        assertEquals(24f, footer.second, 1f)
    }

    /** Every height the paper takes over [frames] frames from the first it is drawn. */
    private fun heightsFromFirstFrame(n: Int, frames: Int = 30): List<Float> {
        compose.mainClock.autoAdvance = false
        show(n)
        val seen = mutableListOf<Float>()
        repeat(frames) {
            compose.mainClock.advanceTimeByFrame()
            paperHeightOrNull()?.let { if (seen.lastOrNull() != it.value) seen += it.value }
        }
        return seen
    }

    @Test fun theFooterIsDecidedOnTheFirstMeasure() {
        val seen = heightsFromFirstFrame(3)
        assertEquals("one height from the first frame ($seen)", 1, seen.size)
    }

    @Test fun floatingIsDecidedOnTheFirstMeasure() {
        val seen = heightsFromFirstFrame(10)
        assertEquals("one height from the first frame ($seen)", 1, seen.size)
        assertEquals(cap.value + TapListInset.value, seen.single(), 1.5f)
    }

    @Test fun contentGrowingPastTheCapOnlyGrowsTheDialog() {
        show(4)
        compose.waitForIdle()
        val before = paperHeightOrNull()!!.value
        compose.runOnIdle { rows.value = 9 }
        compose.waitForIdle()
        val after = paperHeightOrNull()!!.value
        assertTrue("$before → $after", after >= before)
        assertTrue(scroll.maxValue > 0)
    }


    // Round 34 (the owner, on the iPad: 名单弹窗里面的字体太小…没有适配平板阅读字级): a tablet reads one step up, a phone keeps its own.

    @Test fun aPhoneKeepsItsSizesATabletReadsOneStepUp() {
        assertEquals(TapListText(title = 20f, handle = 15f, line = 13f, sentence = 16f), tapListText(LayoutClass.Compact))
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            assertEquals(TapListText(title = 22f, handle = 17f, line = 15f, sentence = 18f), tapListText(cls))
            assertEquals(17f, TapRowMeasure.dialog(cls).handle)
            assertEquals(15f, TapRowMeasure.dialog(cls).line)
        }
        assertEquals(15f, TapRowMeasure.dialog(LayoutClass.Compact).handle)
        assertEquals(13f, TapRowMeasure.dialog(LayoutClass.Compact).line)
    }

    /** The drawn font size (sp) of the family's title in a window [width] wide. */
    private fun titleSize(width: Dp): Float {
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(width)) {
                TapListModal(onDismiss = {}, title = "t", seed = 41.0, exit = "關閉", maxWidth = 480.dp) { TapListTitle("與這張卡片共振的人") }
            }
        }
        compose.waitForIdle()
        val node = compose.onNodeWithText("與這張卡片共振的人", useUnmergedTree = true).fetchSemanticsNode()
        val results = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        node.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action?.invoke(results)
        return results.single().layoutInput.style.fontSize.value
    }

    @Test fun thePhonesTitleIs20() = assertEquals(20f, titleSize(390.dp), 0f)

    @Test @Config(qualifiers = "w1280dp-h800dp-mdpi")
    fun theTabletsTitleIs22() = assertEquals(22f, titleSize(1280.dp), 0f)
}
