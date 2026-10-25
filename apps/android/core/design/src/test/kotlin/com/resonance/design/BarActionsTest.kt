package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.onNodeWithTag
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
 * share at work keeps its size and says busy too; and the writer's bar says its save state as its
 * title's second line (round 11 §5), a polite live region, the title alone on the row's line until it
 * comes; a tablet's back bar sets its row 6 lower (round 11 §6).
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

    @Test fun theBarSaysItsSaveStateUnderItsTitleAsAPoliteLiveRegion() {
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

    @Test fun theSaveStateIsTheTitlesSecondLineAndTheTitleStandsOnTheRowUntilItComes() {
        var status by mutableStateOf<BarStatus?>(null)
        compose.setContent {
            Box(Modifier.width(390.dp).testTag("bar")) {
                OrganicInlineBar(L10n.App.Nav.back, {}, title = L10n.Write.title, hasStatus = true, status = status)
            }
        }
        val bar = compose.onNodeWithTag("bar").getBoundsInRoot()
        val back = compose.onNodeWithContentDescription(L10n.App.Nav.back).getBoundsInRoot()
        val alone = compose.onNodeWithText(L10n.Write.title).getBoundsInRoot()
        // Alone, the title stands on the row's line: its middle on the arrow's.
        assertEquals(((back.top + back.bottom) / 2).value, ((alone.top + alone.bottom) / 2).value, 1.5f)
        compose.runOnIdle { status = BarStatus(L10n.Write.Status.saved) }
        compose.mainClock.advanceTimeBy(400)
        compose.waitForIdle()
        val title = compose.onNodeWithText(L10n.Write.title).getBoundsInRoot()
        val state = compose.onNodeWithText("已儲存").getBoundsInRoot()
        // Under the title, start-aligned on a phone, the two lines together on the arrow's middle — and the bar never grew.
        assertTrue(state.top >= title.bottom)
        assertEquals(title.left.value, state.left.value, 1f)
        assertEquals(((back.top + back.bottom) / 2).value, ((title.top + state.bottom) / 2).value, 1.5f)
        assertTrue(title.top < alone.top)
        assertEquals((bar.bottom - bar.top).value, compose.onNodeWithTag("bar").getBoundsInRoot().let { it.bottom - it.top }.value, 0.5f)
    }

    @Test fun onATabletTheSaveStateIsCentredUnderTheCentredTitleAndTheRowSitsLower() {
        compose.setContent {
            CompositionLocalProvider(
                LocalHeaderChrome provides HeaderChrome(width = 800.dp, groupWidth = 0.dp, pad = 32.dp, labels = false, tabs = false),
                LocalInlineBarHeight provides TopBarRow,
            ) {
                Box(Modifier.width(800.dp)) {
                    OrganicInlineBar(L10n.App.Nav.back, {}, title = L10n.Write.title, hasStatus = true, status = BarStatus(L10n.Write.Status.saved))
                }
            }
        }
        val title = compose.onNodeWithText(L10n.Write.title).getBoundsInRoot()
        val state = compose.onNodeWithText("已儲存").getBoundsInRoot()
        assertEquals(((title.left + title.right) / 2).value, ((state.left + state.right) / 2).value, 1f)
        // The arrow 6 under the 72 row's middle (round 11 §6), its 48 still clear of the bar's foot.
        val back = compose.onNodeWithContentDescription(L10n.App.Nav.back).getBoundsInRoot()
        assertEquals(TopBarRow.value / 2 + TabletBarRowDrop.value, ((back.top + back.bottom) / 2).value, 1f)
        assertTrue(back.bottom.value <= TopBarRow.value)
    }

    @Test fun aTabletRowPieceDropsButNeverPastTheRowsFoot() {
        assertEquals(12 + 6, tabletRowTop(row = 72, height = 48, drop = 6))
        assertEquals(24, tabletRowTop(row = 72, height = 48, drop = 30))
        assertEquals(0, tabletRowTop(row = 40, height = 48, drop = 6))
    }
}
