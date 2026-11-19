package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.TapList
import com.resonance.api.models.TapPerson
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.WindowLayout
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
 * The reader's list behind the faces (round 26 §U2.5, as the owner's look of 2026-11-19 amends it: 「我在想这个直接做成
 * 这个 model 会不会好一点呢」 — 「手机上已经是这个 model 的设计了，所以可能只有平板…需要更改」): a tablet opens the phone's
 * dialog — the same rows, no visible title, 關閉 at its foot — as wide as the author's list there, and no popover hangs
 * under the faces any more.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReaderTapDialogTest {
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

    private fun person(id: String) = TapPerson(Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null), null)

    private var closed = 0
    private val opened = mutableListOf<String>()

    private fun show(window: Dp) = compose.setContent {
        CompositionLocalProvider(LocalWindowLayout provides WindowLayout(window)) {
            val list = remember { TapPeople { TapList(listOf(person("dora"), person("eli")), nextPageToken = null) } }
            LaunchedEffect(list) { list.first() }
            ReaderTapDialog(list, onDismiss = { closed++ }) { opened += it.author.handle }
        }
    }

    private fun assertThePhonesDialog() {
        compose.waitForIdle()
        // A dialog, never the popover under the faces.
        compose.onNode(isDialog()).assertExists()
        compose.onAllNodes(isPopup()).assertCountEquals(0)
        // Its rows, each to the profile.
        compose.onNodeWithText("dora").performClick()
        assertEquals(listOf("dora"), opened)
        compose.onNodeWithText("eli").assertExists()
        // No visible title: the reader sees only their connections.
        compose.onAllNodesWithText(L10n.Card.Tap.label).assertCountEquals(0)
        // 關閉 at its foot, the one way out.
        compose.onNodeWithText(L10n.Native.close).performClick()
        assertEquals(1, closed)
    }

    @Test @Config(qualifiers = "w1280dp-h800dp")
    fun anExpandedTabletOpensThePhonesDialogAsWideAsTheAuthorsList() {
        show(1280.dp)
        assertThePhonesDialog()
        // The author's list's 480, not the popover's 280: a row spans the dialog's card inside its padding.
        val row = compose.onNodeWithText("eli").getBoundsInRoot()
        val width = (row.right - row.left).value
        assertTrue("a row $width wide", width > 380f && width <= 480f)
    }

    @Test @Config(qualifiers = "w700dp-h1000dp")
    fun aMediumTabletOpensThePhonesDialogToo() {
        show(700.dp)
        assertThePhonesDialog()
    }

    @Test fun aPhoneKeepsItsDialog() {
        show(375.dp)
        assertThePhonesDialog()
    }

    @Test fun theDialogsWidestIsAPhonesFourHundredAndTheAuthorsListsFourEightyWider() {
        assertEquals(400f, readerListWidth(LayoutClass.Compact).value, 0f)
        assertEquals(480f, readerListWidth(LayoutClass.Medium).value, 0f)
        assertEquals(480f, readerListWidth(LayoutClass.Expanded).value, 0f)
    }
}
