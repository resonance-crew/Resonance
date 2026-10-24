package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * The chat composer's capsule (round 9 §4): one line is exactly 48 tall at every text size up to the
 * interface's 1.25 cap — its padding worked out from the line's real height — and only more lines make
 * it taller; Send is its end segment, named, and disabled (not faded) with nothing to send.
 */
@RunWith(RobolectricTestRunner::class)
class ComposerCapsuleTest {
    @get:Rule val compose = createComposeRule()

    private val style by lazy { AppFonts.body(16f, lineHeight = 1.5f) }

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    /** The text scale in force (what CappedTextScale hands down), on the screen's own density. */
    private var scale by mutableFloatStateOf(1f)

    private fun capsule(lines: Int = 1, canSend: Boolean = false) = compose.setContent {
        val screen = LocalDensity.current.density
        CompositionLocalProvider(LocalDensity provides Density(screen, scale)) {
            Box(Modifier.width(360.dp)) {
                ComposerCapsule(
                    canSend = canSend, sendLabel = "傳送", onSend = {}, focused = { false }, textStyle = style,
                    modifier = Modifier.testTag("capsule"),
                    leading = {},
                ) { vertical ->
                    BasicText("字\n".repeat(lines).trimEnd(), style = style, minLines = lines, modifier = Modifier.fillMaxWidth().padding(vertical = vertical))
                }
            }
        }
    }

    private fun height(): Float = compose.onNodeWithTag("capsule").getBoundsInRoot().let { (it.bottom - it.top).value }

    @Test fun oneLineIs48AtEveryTextSizeUpToTheCap() {
        capsule()
        for (s in listOf(0.85f, 1f, textScale(1.3f), textScale(2f))) {
            scale = s
            compose.waitForIdle()
            assertEquals("text scale $s", ComposerHeight.value, height(), 1f)
        }
    }

    @Test fun onlyMoreLinesMakeItTaller() {
        scale = textScale(2f)
        capsule(lines = 3)
        assertTrue(height() > ComposerHeight.value + 40f)
    }

    @Test fun thePaddingCentresTheLineAndNeverGoesNegative() {
        assertEquals(12f, composerPadding(24.dp).value, 1e-4f)
        assertEquals(9f, composerPadding(30.dp).value, 1e-4f)
        assertEquals(0f, composerPadding(60.dp).value, 1e-4f)
    }

    @Test fun sendIsDisabledNotFadedWithNothingToSend() {
        capsule(canSend = false)
        compose.onNodeWithContentDescription("傳送").assertIsNotEnabled()
    }

    @Test fun sendTakesATapWithSomethingToSend() {
        capsule(canSend = true)
        compose.onNodeWithContentDescription("傳送").assertIsEnabled()
    }
}
