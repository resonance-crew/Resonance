package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
 * Escape in the note's field (round 26, the note in place), a hardware keyboard's — a tablet's or a Chromebook's: an
 * empty field closes, as 寄小紙條 again does; one with words keeps them and lets go of the focus, as the web and iOS do
 * (Tab can't: the field is multi-line, and types it).
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NoteInPlaceKeysTest {
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

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun show(note: NoteFieldState) = compose.setContent {
        NoteInPlace(note, tapOn = false, mayNote = true, hint = false, reducedMotion = true, onSend = {}, onUpgrade = {})
    }

    private val field get() = compose.onNode(hasSetTextAction())

    @Test fun escapeOnAFieldWithWordsLeavesItOpenAndUnfocused() {
        val note = NoteFieldState("謝謝你寫下這場雨", mayNote = true)
        show(note)
        field.performClick()
        field.assertIsFocused()
        field.performKeyInput { pressKey(Key.Escape) }
        compose.waitForIdle()
        field.assertIsNotFocused()
        assertTrue(note.open)
        assertEquals("謝謝你寫下這場雨", note.text)
    }

    @Test fun escapeOnAnEmptyFieldClosesIt() {
        val note = NoteFieldState("", mayNote = true)
        note.segment()
        show(note)
        field.performClick()
        field.performKeyInput { pressKey(Key.Escape) }
        compose.waitForIdle()
        assertFalse(note.open)
    }
}
