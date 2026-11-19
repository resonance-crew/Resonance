package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
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
 * The bell row's unread dot never takes a line of its own (round 26 screens' review: at the largest text
 * 「bob 用一張卡片回應了你的文章」 filled its line on the phone, and the dot wrapped under it, an empty-looking
 * line between the sentence and the date). Held to the sentence's last character, as the web's BellLine
 * holds it: at every column width and text size the dot's line has words on it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BellDotTest {
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
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private val sentences = listOf(
        BellSentence("", "bob", " 用一張卡片回應了你的文章"),
        BellSentence("", "bob", " replied to your story with a card"),
        BellSentence("", "dora", " 接受了你的邀請，你們連上線了 ✿"),
    )
    private val scales = listOf(1f, 1.3f, 1.5f, 2f)
    // From well under the narrowest column a row's words get (a 320 dp phone less the face, the card and their gaps:
    // about 170) to wider than the sentences at the smallest text. Under about 64 dp at twice the text a word and the dot
    // are wider than the column, and the line must break somewhere.
    private val widths = 100..360

    @Test fun theUnreadDotEndsALineWithWordsOnIt_atEveryWidthAndTextSize() {
        val layouts = mutableMapOf<Triple<Int, Float, Int>, TextLayoutResult>()
        compose.setContent {
            val base = LocalDensity.current
            Column(Modifier.verticalScroll(rememberScrollState())) {
                for (scale in scales) {
                    CompositionLocalProvider(LocalDensity provides Density(base.density, scale)) {
                        sentences.forEachIndexed { s, sentence ->
                            for (w in widths) {
                                Box(Modifier.width(w.dp)) { Sentence(sentence, unread = true) { layouts[Triple(s, scale, w)] = it } }
                            }
                        }
                    }
                }
            }
        }
        compose.waitForIdle()
        assertEquals(sentences.size * scales.size * widths.count(), layouts.size)
        val alone = layouts.filter { (_, layout) ->
            val text = layout.layoutInput.text.text
            val dot = text.indexOf('•')
            val start = layout.getLineStart(layout.getLineForOffset(dot))
            text.substring(start, dot).all { it.isWhitespace() || it == '⁠' }
        }.keys.map { (s, scale, w) -> "「${sentences[s].whole}」 at $w dp, text ×$scale" }
        assertTrue("the dot alone on its line: ${alone.take(12)}", alone.isEmpty())
        // The dot still ends the sentence: nothing drawn between the words and it.
        val wide = layouts.getValue(Triple(0, 1f, widths.last)).layoutInput.text.text
        assertTrue(wide.endsWith("文章⁠•"))
    }
}
