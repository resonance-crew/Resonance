package com.resonance.design

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import androidx.compose.ui.unit.dp
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * A verb at work keeps its width: its bare words (刪除 for 刪除卡片) and the loader share the idle
 * label's room, so nothing beside it moves — and TalkBack still hears the idle words, busy.
 */
@RunWith(RobolectricTestRunner::class)
class ButtonLoadingTest {
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

    @Test fun aBusyVerbInItsBareWordsKeepsItsSize() {
        var loading by mutableStateOf(false)
        compose.setContent {
            OrganicButton(
                L10n.Me.Actions.deleteConfirm, Modifier.testTag("verb"), variant = ButtonVariant.Danger, small = true,
                loading = loading, loadingTitle = L10n.Me.Actions.delete,
            ) {}
        }
        val idle = compose.onNodeWithTag("verb").fetchSemanticsNode().size
        compose.runOnIdle { loading = true }
        assertEquals(idle, compose.onNodeWithTag("verb").fetchSemanticsNode().size)
        compose.onNodeWithTag("verb").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, L10n.App.busy))
        compose.onNodeWithText(L10n.Me.Actions.deleteConfirm).assertExists()
        compose.onNodeWithText(L10n.Me.Actions.delete).assertDoesNotExist()
    }

    // Round 21: a button that can be busy is always as wide as its busy self — a short verb with no shorter
    // form (封鎖) has room for the loop beside it before it works, so going busy moves nothing, and a button
    // that never works keeps its own width.
    @Test fun aButtonThatCanBeBusyIsAsWideAsItsBusySelf() {
        var loading by mutableStateOf(false)
        compose.setContent {
            androidx.compose.foundation.layout.Column {
                OrganicButton(L10n.Safety.blockConfirm, Modifier.testTag("busy"), small = true, loading = loading) {}
                OrganicButton(L10n.Safety.blockConfirm, Modifier.testTag("plain"), small = true) {}
            }
        }
        val idle = compose.onNodeWithTag("busy").fetchSemanticsNode().size
        val plain = compose.onNodeWithTag("plain").fetchSemanticsNode().size
        // The loop (14 in sm) and its 6 more than the words alone.
        val room = with(compose.density) { (ButtonLoaderSmall + 6.dp).roundToPx() }
        assertEquals((plain.width + room).toFloat(), idle.width.toFloat(), 2f)
        compose.runOnIdle { loading = true }
        assertEquals(idle, compose.onNodeWithTag("busy").fetchSemanticsNode().size)
        // Its name is still its words.
        compose.onNodeWithTag("busy").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, L10n.App.busy))
    }
}
