package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
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
 * 重設 sits at the end of the crop dialogs' zoom row (round 25 §G, the owner: 「要」 to 「要把「重設」統一放在滑桿那一列的最右
 * 邊嗎？」), as on iOS: shown only once the picture moved, its words ending on the row's end (the column 完成 ends on),
 * and the row 36 tall either way, so nothing below it jumps when it appears.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CropZoomRowTest {
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
    private var moved by mutableStateOf(false)
    private var resets = 0

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        compose.setContent {
            Box(Modifier.width(320.dp).testTag("column")) {
                CropZoomRow(1.5, 4.0, L10n.Crop.zoom, moved = moved, onReset = { resets++ }) {}
            }
        }
    }

    @After fun restore() {
        Strings.language = language
    }

    private val column get() = compose.onNodeWithTag("column").getBoundsInRoot()

    @Test fun resetShowsOnlyOnceMovedAndKeepsTheRowsHeight() {
        compose.onNodeWithTag(CropResetTag).assertDoesNotExist()
        val still = column.bottom - column.top
        assertEquals(CropZoomRowHeight.value, still.value, 0.5f)
        moved = true
        compose.waitForIdle()
        val shown = column.bottom - column.top
        assertEquals(still.value, shown.value, 0.5f)
    }

    @Test fun resetsWordsEndOnTheRowsEndAndItPutsThePictureBack() {
        moved = true
        compose.waitForIdle()
        val words = compose.onNodeWithText(L10n.Crop.reset, useUnmergedTree = true).getBoundsInRoot()
        assertEquals(column.right.value, words.right.value, 0.5f)
        assertTrue("重設 stands at the row's end, past the slider", words.left > column.left + (column.right - column.left) / 2)
        compose.onNodeWithTag(CropResetTag).performClick()
        assertEquals(1, resets)
    }
}
