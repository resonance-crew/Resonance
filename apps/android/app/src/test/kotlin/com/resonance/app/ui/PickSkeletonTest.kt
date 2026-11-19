package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.content.res.Configuration
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
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.CappedTextScale
import com.resonance.design.Grain
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
 * The card picker's skeleton (共振 / 附加卡片) stands where its rows will (the owner: 「Fix all six」, after
 * 「私訊頁面的 skeleton 和實際位置不一樣」 on a phone at 1.5× text): four skeleton rows are as tall as four
 * picker rows at every system text size, under the app's cap as the screens wear it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w346dp-h2400dp-500dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PickSkeletonTest {
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
    private var system by mutableStateOf(1f)
    private var skeleton by mutableStateOf(true)

    private fun card(i: Int) = FeedCard(
        id = "c$i", slug = "c$i", title = "在滿是標籤的世界裡 $i", excerpt = "…", tags = emptyList(),
        publishedAt = "2026-11-14T08:00:00Z", author = null, anonymous = false, visibility = FeedCard.Visibility.`public`,
        imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 4, referenceCardId = null, reason = null,
        trashedAt = null, purgeAt = null, restoresTo = null,
    )

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        compose.setContent {
            val config = Configuration(LocalConfiguration.current).apply { fontScale = system }
            CompositionLocalProvider(LocalConfiguration provides config, LocalDensity provides Density(LocalDensity.current.density, system)) {
                CappedTextScale {
                    Box(Modifier.width(346.dp).wrapContentHeight(unbounded = true).testTag("list")) {
                        if (skeleton) PickSkeleton(4)
                        else Column { for (i in 0 until 4) CardPickRow(card(i), i, choosing = false, chosen = false, enabled = true, anonymousLabel = null, privateLabel = null) {} }
                    }
                }
            }
        }
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun height(): Float = compose.onNodeWithTag("list").getBoundsInRoot().let { (it.bottom - it.top).value }

    @Test fun theSkeletonsRowsAreThePickersRowsAtEveryTextSize() {
        for (at in listOf(0.85f, 1f, 1.15f, 1.3f, 1.5f, 2f)) {
            system = at
            skeleton = true
            compose.waitForIdle()
            val drawn = height()
            skeleton = false
            compose.waitForIdle()
            assertEquals("four skeleton rows vs four picker rows at ${at}× system text", height(), drawn, 0.5f)
        }
    }
}
