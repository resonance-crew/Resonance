package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
import java.io.File

/**
 * The attach panel's 圖片 before the phone's pictures may be read (round 24, the owner's Pixel — display size 500, text
 * 1.5, photos not granted: 「這個按鈕提醒權限的按鈕是顯示不出來的」): its 「允許存取」 is whole and can be reached at any display
 * and text size — the glyph left out when the three don't fit, the prompt scrolling in the panel past that — and never
 * squeezed into what is left. At the owner's display size (500 dpi).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "500dpi")
class GalleryPromptTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                AppFonts.init(app)
                Grain.init(app)
                Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
                val language = Strings.language
                Strings.language = Strings.Language.ZhTW
                try {
                    base.evaluate()
                } finally {
                    Strings.language = language
                }
            }
        }
    }.around(compose)

    /**
     * The density a window gets at text size [fontScale]: `Density(context)`, as `AndroidComposeView`'s own, so sp go
     * through Android's non-linear text scaling (Compose's tables, the platform's on Android 14 and later: the prompt's
     * 14 sp is 22 dp at 1.5, not 21).
     */
    private fun densityAt(context: Context, fontScale: Float): Density =
        Density(context.createConfigurationContext(Configuration(context.resources.configuration).apply { this.fontScale = fontScale }))

    /** The prompt in a panel [height] tall, the floating 圖片｜卡片 and the navigation bar's [bottom] at its foot, text at [fontScale]. */
    private fun prompt(height: Dp, bottom: Dp, fontScale: Float, onAction: () -> Unit = {}) {
        compose.setContent {
            val context = LocalContext.current
            val scaled = remember(fontScale) { densityAt(context, fontScale) }
            CompositionLocalProvider(LocalDensity provides scaled) {
                Box(Modifier.size(345.dp, height).testTag("panel")) {
                    GalleryPrompt(forever = false, onAction = onAction, bottom = bottom)
                }
            }
        }
    }

    private val density: Float get() = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    /** [what]'s bounds in the panel, shown as it is laid out (nothing scrolled). */
    private fun shown(what: String) = compose.onNodeWithText(what).assertIsDisplayed().getBoundsInRoot()

    @Test fun onTheOwnersPhoneTheLineAndTheButtonStandWholeWithNoScrolling() {
        var taps = 0
        // Display size 500, text 1.5 — scaled as the phone does it: the words' 14 sp are 22 dp, not 21.
        assertEquals(3.125f, density, 0.001f)
        assertEquals(22f, with(densityAt(RuntimeEnvironment.getApplication(), 1.5f)) { 14.sp.toDp().value }, 0.01f)
        // A keyboard's ~280 less the grip's 28; the bar's 60 and the gesture bar's 15 at its foot.
        prompt(height = 252.dp, bottom = 75.dp, fontScale = 1.5f) { taps++ }
        val panel = compose.onNodeWithTag("panel").getBoundsInRoot()
        val words = shown(L10n.Messages.galleryPrimer)
        val button = shown(L10n.Messages.galleryAllow)
        // The line whole (no glyph over it: the three would not fit), the button under it, clear of the floating bar.
        assertTrue("the line at ${words.top}", words.top >= panel.top + 12.dp)
        assertTrue("the button is ${button.bottom - button.top} tall", (button.bottom - button.top) >= 40.dp)
        assertTrue("the button at ${button.top}…${button.bottom} in ${panel.top}…${panel.bottom}", button.top > words.bottom && button.bottom <= panel.bottom - 75.dp)
        button.let { compose.onNodeWithText(L10n.Messages.galleryAllow).performClick() }
        assertEquals(1, taps)
    }

    @Test fun inLessRoomTheButtonStaysInViewAndTheLineScrollsAboveIt() {
        var taps = 0
        // Shorter still (a phone on its side, a short keyboard): the line and the button no longer fit together.
        prompt(height = 230.dp, bottom = 84.dp, fontScale = 1.5f) { taps++ }
        val panel = compose.onNodeWithTag("panel").getBoundsInRoot()
        // As it is laid out, nothing scrolled: the button whole, above the floating bar.
        val button = shown(L10n.Messages.galleryAllow)
        assertTrue("the button is ${button.bottom - button.top} tall", (button.bottom - button.top) >= 40.dp)
        assertTrue("the button at ${button.top}…${button.bottom} in ${panel.top}…${panel.bottom}", button.top >= panel.top && button.bottom <= panel.bottom - 84.dp)
        compose.onNodeWithText(L10n.Messages.galleryAllow).performClick()
        assertEquals(1, taps)
        // The line above it, cut to what is left (a line at least: its box shows less than its words), read by scrolling
        // it; the button stays where it was.
        val line = compose.onNodeWithText(L10n.Messages.galleryPrimer)
        val words = line.fetchSemanticsNode()
        assertTrue("the line shows ${words.boundsInRoot.height} of ${words.size.height}", words.boundsInRoot.height >= 20.dp.value * density - 1 && words.size.height > words.boundsInRoot.height + 1)
        assertTrue(words.boundsInRoot.bottom <= button.top.value * density)
        val before = words.positionInRoot.y
        line.performTouchInput { swipeUp() }
        compose.waitForIdle()
        assertTrue("the line scrolled", line.fetchSemanticsNode().positionInRoot.y < before - 1)
        val after = shown(L10n.Messages.galleryAllow)
        assertEquals(button.top.value, after.top.value, 1f)
    }

    @Test fun withRoomThePromptStandsWholeInTheMiddleOfItsRoom() {
        prompt(height = 320.dp, bottom = 84.dp, fontScale = 1f)
        val panel = compose.onNodeWithTag("panel").getBoundsInRoot()
        val words = compose.onNodeWithText(L10n.Messages.galleryPrimer).getBoundsInRoot()
        val button = shown(L10n.Messages.galleryAllow)
        // The glyph (28) and 12 above the words: the stack's middle is the room's.
        val top = words.top - 40.dp
        val room = (panel.top + 12.dp) to (panel.bottom - 84.dp - 12.dp)
        assertEquals(((room.first + room.second) / 2).value, ((top + button.bottom) / 2).value, 1.5f)
        assertTrue(button.bottom <= panel.bottom - 84.dp)
    }

    @Test fun theButtonKeepsItsSizeAndCanBeReachedHoweverLittleRoomThereIs() {
        var taps = 0
        // Not even a line beside the button: the prompt scrolls as a whole, the button never squeezed.
        prompt(height = 120.dp, bottom = 84.dp, fontScale = 2f) { taps++ }
        val button = compose.onNodeWithText(L10n.Messages.galleryAllow).performScrollTo().assertIsDisplayed().getBoundsInRoot()
        assertTrue("the button is ${button.bottom - button.top} tall", (button.bottom - button.top) >= 40.dp)
        compose.onNodeWithText(L10n.Messages.galleryAllow).performClick()
        assertEquals(1, taps)
    }
}
