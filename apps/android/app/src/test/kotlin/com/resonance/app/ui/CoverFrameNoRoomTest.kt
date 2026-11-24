package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import com.resonance.design.AppFonts
import com.resonance.design.FrameCrop
import com.resonance.design.Grain
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
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
 * Round 33 §Q5 (the owner: 无拖动空间时给轻微橡皮筋回弹，并在框下方提示「放大後才能移動」): in 調整封面, the generate route's
 * 1536 × 1024 at zoom 1 has no room across in the 0.62 frame; a drag across tells so under the frame, the line held
 * whether it shows or not (nothing under the frame moves), and a zoom that gives it room takes the hint away.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w400dp-h860dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CoverFrameNoRoomTest {
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

    private val language = Strings.language

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        val photo = Bitmap.createBitmap(1536, 1024, Bitmap.Config.ARGB_8888).asImageBitmap()
        compose.setContent { CoverFrameDialog(photo, null, onCancel = {}, onDone = {}) }
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun hint() = compose.onNodeWithText(L10n.Write.CoverFrame.zoomToMove, useUnmergedTree = true)
    private fun slider() = compose.onNodeWithContentDescription(L10n.Crop.zoom)

    @Test fun aDragAcrossWithNoRoomSaysZoomInAndAZoomWithRoomTakesItAway() {
        hint().assertDoesNotExist()
        val sliderAt = slider().getBoundsInRoot().top
        // Across: nothing to move to.
        compose.onNodeWithContentDescription(L10n.Write.CoverFrame.stage).performTouchInput {
            down(center)
            moveBy(Offset(30f, 0f))
            moveBy(Offset(30f, 0f))
            up()
        }
        compose.waitForIdle()
        hint().assertExists()
        // The line was held: the zoom row under it hasn't moved.
        assertEquals(sliderAt.value, slider().getBoundsInRoot().top.value, 0.5f)
        // Zoomed in, the picture has room both ways: the hint goes.
        slider().performSemanticsAction(SemanticsActions.SetProgress) { it(FrameCrop.sliderOf(1.3)) }
        compose.waitForIdle()
        hint().assertDoesNotExist()
    }

    @Test fun aDragDownWithRoomSaysNothing() {
        compose.onNodeWithContentDescription(L10n.Write.CoverFrame.stage).performTouchInput {
            down(center)
            moveBy(Offset(0f, 30f))
            moveBy(Offset(0f, 30f))
            up()
        }
        compose.waitForIdle()
        hint().assertDoesNotExist()
    }
}
