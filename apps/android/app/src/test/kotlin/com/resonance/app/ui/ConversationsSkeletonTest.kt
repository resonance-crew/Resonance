package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.app.Person
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
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
 * The conversations' skeleton stands where the rows will (the owner, on a phone at 1.5× text: 「私訊頁面的 skeleton
 * 和實際位置不一樣」): its six rows are as tall as six conversation rows at every text size, on a phone and in a
 * tablet's column, in a Chinese interface (Han in the rows: the fallback face's taller lines) and an English one
 * — its bars sit in lines of the words they stand for, set unseen in their type.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w400dp-h2400dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationsSkeletonTest {
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
    private var fontScale by mutableStateOf(1f)
    private var skeleton by mutableStateOf(true)
    private var cls by mutableStateOf(LayoutClass.Compact)
    private var latin by mutableStateOf(false)

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
    }

    /** The list as [language] draws it (the interface's language is read while composing, as the app's screens read it). */
    private fun show(language: Strings.Language) {
        Strings.language = language
        compose.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, fontScale)) {
                val frame = ConversationsFrame.of(cls)
                Box(Modifier.width(400.dp).wrapContentHeight(unbounded = true).testTag("list")) {
                    if (skeleton) {
                        ConversationsSkeleton(frame)
                    } else {
                        Column {
                            for (i in 0 until 6) {
                                ConversationRow(
                                    if (latin) Person("u$i", "reader$i", "R", null, null, null) else Person("u$i", "讀者$i", "讀", null, null, null),
                                    if (latin) "See you tomorrow" else "最近的一則訊息", if (latin) "3:04 PM" else "下午3:04", 0, {},
                                    frame = frame, band = "c:$i" to "c:${i + 1}", scrolling = { false },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun height(): Float = compose.onNodeWithTag("list").getBoundsInRoot().let { (it.bottom - it.top).value }

    private fun heights(scale: Float, layout: LayoutClass): Pair<Float, Float> {
        fontScale = scale
        cls = layout
        skeleton = true
        compose.waitForIdle()
        val drawn = height()
        skeleton = false
        compose.waitForIdle()
        return drawn to height()
    }

    private fun assertMatches(what: String) {
        for (layout in listOf(LayoutClass.Compact, LayoutClass.Medium)) {
            for (scale in listOf(1f, 1.3f, 1.5f, 2f)) {
                val (drawn, rows) = heights(scale, layout)
                assertEquals("six skeleton rows vs six rows at ${scale}× text ($layout, $what)", rows, drawn, 0.5f)
            }
        }
    }

    @Test fun inAChineseInterfaceTheSkeletonsRowsAreTheRowsHeightAtEveryTextSize() {
        show(Strings.Language.ZhTW)
        assertMatches("zh-TW")
    }

    @Test fun inAnEnglishInterfaceTheyAreTooForLatinRows() {
        latin = true
        show(Strings.Language.En)
        assertMatches("en")
    }
}
