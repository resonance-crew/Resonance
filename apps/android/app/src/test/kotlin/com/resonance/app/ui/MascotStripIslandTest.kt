package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.view.View
import androidx.activity.ComponentActivity
import org.junit.rules.RuleChain
import org.junit.runners.model.Statement
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * AND-7: Settings → 外觀's strip builds the puppets' island (a WebView renderer of its own) only once the
 * switch has been on during the visit — never for someone who keeps the puppets off — and keeps it once
 * built, so turning the switch off again still puts one back to nap.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class MascotStripIslandTest {
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

    private fun webViews(view: View): Int = when (view) {
        is WebView -> 1
        is ViewGroup -> (0 until view.childCount).sumOf { webViews(view.getChildAt(it)) }
        else -> 0
    }

    @Test
    fun theIslandComesOnlyWithTheSwitchAndStaysForTheVisit() {
        var on by mutableStateOf(false)
        lateinit var root: View
        compose.setContent {
            root = LocalView.current.rootView
            MascotStrip(on, control = null)
        }
        compose.waitForIdle()
        assertEquals("off: no web view at all", 0, webViews(root))

        on = true
        compose.waitForIdle()
        assertEquals("on: the island", 1, webViews(root))

        on = false
        compose.waitForIdle()
        assertEquals("off again: the island stays to put one back to nap", 1, webViews(root))
    }
}
