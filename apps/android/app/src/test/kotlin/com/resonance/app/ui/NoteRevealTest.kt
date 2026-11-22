package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The note's field over the keyboard (round 26, the note in place item 2: 「On focus the page scrolls the field's block
 * to 12 above the keyboard (nothing floats)」), in a short window: the screens' review found it under the keyboard on a
 * phone on its side, where the header's line and the keyboard leave about 28 dp — less than the field's one line. The
 * page brings the field with its line where both fit under the bar, the field alone where only it fits, and where not
 * even that fits the bar steps aside and the field stands under the status bar — 6 under it, in the air under the
 * capsule, where the block brought 12 over the keyboard would leave the capsule's foot as a cut sliver under the status
 * bar's paper (the relook of round 26, android/phone-landscape/card-note-open, when row 2 stood there; round 30 §S2
 * moved the faces' line over the capsule, so the capsule, 48 tall as row 2 was, is what stands over the field now). Measured on the AVD the
 * screenshots use (1080 × 2424 at 420 dpi, turned: 411 dp tall, the status bar 49, the expanded header's 72 + its 10,
 * Gboard 252).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NoteRevealTest {
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

    // A phone on its side (dp).
    private val window = 411f
    private val keyboard = 252f
    private val status = 49f
    private val bar = status + 72f + 10f
    private val field = 48f
    private val line = 24f
    private val clearance = NoteKeyboardClearance.value
    private val air = NoteRevealAir.value
    /** What stands over the field (round 30 §S2): the capsule, 48 tall (the segments' minimum), 12 over it. */
    private val capsule = 48f
    private val gap = NoteInPlaceGap.value

    @Test fun onItsSideNotEvenTheFieldFitsUnderTheBarSoTheBarStepsAside() {
        // 159 − 131 = 28 under the bar: not the field's 48 + 12.
        val keyboardTop = window - keyboard
        val reveal = noteReveal(keyboardTop, bar, status, field, line, clearance, air)
        assertTrue(reveal.barAside)
        // Under the status bar 110: the field, its line and the 12 take 84, which would leave 26 over the field — the
        // capsule's foot. The rect is the whole viewport instead: the field 6 under the status bar, the rest under the block.
        assertEquals(status + air, reveal.above)
        assertEquals(keyboardTop - status - air, reveal.below)
        assertEquals(keyboardTop, reveal.above + reveal.below)
        assertTrue(field + line + clearance <= reveal.below)
        // Large text (the owner's Pixel: font 1.5): taller still, and still both, still 6 under the status bar.
        val large = noteReveal(keyboardTop, bar, status, 60f, 30f, clearance, air)
        assertTrue(large.barAside)
        assertEquals(status + air, large.above)
        assertTrue(60f + 30f + clearance <= large.below)
    }

    @Test fun onItsSideABlockThatOnlyJustFitsStays12OverTheKeyboardWithTheCutInTheAirOverIt() {
        // Two lines of words (72) and the line (24): 108 of the 110 under the status bar — 2 over the field, in its air.
        val keyboardTop = window - keyboard
        val reveal = noteReveal(keyboardTop, bar, status, 72f, line, clearance, air)
        assertTrue(reveal.barAside)
        assertEquals(status, reveal.above)
        assertEquals(72f + line + clearance, reveal.below)
        assertTrue(keyboardTop - status - reveal.below <= gap)
        // The capsule and its 12 (60) never fit over even the field alone and its 12 here (50 left): it never shows whole.
        assertTrue(capsule + gap > keyboardTop - status - (field + clearance))
    }

    @Test fun upright_theFieldAndItsLineUnderTheBar_andTheFieldAloneWhereOnlyItFits() {
        val upright = noteReveal(923f - 300f, 50f + 52f + 10f, 50f, field, line, clearance, air)
        assertFalse(upright.barAside)
        assertEquals(112f, upright.above)
        assertEquals(field + line + clearance, upright.below)
        // 70 under the bar: the field and its 12, not the line.
        val tight = noteReveal(bar + 70f, bar, status, field, line, clearance, air)
        assertFalse(tight.barAside)
        assertEquals(field + clearance, tight.below)
        // No line under the field: just the field and its 12.
        assertEquals(field + clearance, noteReveal(923f - 300f, 112f, 50f, field, 0f, clearance, air).below)
    }

    private var scope: CoroutineScope? = null

    /** The page's list in a short window, stopping at the keyboard; the faces' line, the capsule, its 12, the field and its line far down the story. */
    private fun page(requester: BringIntoViewRequester, viewport: Dp, top: Dp) {
        compose.setContent {
            scope = rememberCoroutineScope()
            Box(Modifier.size(400.dp, window.dp)) {
                LazyColumn(Modifier.fillMaxWidth().height(viewport), contentPadding = PaddingValues(top = top)) {
                    item {
                        Column {
                            Spacer(Modifier.height((700f - Row2Height.value - capsule - gap).dp))
                            Box(Modifier.fillMaxWidth().height(Row2Height).testTag("faces"))
                            Box(Modifier.fillMaxWidth().height(capsule.dp).testTag("capsule"))
                            Spacer(Modifier.height(gap.dp))
                            Box(Modifier.fillMaxWidth().height(field.dp).bringIntoViewRequester(requester).testTag("field"))
                            Box(Modifier.fillMaxWidth().height(line.dp).testTag("line"))
                            Spacer(Modifier.height(300.dp))
                        }
                    }
                }
            }
        }
    }

    private fun bring(requester: BringIntoViewRequester, rect: Rect) {
        compose.runOnIdle { scope!!.launch { requester.bringIntoView(rect) } }
        compose.waitForIdle()
    }

    private val density get() = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    @Test fun onItsSideTheRectAskedBringsTheFieldAndItsLineOverTheKeyboardWithTheCapsuleWhollyUnderTheStatusBar() {
        val requester = BringIntoViewRequester()
        val keyboardTop = window - keyboard
        page(requester, keyboardTop.dp, bar.dp)
        val px = density
        val reveal = noteReveal(keyboardTop * px, bar * px, status * px, field * px, line * px, clearance * px, air * px)
        assertTrue(reveal.barAside)
        bring(requester, reveal.rect(400f * px))
        val shown = compose.onNodeWithTag("field").getBoundsInRoot()
        val under = compose.onNodeWithTag("line").getBoundsInRoot()
        val over = compose.onNodeWithTag("capsule").getBoundsInRoot()
        // The field 6 under the status bar, its line at least 12 over the keyboard.
        assertEquals(status + air, shown.top.value, 0.5f)
        assertTrue("the line ends 12 over the keyboard or higher (${under.bottom})", under.bottom.value <= keyboardTop - clearance + 0.5f)
        // The capsule wholly behind the status bar's paper: nothing of it under it (the cut falls in the 12 over the field).
        assertTrue("the capsule's foot (${over.bottom}) is under the status bar ($status)", over.bottom.value <= status + 0.5f)
    }

    @Test fun onItsSideTheRectBeforeTheRelookLeftASliverOfTheCapsuleUnderTheStatusBar() {
        // The block's own rect (the status bar's room over the field, the block under it), brought to the keyboard: 26 over
        // the field under the status bar, 14 of them the capsule's foot, cut thin.
        val requester = BringIntoViewRequester()
        val keyboardTop = window - keyboard
        page(requester, keyboardTop.dp, bar.dp)
        val px = density
        bring(requester, Rect(0f, -status * px, 400f * px, (field + line + clearance) * px))
        val over = compose.onNodeWithTag("capsule").getBoundsInRoot()
        assertTrue("the capsule's foot (${over.bottom}) shows under the status bar ($status)", over.bottom.value > status + 0.5f)
    }

    @Test fun theOldAskLeftTheFieldUnderTheBar() {
        // The block's height and the 12, from the field's top: brought to the keyboard, the field's top is under the bar.
        val requester = BringIntoViewRequester()
        val keyboardTop = window - keyboard
        page(requester, keyboardTop.dp, bar.dp)
        bring(requester, Rect(0f, 0f, 1f, (field + clearance) * density))
        val shown = compose.onNodeWithTag("field").getBoundsInRoot()
        assertTrue("the old ask puts the field's top (${shown.top}) under the bar ($bar)", shown.top.value < bar)
    }

    @Test fun uprightTheRectAskedKeepsTheFieldClearOfTheBar() {
        // A field already on screen but behind the bar: brought down under it, never left there.
        val requester = BringIntoViewRequester()
        val viewport = 623f
        val upBar = 112f
        page(requester, viewport.dp, upBar.dp)
        val px = density
        val reveal = noteReveal(viewport * px, upBar * px, 50f * px, field * px, line * px, clearance * px, air * px)
        assertFalse(reveal.barAside)
        bring(requester, reveal.rect(400f * px))
        val shown = compose.onNodeWithTag("field").getBoundsInRoot()
        val under = compose.onNodeWithTag("line").getBoundsInRoot()
        assertTrue(shown.top.value >= upBar - 0.5f)
        assertTrue(under.bottom.value <= viewport - clearance + 0.5f)
    }
}
