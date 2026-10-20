package com.resonance.design

import android.os.Looper
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.platform.AccessibilityManager
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.test.up
import androidx.compose.ui.test.moveTo
import androidx.compose.ui.geometry.Offset
import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import java.io.File

/**
 * The shell's one toast (trash.spec §6): one at a time, 4 s for a status and 8 s with an action —
 * longer when the person's accessibility settings ask for it, held while a finger is on it — the
 * whole pill the button when it offers an action (named for TalkBack by what it undoes, its click
 * labelled by the verb), and every toast spoken through one polite live region.
 */
@RunWith(RobolectricTestRunner::class)
class ToastHostTest {
    @get:Rule val compose = createComposeRule()

    private val language = Strings.language
    private val toasts = Toasts()

    @Before fun catalogs() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun host(accessibility: AccessibilityManager? = null) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            if (accessibility != null) {
                CompositionLocalProvider(LocalAccessibilityManager provides accessibility) { ToastHost(toasts) }
            } else {
                ToastHost(toasts)
            }
        }
        compose.mainClock.advanceTimeByFrame()
    }

    /** The clock moves on [millis], after what the test changed outside composition (a show, a dismiss) is seen. */
    private fun advance(millis: Long) {
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeBy(millis)
    }

    private val title = "湖中央"
    private fun undo(onAction: () -> Unit = {}) = Toasts.Action(
        label = L10n.Me.Actions.undo,
        accessibilityLabel = L10n.Me.Actions.undoTrashLabel(title),
        icon = IconName.Restore,
        onAction = onAction,
    )

    private val liveRegion = SemanticsMatcher("a polite live region") {
        it.config.getOrNull(SemanticsProperties.LiveRegion) == LiveRegionMode.Polite
    }

    private fun spoken(): String? = compose.onNode(liveRegion).fetchSemanticsNode().config.getOrNull(SemanticsProperties.ContentDescription)?.firstOrNull()

    @Test fun aStatusIsSpokenThenGoesAfterFourSeconds() {
        host()
        toasts.show(L10n.Me.Actions.restored)
        advance(100)
        assertEquals(L10n.Me.Actions.restored, spoken())
        // TalkBack hears it once, through the region: the pill itself says nothing more.
        compose.onAllNodesWithText(L10n.Me.Actions.restored).assertCountEquals(0)
        advance(Toasts.STATUS_MILLIS - 400)
        assertEquals(L10n.Me.Actions.restored, toasts.current?.message)
        advance(500)
        assertNull(toasts.current)
        // The region is cleared with it, so nothing stale is read later.
        assertNull(spoken())
    }

    @Test fun anUndoIsOneButtonNamedByWhatItUndoesAndStaysEightSeconds() {
        var undone = 0
        host()
        toasts.show(L10n.Me.Actions.trashed, announce = L10n.Me.Actions.movedToTrash(title), action = undo { undone++ })
        advance(100)
        // The region says what happened to which card; the pill is the button, its name led by its visible words.
        assertEquals("〈湖中央〉已移到垃圾桶", spoken())
        val button = compose.onNodeWithContentDescription("已移到垃圾桶 · 復原〈湖中央〉")
        button.assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
        button.assert(SemanticsMatcher("clicks to 復原") { it.config.getOrNull(SemanticsActions.OnClick)?.label == "復原" })
        advance(Toasts.STATUS_MILLIS + 1_000)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        advance(Toasts.ACTION_MILLIS - Toasts.STATUS_MILLIS - 800)
        assertEquals(0, undone)
        assertNull(toasts.current)
    }

    @Test fun theUndoRunsOnceAndTakesTheToastWithIt() {
        var undone = 0
        host()
        toasts.show(L10n.Me.Actions.trashed, action = undo { undone++ })
        advance(100)
        compose.onNodeWithContentDescription(L10n.Me.Actions.undoTrashLabel(title)).performClick()
        advance(300)
        assertEquals(1, undone)
        assertNull(toasts.current)
        compose.onAllNodesWithContentDescription(L10n.Me.Actions.undoTrashLabel(title)).assertCountEquals(0)
    }

    @Test fun aNewToastReplacesTheOneShowingAndItsTimeStartsAgain() {
        var undone = 0
        host()
        toasts.show(L10n.Me.Actions.trashed, action = undo { undone++ })
        advance(3_000)
        val second = toasts.show(L10n.Me.Actions.restored)
        advance(200)
        assertEquals(second, toasts.current?.id)
        assertEquals(L10n.Me.Actions.restored, spoken())
        compose.onAllNodesWithContentDescription(L10n.Me.Actions.undoTrashLabel(title)).assertCountEquals(0)
        // Dismissing the first by its id leaves the second alone.
        toasts.dismiss(second - 1)
        assertEquals(second, toasts.current?.id)
        advance(Toasts.STATUS_MILLIS - 600)
        assertEquals(second, toasts.current?.id)
        advance(600)
        assertNull(toasts.current)
        assertEquals(0, undone)
    }

    @Test fun aFingerOnItHoldsItAndItGoesOnWithTwoSecondsLeft() {
        var undone = 0
        host()
        toasts.show(L10n.Me.Actions.trashed, action = undo { undone++ })
        advance(100)
        // A second before it would go, a finger comes down on it and stays.
        advance(Toasts.ACTION_MILLIS - 1_000)
        val button = compose.onNodeWithContentDescription(L10n.Me.Actions.undoTrashLabel(title))
        button.performTouchInput { down(center) }
        advance(Toasts.ACTION_MILLIS + 4_000)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        // The finger slides off and lifts: no undo, and the toast has two seconds, not the one it had left.
        button.performTouchInput {
            moveTo(Offset(-width.toFloat(), -height * 4f))
            up()
        }
        advance(Toasts.RESUME_MILLIS - 400)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        advance(700)
        assertNull(toasts.current)
        assertEquals(0, undone)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test fun aMouseOverItHoldsItToo() {
        host()
        toasts.show(L10n.Me.Actions.trashed, action = undo())
        advance(100)
        // A second before it would go, a tablet's or a Chromebook's pointer comes over it and stays.
        advance(Toasts.ACTION_MILLIS - 1_000)
        val button = compose.onNodeWithContentDescription(L10n.Me.Actions.undoTrashLabel(title))
        button.performMouseInput { enter(center) }
        advance(Toasts.ACTION_MILLIS + 2_000)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        // The pointer moves off it (out of the window: the test's root is the host alone); Android
        // hands a hover's end over a moment later (a press may follow it), so let it through.
        button.performMouseInput { moveTo(Offset(-width.toFloat(), -height * 4f)) }
        shadowOf(Looper.getMainLooper()).idle()
        advance(Toasts.RESUME_MILLIS - 400)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        advance(700)
        assertNull(toasts.current)
    }

    @Test fun accessibilitySettingsThatAskForMoreTimeGetIt() {
        val asked = mutableListOf<List<Any>>()
        val longer = object : AccessibilityManager {
            override fun calculateRecommendedTimeoutMillis(originalTimeoutMillis: Long, containsIcons: Boolean, containsText: Boolean, containsControls: Boolean): Long {
                asked += listOf(originalTimeoutMillis, containsIcons, containsText, containsControls)
                return 20_000L
            }
        }
        host(longer)
        toasts.show(L10n.Me.Actions.trashed, action = undo())
        advance(19_000)
        assertEquals(L10n.Me.Actions.trashed, toasts.current?.message)
        advance(1_500)
        assertNull(toasts.current)
        assertEquals(listOf<Any>(Toasts.ACTION_MILLIS, true, true, true), asked.single())
    }

    @Test fun theTimeoutIsNeverShorterThanTheToastsOwn() {
        val shorter = object : AccessibilityManager {
            override fun calculateRecommendedTimeoutMillis(originalTimeoutMillis: Long, containsIcons: Boolean, containsText: Boolean, containsControls: Boolean) = 1_000L
        }
        val status = Toasts().run { show("已還原"); current!! }
        assertEquals(Toasts.STATUS_MILLIS, toastTimeoutMillis(status, shorter))
        assertEquals(Toasts.STATUS_MILLIS, toastTimeoutMillis(status, null))
        val withAction = Toasts().run { show("已移到垃圾桶", action = Toasts.Action("復原", "已移到垃圾桶 · 復原", onAction = {})); current!! }
        assertEquals(Toasts.ACTION_MILLIS, toastTimeoutMillis(withAction, null))
    }

    @Test fun aToastThatHasGoneUndoesNothing() {
        var undone = 0
        val first = Toasts().apply { show(L10n.Me.Actions.trashed, action = undo { undone++ }) }
        val leaving = first.current!!
        // Replaced while its face still fades out: a tap on that face is not an undo.
        first.show(L10n.Me.Actions.restored)
        first.act(leaving)
        // Gone of its own: the same.
        first.dismiss()
        first.act(leaving)
        assertEquals(0, undone)
    }

    @Test fun withoutAHostAToastIsSimplyNotDrawn() {
        // A screen composed outside the shell (a test, a preview) gets a detached host: showing is harmless.
        val detached = Toasts()
        detached.show("已還原")
        detached.dismiss()
        assertNull(detached.current)
    }
}
