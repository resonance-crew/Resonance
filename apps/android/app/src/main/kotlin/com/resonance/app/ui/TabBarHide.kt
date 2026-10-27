package com.resonance.app.ui

import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * Whether the phone's tab bar has slid out of view for reading (round 16 §2) — the home feed's
 * alone: 24 of continuous reading down, past the feed's first 80, sends it below the screen's edge;
 * 12 back up, reaching the top or the end, a tap on the feed's tab (back to the top), another tab,
 * a page pushed over the feed or coming back to the app bring it back. It never hides while TalkBack
 * or Switch Access is on ([allowed]). The rule itself is [TabBarHideRule]; this holds its state for
 * the shell (MainTabs draws the bar, the feed reports its scrolling).
 */
@Stable
class TabBarAutoHide {
    var hidden by mutableStateOf(false)
        private set
    /** Hiding is allowed at all: false while a screen reader or switch access drives the phone. */
    var allowed by mutableStateOf(true)
        internal set
    private val rule = TabBarHideRule()

    /** Brings the bar back (and starts counting afresh). */
    fun show() {
        rule.reset()
        hidden = false
    }

    /** The feed scrolled by [readingDown] px (positive: toward its end); see [TabBarHideRule.scrolled]. */
    fun scrolled(readingDown: Float, pastLead: Boolean, atTop: Boolean, atEnd: Boolean, hideAfter: Float, showAfter: Float) {
        hidden = rule.scrolled(hidden, readingDown, pastLead, atTop, atEnd, hideAfter, showAfter, allowed)
    }
}

/**
 * The tab bar's hide-on-scroll rule (round 16 §2), with no screen: reading down counts while the
 * list is past its lead ([pastLead]: its first 80); [hideAfter] of it unbroken hides the bar. Reading
 * back up counts too; [showAfter] of it brings the bar back. A change of direction starts the other
 * count afresh. At the top or the end the bar is always shown, and never hidden when not [allowed].
 */
internal class TabBarHideRule {
    private var down = 0f
    private var up = 0f

    fun reset() {
        down = 0f
        up = 0f
    }

    /** Whether the bar is hidden after a scroll of [readingDown] px, from [hidden]. */
    fun scrolled(
        hidden: Boolean,
        readingDown: Float,
        pastLead: Boolean,
        atTop: Boolean,
        atEnd: Boolean,
        hideAfter: Float,
        showAfter: Float,
        allowed: Boolean,
    ): Boolean {
        if (!allowed || atTop || atEnd) {
            reset()
            return false
        }
        when {
            readingDown > 0f -> {
                up = 0f
                down = if (pastLead) down + readingDown else 0f
                if (!hidden && down >= hideAfter) return true
            }
            readingDown < 0f -> {
                down = 0f
                up -= readingDown
                if (hidden && up >= showAfter) {
                    up = 0f
                    return false
                }
            }
        }
        return hidden
    }
}

/** The shell's auto-hide, for the page that may hide the bar (the phone's home feed); null where nothing hides it. */
internal val LocalTabBarAutoHide = staticCompositionLocalOf<TabBarAutoHide?> { null }

/** Reading down this far, unbroken, hides the bar … */
internal val TabBarHideAfter = 24.dp
/** … and back up this far brings it back. */
internal val TabBarShowAfter = 12.dp
/** Hiding starts only past the feed's first this-much of content. */
internal val TabBarHideLead = 80.dp

/**
 * The feed's side of [TabBarAutoHide]: a nested-scroll listener that reports what [list] scrolled
 * (never consuming any), and the bar shown again whenever the list reaches its top or its end.
 */
@Composable
internal fun rememberTabBarHiding(list: LazyListState, hide: TabBarAutoHide): NestedScrollConnection {
    val density = LocalDensity.current
    val hideAfter = with(density) { TabBarHideAfter.toPx() }
    val showAfter = with(density) { TabBarShowAfter.toPx() }
    val lead = with(density) { TabBarHideLead.toPx() }
    LaunchedEffect(list, hide) {
        snapshotFlow { !list.canScrollBackward || !list.canScrollForward }.collect { edge -> if (edge) hide.show() }
    }
    return remember(list, hide, hideAfter, showAfter, lead) {
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                if (consumed.y != 0f) {
                    val pastLead = list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > lead
                    hide.scrolled(-consumed.y, pastLead, !list.canScrollBackward, !list.canScrollForward, hideAfter, showAfter)
                }
                return Offset.Zero
            }
        }
    }
}

/**
 * Whether a screen reader (TalkBack: touch exploration) or Switch Access drives the phone now —
 * then the tab bar never hides (round 16 §2). Followed live as either is turned on or off.
 */
@Composable
internal fun rememberAssistiveNavigation(): State<Boolean> {
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(AccessibilityManager::class.java) }
    val on = remember(manager) { mutableStateOf(assistiveNavigation(manager)) }
    DisposableEffect(manager) {
        val state = AccessibilityManager.AccessibilityStateChangeListener { on.value = assistiveNavigation(manager) }
        val touch = AccessibilityManager.TouchExplorationStateChangeListener { on.value = assistiveNavigation(manager) }
        manager?.addAccessibilityStateChangeListener(state)
        manager?.addTouchExplorationStateChangeListener(touch)
        onDispose {
            manager?.removeAccessibilityStateChangeListener(state)
            manager?.removeTouchExplorationStateChangeListener(touch)
        }
    }
    return on
}

private fun assistiveNavigation(manager: AccessibilityManager?): Boolean {
    if (manager == null || !manager.isEnabled) return false
    if (manager.isTouchExplorationEnabled) return true
    return runCatching {
        manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.id.contains("switchaccess", ignoreCase = true) }
    }.getOrDefault(false)
}
