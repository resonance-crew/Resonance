package com.resonance.app.ui

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.api.models.TapPassage
import com.resonance.design.AppFonts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicModal
import com.resonance.design.StoryType
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryScript
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.math.min

/**
 * Round 27 §U1 — after a reader turns 共振 on, which part of the story stayed with them (the owner: 「在点击共振之后呢，
 * 还可以出现一个可能一个 pop ups，然后里面可以让使用者去选择…他文章里面哪一个部分有共鸣」). The web's TapPassages and
 * iOS's TapPassages.swift are the twins.
 */
internal object TapPassagesTiming {
    /** From the press that turned 共振 on to the dialog: the segment has filled and the face slid in (150–160). */
    const val OPEN_MS = 240L

    /** From a row pressed (its ink and check shown) to the dialog closing. */
    const val CLOSE_MS = 300L

    fun openDelay(reduced: Boolean): Long = if (reduced) 0L else OPEN_MS
    fun closeDelay(reduced: Boolean): Long = if (reduced) 0L else CLOSE_MS
}

/**
 * Whether a press opens the dialog (§U1.1, §U1.9): only one that turned the tap **on**, on a card offering two passages
 * at least, while the story is not shown in translation. Taking the tap back opens nothing.
 */
internal fun passagesOpenOnPress(turnedOn: Boolean, faces: TapFaces, translated: Boolean): Boolean =
    turnedOn && faces.offersPassages && !translated

/** A press on a row (§U1.7): that row's pick — or, pressed when it is the pick already, none. */
internal fun nextPick(current: String?, pressed: String): String? = if (current == pressed) null else pressed

/** What a pick that didn't go does (§U1.6). */
internal enum class PickFailure {
    /** 400 or 409 — the options changed, or the tap went: close quietly and read the card again, no toast (S12). */
    Stale,

    /** Anything else: 沒送出去，再試一次; the tap stays on, with no passage. */
    Failed,
}

internal fun pickFailure(e: Exception): PickFailure =
    if (e is ApiFailure && (e.status == 400 || e.status == 409)) PickFailure.Stale else PickFailure.Failed

/**
 * Sends the reader's pick (§U1.5): **after** the tap's own PUT has answered ([pick]'s `after`, the tap's job) — and
 * not at all once the tap is off by then ([tapOn]: its PUT failed, or it was taken back). One request at a time, in
 * the order picked. [onPicked] hears the pick as the server now has it (null after a failure); [onStale] asks the page
 * to read the card again; [onFailed] shows the toast. Its requests run where [launch] puts them — the account's
 * scope, as the tap's ([TapSwitch]).
 */
internal class PassagePick(
    private val launch: (suspend CoroutineScope.() -> Unit) -> Job,
    private val send: suspend (String?) -> String?,
    private val tapOn: () -> Boolean,
    private val onPicked: (String?) -> Unit,
    private val onStale: () -> Unit = {},
    private val onFailed: () -> Unit = {},
) {
    private val lock = Mutex()

    fun pick(passage: String?, after: Job? = null): Job = launch {
        after?.join()
        lock.withLock {
            if (!tapOn()) return@withLock
            val now = try {
                send(passage)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onPicked(null)
                when (pickFailure(e)) {
                    PickFailure.Stale -> onStale()
                    PickFailure.Failed -> onFailed()
                }
                return@withLock
            }
            onPicked(now)
        }
    }
}

/** The list's tallest before it scrolls inside: min(420, 55 % of the window's height) — the reader list's cap. */
internal fun passagesListMax(windowHeight: Dp): Dp = min(420f, windowHeight.value * 0.55f).dp

/**
 * The dialog (§U1.3): a centred [OrganicModal] — never a bottom sheet, never a popover — [readerListWidth] wide (400 on a
 * phone, 480 wider), titled 悄悄告訴作者，哪一段讓你有共鳴; the [passages] as banded rows, each a button with its words
 * in the story's type ([script]) at 16 with the story's leading, **wrapped in full** — never cut; 略過 at the foot's end,
 * no ✕. [picked] (reopened from the reader's own row, §U1.7) rests in the press ink with its check, selected.
 *
 * A press on a row ([nextPick]) holds its ink and check at once, hands the pick to [onPick], and closes 300 later (at once
 * under [reducedMotion]). The backdrop, back and 略過 close it ([onDismiss]) with no pick. [hold]: the screenshots'
 * `passage-picked` — the dialog stays open on the row pressed.
 */
@Composable
internal fun TapPassages(
    passages: List<TapPassage>,
    picked: String?,
    script: StoryScript,
    reducedMotion: Boolean,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
    hold: Boolean = false,
) {
    val layout = LocalWindowLayout.current
    val type = StoryType.of(script, layout.cls)
    val words = AppFonts.style(type.bodyFamily, 16f, type.bodyWeight, type.bodyLeading, Tokens.Text, letterSpacing = type.bodyTracking.em)
    val cap = passagesListMax(LocalConfiguration.current.screenHeightDp.dp)
    var chosen by remember { mutableStateOf(picked?.takeIf { id -> passages.any { it.id == id } }) }
    var closing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val first = remember { FocusRequester() }
    val focused = passages.indexOfFirst { it.id == chosen }.coerceAtLeast(0)
    // Focus lands on the first row, or the picked one (S10).
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }

    OrganicModal(onDismiss, L10n.Card.Tap.passageTitle, seed = 47.0, closeLabel = L10n.Card.Tap.passageSkip, maxWidth = readerListWidth(layout.cls)) {
        ModalTitle(L10n.Card.Tap.passageTitle)
        val keys = passages.map { "passage:" + it.id }
        val below = bandsBelow(keys, ListBands.EndKey)
        val press = Tokens.TowardInk.copy(alpha = ListBands.PressAlpha)
        Column(
            Modifier
                .fillMaxWidth()
                .flowTag("tap-passages")
                .heightIn(max = cap)
                .verticalScroll(rememberScrollState()),
        ) {
            passages.forEachIndexed { i, p ->
                val source = remember(p.id) { MutableInteractionSource() }
                val isChosen = chosen == p.id
                Row(
                    Modifier
                        .fillMaxWidth()
                        .then(if (i == focused) Modifier.focusRequester(first) else Modifier)
                        .listBand(keys[i], below[i], source, { false }, rest = if (isChosen) press else null, cut = true)
                        .flowTag("tap-passage-$i")
                        .plainClickable(role = Role.Button) {
                            if (closing) return@plainClickable
                            val next = nextPick(chosen, p.id)
                            chosen = next
                            onPick(next)
                            if (!hold) {
                                closing = true
                                scope.launch {
                                    delay(TapPassagesTiming.closeDelay(reducedMotion))
                                    onDismiss()
                                }
                            }
                        }
                        .semantics { selected = isChosen }
                        .padding(horizontal = TapRowMeasure.Dialog.inset, vertical = ListBands.RowPad),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    BasicText(p.text, Modifier.weight(1f), style = words)
                    if (isChosen) OrganicIcon(IconName.Check, size = 16.dp, color = Tokens.Text)
                }
            }
        }
        // 略過: the one way out at the foot's end, no ✕.
        val skipTag = Modifier.flowTag("tap-passage-skip")
        ModalCloseButton(L10n.Card.Tap.passageSkip, onDismiss, buttonModifier = skipTag)
    }
}
