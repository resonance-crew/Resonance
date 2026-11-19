package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LocalInlineBarHeight
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
 * The note's field over the keyboard after a turn (round 26 review of e8747a6a): MainActivity handles turning and
 * unfolding itself (AndroidManifest configChanges), so the field keeps the focus — and its reveal keeps running —
 * while the bar over the page changes height. Each reveal after it measures against the bar now: one read from when the
 * field took the focus would have the bar step aside where the field fits under it (or leave the field's top a few dp
 * under a taller one).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NoteBarTurnTest {
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

    private val density get() = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    /** The keyboard [height] tall, as the window hands it to the page. */
    private fun keyboard(view: View, height: Dp) {
        val insets = WindowInsetsCompat.Builder()
            .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, (height.value * density).toInt()))
            .build()
        compose.runOnIdle { ViewCompat.dispatchApplyWindowInsets(view, insets) }
        // Past the keyboard's settling, when the page asks for the field.
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
    }

    @Test fun afterATurnWithTheFieldFocused_theRevealMeasuresTheBarNow() {
        val note = NoteFieldState("謝謝你寫下這場雨", mayNote = true)
        var bar by mutableStateOf(280.dp)
        var room: Boolean? = null
        lateinit var view: View
        compose.setContent {
            view = LocalView.current
            CompositionLocalProvider(LocalInlineBarHeight provides bar) {
                Box(Modifier.fillMaxSize()) {
                    NoteInPlace(note, mayNote = true, reducedMotion = true, onSend = {}, onUpgrade = {}, onRoom = { room = it })
                }
            }
        }
        compose.onNode(hasSetTextAction()).performClick()
        compose.waitForIdle()
        val window = compose.runOnIdle { view.height } / density
        // The keyboard's top 300 down the window, the bar's edge at 290: no room for the field under it, the bar steps aside.
        keyboard(view, (window - 300f).dp)
        assertEquals(true, room)
        // Turned: the bar is a phone's 52 again (its edge at 62) and the keyboard a little taller — 228 under the bar,
        // room for the field and its 12, the bar stays.
        bar = 52.dp
        compose.waitForIdle()
        keyboard(view, (window - 290f).dp)
        assertEquals(false, room)
    }
}
