package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.click
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runners.model.Statement
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The publish step puts the keyboard away on a tap beside its fields (round 17, the owner: 「点击画面空白处，应该可以把
 * 键盘收起来」), as the writing page already did: a tap on the step's blank clears the focus and keeps what was typed;
 * a control takes its own tap and leaves the field as it is; a scroll is no tap; and the tag capsule's own paper — its
 * margins round the words — is the field, which it focuses, never the blank.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PublishBlankTapTest {
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
    private var blanks = 0
    private var clicks = 0
    private var draft by mutableStateOf("")
    private val added = mutableListOf<String>()

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
        compose.setContent {
            val focus = LocalFocusManager.current
            // The step's column as PublishStep lays it: the blank tap outside its scroll, a control, the tag field, room under.
            Column(
                Modifier
                    .fillMaxSize()
                    .onBlankTap(null) {
                        blanks++
                        focus.clearFocus()
                    }
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
            ) {
                Box(Modifier.size(120.dp, 44.dp).testTag("control").clickable { clicks++ })
                Spacer(Modifier.height(40.dp))
                TagField(
                    draft = draft,
                    onDraftChange = { words, _ -> draft = words },
                    placeholder = L10n.Write.tagsPlaceholder,
                    suggesting = false,
                    canRemoveLast = false,
                    onRemoveLast = {},
                    onAdd = { added += it; draft = "" },
                    onSuggest = {},
                    onFocusChanged = {},
                    modifier = Modifier.testTag("capsule"),
                )
                Spacer(Modifier.height(600.dp).testTag("blank"))
            }
        }
    }

    @After fun restore() {
        Strings.language = language
    }

    private val field get() = compose.onNode(hasSetTextAction())

    @Test fun aTapOnTheBlankPutsTheKeyboardAwayAndKeepsTheWords() {
        field.performClick()
        field.assertIsFocused()
        field.performTextInput("cats")
        compose.onNodeWithTag("blank").performClick()
        field.assertIsNotFocused()
        assertEquals("cats", draft)
        assertEquals(1, blanks)
    }

    @Test fun aControlTakesItsOwnTapAndLeavesTheFieldAsItIs() {
        field.performClick()
        compose.onNodeWithTag("control").performClick()
        assertEquals(1, clicks)
        assertEquals(0, blanks)
        field.assertIsFocused()
    }

    @Test fun aScrollIsNoTap() {
        field.performClick()
        compose.onRoot().performTouchInput { swipeUp() }
        assertEquals(0, blanks)
        field.assertIsFocused()
    }

    @Test fun theCapsulesOwnPaperIsTheFieldNotTheBlank() {
        // Its start margin, beside the words and away from its segment: the field takes the focus.
        val capsule = compose.onNodeWithTag("capsule").getBoundsInRoot()
        compose.onRoot().performTouchInput {
            click(Offset((capsule.left + 4.dp).toPx(), ((capsule.top + capsule.bottom) / 2).toPx()))
        }
        field.assertIsFocused()
        assertEquals(0, blanks)
        // Its top margin, the field holding the focus: it keeps it.
        compose.onRoot().performTouchInput {
            click(Offset(((capsule.left + capsule.right) / 2).toPx(), (capsule.top + 3.dp).toPx()))
        }
        field.assertIsFocused()
        assertEquals(0, blanks)
    }

    @Test fun theSegmentAddsAndTheKeyboardStays() {
        field.performClick()
        field.performTextInput("tea")
        compose.onNodeWithContentDescription(L10n.Write.tagsAddLabel("tea")).performClick()
        assertEquals(listOf("tea"), added)
        assertEquals(0, blanks)
        field.assertIsFocused()
    }
}
