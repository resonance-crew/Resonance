package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * A bar's glyphs at work and at rest (round 8 §2.1, §9.1): the writer's ✓ is the bar's own icon
 * button — faded and still while there is nothing to finish, the small button loop in its glyph's
 * place (never the big loader) while a first save runs, its size kept, busy to TalkBack; the card's
 * share at work keeps its size and says busy too; and the writer's bar says its save state after its
 * title, a polite live region, the first thing to go when the row is too narrow.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BarActionsTest {
    @get:Rule val compose = createComposeRule()

    private val language = Strings.language

    @Before fun catalogs() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theFinishGlyphRestsWhileThereIsNothingToFinishAndLoopsWhileItWaits() {
        var enabled by mutableStateOf(false)
        var busy by mutableStateOf(false)
        var taps = 0
        compose.setContent {
            OrganicIconButton(IconName.Check, L10n.Write.finish, size = 22.dp, enabled = enabled, busy = busy) { taps++ }
        }
        val node = compose.onNodeWithContentDescription("完成")
        node.assertIsNotEnabled()
        node.performClick()
        assertEquals(0, taps)
        val idle = node.fetchSemanticsNode().size
        compose.runOnIdle { enabled = true }
        node.assertIsEnabled()
        node.performClick()
        assertEquals(1, taps)
        compose.runOnIdle { busy = true }
        assertEquals(idle, node.fetchSemanticsNode().size)
        node.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, L10n.App.busy))
        node.assertIsNotEnabled()
        // The big loader names itself; the button loop is the glyph's quiet stand-in.
        compose.onNodeWithContentDescription(L10n.Home.moreLoading).assertDoesNotExist()
    }

    @Test fun theShareAtWorkKeepsItsSizeAndSaysBusy() {
        var busy by mutableStateOf(false)
        compose.setContent {
            OrganicMenuChip(IconName.Share, L10n.Card.share, seed = 5.0, trigger = MenuTrigger.Bare, busy = busy) {}
        }
        val node = compose.onNodeWithContentDescription(L10n.Card.share)
        val idle = node.fetchSemanticsNode().size
        compose.runOnIdle { busy = true }
        assertEquals(idle, node.fetchSemanticsNode().size)
        node.assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, L10n.App.busy))
        compose.onNodeWithContentDescription(L10n.Home.moreLoading).assertDoesNotExist()
    }

    @Test fun theBarSaysItsSaveStateAfterItsTitleAsAPoliteLiveRegion() {
        var status by mutableStateOf<BarStatus?>(null)
        compose.setContent {
            Box(Modifier.width(390.dp)) {
                OrganicInlineBar(L10n.App.Nav.back, {}, title = L10n.Write.title, hasStatus = true, status = status)
            }
        }
        compose.onNodeWithText(L10n.Write.title).assertIsDisplayed()
        compose.runOnIdle { status = BarStatus(L10n.Write.Status.saved) }
        compose.onNodeWithText("已儲存")
            .assertIsDisplayed()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        compose.runOnIdle { status = BarStatus(L10n.Write.Status.failed, failed = true) }
        compose.onNodeWithText("未儲存").assertIsDisplayed()
    }

    @Test fun theSaveStateIsTheFirstToGoWhenTheRowIsTooNarrow() {
        compose.setContent {
            Box(Modifier.width(150.dp).testTag("bar")) {
                OrganicInlineBar(L10n.App.Nav.back, {}, title = L10n.Write.PublishPanel.updateTitle, hasStatus = true, status = BarStatus(L10n.Write.Status.savedLive))
            }
        }
        compose.onNodeWithText(L10n.Write.PublishPanel.updateTitle).assertIsDisplayed()
        // Not drawn — still the live region it was, for TalkBack.
        compose.onNodeWithText("修改已暫存").assertIsNotDisplayed()
    }

    @Test fun aStateFitsAfterTheTitleOnlyWhole() {
        assertTrue(statusFits(title = 100, status = 60, gap = 8, room = 168))
        assertFalse(statusFits(title = 100, status = 60, gap = 8, room = 167))
        // Nothing to say never takes room.
        assertFalse(statusFits(title = 10, status = 0, gap = 8, room = 400))
    }
}
