package com.resonance.design

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.AccessibilityManager
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

/**
 * The shell's one toast (trash.spec §5.2 and §6; the web's providers/ToastProvider + molecules/Toast,
 * iOS's ToastCenter): what the app says in passing — 已移到垃圾桶 · 復原, 已還原, a save that
 * failed — as an [OrganicPill] over the foot of the window. One at a time: a new one replaces the
 * one showing (which simply goes). Pages reach it through [LocalToasts]; the shell draws it once,
 * with [ToastHost], so it outlives the page that showed it (a trashed card's page popping, a tab
 * switching).
 *
 * A status stays [STATUS_MILLIS], one with an action [ACTION_MILLIS] — or what TalkBack's "time to
 * take action" asks for, when the person set it longer ([toastTimeoutMillis]); a finger, a mouse or a
 * keyboard's focus on it holds it, and it goes on with at least [RESUME_MILLIS] left. Anything a
 * toast says is also somewhere that stays (the trash shelf, the page itself), so its time is never
 * the only way back (WCAG 2.2.1). Safe to call from any thread.
 */
@Stable
class Toasts {
    /** What a toast offers to do about what it says — undo it, mostly. */
    @Immutable
    data class Action(
        /** The verb, set bold after the message (「復原」). */
        val label: String,
        /** The button's name for TalkBack: the visible words first (WCAG 2.5.3), then what it acts on (「已移到垃圾桶 · 復原〈title〉」). */
        val accessibilityLabel: String,
        val icon: IconName? = null,
        val onAction: () -> Unit,
    )

    /** One toast, as [show] made it. */
    @Immutable
    class Toast internal constructor(
        val id: Long,
        /** The words on the pill: one fragment, no full stop (「已還原」, 「已移到垃圾桶」). */
        val message: String,
        /** What TalkBack says instead, when the words alone aren't the whole of it (「〈title〉已移到垃圾桶」). */
        val announce: String?,
        val action: Action?,
    ) {
        /** What the live region speaks for it. */
        val spoken: String get() = announce ?: message
    }

    private var nextId = 0L

    /** The toast showing, or null. */
    var current: Toast? by mutableStateOf(null)
        private set

    /** Shows a toast in place of any showing (that one simply goes); returns its id. */
    fun show(message: String, announce: String? = null, action: Action? = null): Long {
        val toast = synchronized(this) { Toast(++nextId, message, announce, action) }
        current = toast
        return toast.id
    }

    /** Takes the toast down: the one with this [id], or whichever is showing. */
    fun dismiss(id: Long? = null) {
        val showing = current ?: return
        if (id == null || showing.id == id) current = null
    }

    /**
     * The action of the toast showing — it goes as its action runs. A toast already gone (fading
     * out, or replaced by a newer one) does nothing, as the web's inert leaving face does.
     */
    internal fun act(toast: Toast) {
        val action = toast.action ?: return
        if (current?.id != toast.id) return
        dismiss(toast.id)
        action.onAction()
    }

    companion object {
        /** How long a status stays: long enough to read. */
        const val STATUS_MILLIS = 4_000L
        /** How long a toast with an action stays: long enough to reach it. */
        const val ACTION_MILLIS = 8_000L
        /** What is left of a toast's time, at least, once the finger or focus that held it lets go. */
        const val RESUME_MILLIS = 2_000L
    }
}

/**
 * How long [toast] stays: [Toasts.STATUS_MILLIS] or [Toasts.ACTION_MILLIS], or longer when the
 * person's accessibility settings ask for more time ("Time to take action", which TalkBack and
 * Switch Access users set): the system's recommendation for a pill of words and a glyph, and a
 * control when it has an action.
 */
fun toastTimeoutMillis(toast: Toasts.Toast, accessibility: AccessibilityManager?): Long {
    val action = toast.action
    val base = if (action != null) Toasts.ACTION_MILLIS else Toasts.STATUS_MILLIS
    val recommended = accessibility?.calculateRecommendedTimeoutMillis(
        base,
        containsIcons = action?.icon != null,
        containsText = true,
        containsControls = action != null,
    ) ?: base
    return maxOf(base, recommended)
}

/**
 * The shell's toasts. Pages show one with `LocalToasts.current.show(…)`; outside a shell (a test, a
 * preview) the toast shown is simply never drawn.
 */
val LocalToasts = staticCompositionLocalOf { Toasts() }

/**
 * Where the shell's toast is drawn: bottom centre over everything the shell holds (under a dialog,
 * which is a window of its own), [bottom] above the navigation bar or the keyboard — the tab bar's
 * height and 12 when it shows; as wide as its words, at most 440 and never past 16 from either
 * edge. It never takes focus; Escape dismisses it while a keyboard's focus is on it.
 *
 * TalkBack hears every toast through one polite live region that is always there (so the first
 * one is heard too), cleared between toasts so the same words twice are said twice: it speaks the
 * toast's [Toasts.Toast.spoken]. A status pill is then hidden from TalkBack (the region has its
 * words); one with an action is a button named by its [Toasts.Action.accessibilityLabel], whose
 * click label is the verb.
 */
@Composable
fun ToastHost(toasts: Toasts, modifier: Modifier = Modifier, bottom: Dp = 16.dp) {
    val toast = toasts.current
    val accessibility = LocalAccessibilityManager.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val focused by source.collectIsFocusedAsState()
    // A mouse over it holds it too (a tablet's or a Chromebook's pointer, as the web's hover does).
    val hovered by source.collectIsHoveredAsState()
    val held = rememberUpdatedState(pressed || focused || hovered)

    // Its time: counted down in short steps, standing still while held.
    LaunchedEffect(toast?.id) {
        val shown = toast ?: return@LaunchedEffect
        var left = toastTimeoutMillis(shown, accessibility)
        while (left > 0) {
            if (held.value) {
                snapshotFlow { held.value }.first { !it }
                left = maxOf(left, Toasts.RESUME_MILLIS)
                continue
            }
            val step = minOf(left, TICK_MILLIS)
            delay(step)
            left -= step
        }
        toasts.dismiss(shown.id)
    }

    // The live region: emptied, then given the new toast's words a frame later, so each toast is a change.
    var spoken by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(toast?.id) {
        spoken = null
        val shown = toast ?: return@LaunchedEffect
        withFrameNanos { }
        spoken = shown.spoken
    }

    Box(
        modifier
            .fillMaxWidth()
            // Over the navigation bar, and over the keyboard when one is up (a toast behind it would say nothing).
            .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
            .padding(start = 16.dp, end = 16.dp, bottom = bottom),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Box(
            Modifier
                .size(1.dp)
                .semantics {
                    liveRegion = LiveRegionMode.Polite
                    spoken?.let { contentDescription = it }
                },
        )
        AnimatedContent(
            targetState = toast,
            contentKey = { it?.id },
            contentAlignment = Alignment.BottomCenter,
            transitionSpec = {
                (fadeIn(tween(ENTER_MILLIS)) + scaleIn(tween(ENTER_MILLIS), initialScale = 0.9f)) togetherWith fadeOut(tween(EXIT_MILLIS))
            },
            label = "toast",
        ) { shown ->
            if (shown == null) return@AnimatedContent
            val action = shown.action
            OrganicPill(
                label = shown.message,
                modifier = Modifier
                    .widthIn(max = MAX_WIDTH)
                    .onKeyEvent { e ->
                        if (e.key == Key.Escape && e.type == KeyEventType.KeyDown) {
                            toasts.dismiss(shown.id)
                            true
                        } else {
                            false
                        }
                    },
                size = PillSize.Toast,
                icon = action?.icon,
                verb = action?.label,
                accessibilityLabel = action?.accessibilityLabel,
                hiddenFromAccessibility = action == null,
                onClickLabel = action?.label,
                interactionSource = source,
                onClick = if (action != null) ({ toasts.act(shown) }) else null,
            )
        }
    }
}

private const val TICK_MILLIS = 250L
private const val ENTER_MILLIS = 180
private const val EXIT_MILLIS = 140
private val MAX_WIDTH = 440.dp
