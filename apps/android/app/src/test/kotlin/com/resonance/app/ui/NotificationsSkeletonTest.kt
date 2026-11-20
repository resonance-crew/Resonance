package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.runtime.Composable
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
import com.resonance.app.NotificationsStore
import com.resonance.app.Person
import com.resonance.design.AppFonts
import com.resonance.design.CappedTextScale
import com.resonance.design.Grain
import com.resonance.kit.l10n.Strings
import java.io.File
import java.util.Date
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
 * The bell's skeleton stands where its rows will (the owner: 「Fix all six」, after 「私訊頁面的 skeleton
 * 和實際位置不一樣」 on a phone at 1.5× text): at every system text size, under the app's cap, a skeleton row is
 * as tall as a bell row of its kind — one with no card as a one-line row, one beside a card as a row whose
 * sentence takes two lines beside its card.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w346dp-h2400dp-500dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationsSkeletonTest {
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
    private var showing by mutableStateOf<(@Composable () -> Unit)?>(null)

    private val card = FeedCard(
        id = "c1", slug = "c1", title = "在滿是標籤的世界裡", excerpt = "…", tags = emptyList(),
        publishedAt = "2026-11-14T08:00:00Z", author = null, anonymous = false, visibility = FeedCard.Visibility.`public`,
        imageUrl = null, imageLabel = null, accentHue = 55.0, readMinutes = 4, referenceCardId = null, reason = null,
        trashedAt = null, purgeAt = null, restoresTo = null,
    )

    private fun item(type: String, handle: String, cardId: String?) = NotificationsStore.Item(
        id = "n-$type", type = type, fromHandle = handle, fromUserId = "u1", cardId = cardId, preview = null, noteId = null,
        count = null, readAt = Date(), createdAt = Date(),
    )

    private val extras = NotificationsStore.Extras(
        people = mapOf("u1" to Person("u1", "小島", "小", null, null, null)),
        cards = mapOf("c1" to card),
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
                    Box(Modifier.width(346.dp).wrapContentHeight(unbounded = true).testTag("row")) { showing?.invoke() }
                }
            }
        }
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun height(at: Float, content: @Composable () -> Unit): Float {
        system = at
        showing = content
        compose.waitForIdle()
        return compose.onNodeWithTag("row").getBoundsInRoot().let { (it.bottom - it.top).value }
    }

    private fun assertSame(what: String, skeleton: @Composable () -> Unit, row: @Composable () -> Unit) {
        for (at in listOf(0.85f, 1f, 1.15f, 1.3f, 1.5f, 2f)) {
            val drawn = height(at, skeleton)
            assertEquals("$what at ${at}× system text", height(at, row), drawn, 0.5f)
        }
    }

    @Test fun aRowWithNoCardIsAOneLineRowsHeight() {
        // 「小島 傳了一則訊息給你」: one line at every size the app draws.
        val message = item("message", "小島", null)
        assertSame("a row with no card", { NotificationSkeletonRow(0.8f, card = false) }, {
            NotificationRow(message, extras, "3 天前", "end", { false }) {}
        })
    }

    @Test fun aRowBesideACardIsATwoLineRowsHeight() {
        // 「不告訴你我是誰啦啦啦 與你的卡片共振了」: two lines beside the card at every size the app draws. Since
        // round 26 that is a tap's sentence (`resonance_tap`); a `resonance` row says 「…用一張卡片回應了你的文章」,
        // which with a name this long takes a third line at the largest text.
        val tap = item("resonance_tap", "不告訴你我是誰啦啦啦", "c1")
        assertSame("a row beside a card", { NotificationSkeletonRow(0.8f, card = true) }, {
            NotificationRow(tap, extras, "3 天前", "end", { false }) {}
        })
    }
}
