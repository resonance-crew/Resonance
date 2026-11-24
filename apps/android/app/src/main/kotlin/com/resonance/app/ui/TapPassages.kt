package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.interaction.MutableInteractionSource
import com.resonance.design.DividerInk
import com.resonance.design.wavyRuleAbove
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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
 * The rows the dialog offers (§U1.3; round 31 §R1): the card's passages on a card offering two at least — while the
 * story shows in translation ([translated]), those of them the translation's answer places ([translation], by id), in
 * the card's order and with its ids, each in the translation's words — two at least, as for the original (the web's
 * `PASSAGES_MIN`); a translation that places fewer (or an answer from before round 31, with no `passages`) offers
 * nothing, as before round 31.
 */
internal fun offeredPassages(faces: TapFaces, translated: Boolean, translation: List<TapPassage>? = null): List<TapPassage> {
    if (!faces.offersPassages) return emptyList()
    if (!translated) return faces.passages
    val pieces = translation.orEmpty().associateBy { it.id }
    // The original's rule (the web's PASSAGES_MIN): two at least, or no dialog in translation.
    return faces.passages.mapNotNull { p -> pieces[p.id]?.let { p.copy(text = it.text) } }.takeIf { it.size >= 2 }.orEmpty()
}

/**
 * Whether a press opens the dialog (§U1.1, §U1.9; round 31 §R1): only one that turned the tap **on**, on a card offering
 * two passages at least — in translation, only when the translation places two of them at least ([offeredPassages]).
 * Taking the tap back opens nothing.
 */
internal fun passagesOpenOnPress(turnedOn: Boolean, faces: TapFaces, translated: Boolean, translation: List<TapPassage>? = null): Boolean =
    turnedOn && offeredPassages(faces, translated, translation).isNotEmpty()

/** A press on a row (§U1.7): that row's pick — or, pressed when it is the pick already, none. */
internal fun nextPick(current: String?, pressed: String): String? = if (current == pressed) null else pressed

/**
 * The row the dialog opens marked: the pick just pressed ([shown]); else, reopened from the reader's own row, the
 * current pick (§U3) — but never after the press that turned the tap on ([fromPress]), which starts with no pick on the
 * server (§P4.4) even while the page's copy still holds the old one (the off flip before it not answered yet).
 */
internal fun passagesMarked(shown: String?, current: String?, fromPress: Boolean): String? =
    shown ?: if (fromPress) null else current

/** What a pick that didn't go does (§U1.6). */
internal enum class PickFailure {
    /** 400 or 409 — the options changed, or the tap went: close quietly and read the card again, no toast (S12). */
    Stale,

    /** Anything else: 沒送出去，再試一次; the tap stays on, with the pick it had (the web's and iOS's). */
    Failed,
}

internal fun pickFailure(e: Exception): PickFailure =
    if (e is ApiFailure && (e.status == 400 || e.status == 409)) PickFailure.Stale else PickFailure.Failed

/**
 * Sends the reader's pick (§U1.5): **after** the tap's own PUT has answered ([pick]'s `after`, the tap's job) — and
 * not at all once the tap is off by then ([tapOn]: its PUT failed, or it was taken back). One request at a time, in
 * the order picked. [onPicked] hears the pick as the server now has it: after a 400 or 409 none; after any other failure
 * the one it still holds ([held], the page's copy, written back only once a request answered); [onStale] asks the page
 * to read the card again; [onFailed] shows the toast. Its requests run where [launch] puts them — the account's
 * scope, as the tap's ([TapSwitch]).
 */
internal class PassagePick(
    private val launch: (suspend CoroutineScope.() -> Unit) -> Job,
    private val send: suspend (String?) -> String?,
    private val tapOn: () -> Boolean,
    private val held: () -> String? = { null },
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
                when (pickFailure(e)) {
                    PickFailure.Stale -> {
                        onPicked(null)
                        onStale()
                    }
                    PickFailure.Failed -> {
                        // The server still has the pick from before this send: put it back, as the web and iOS do.
                        onPicked(held())
                        onFailed()
                    }
                }
                return@withLock
            }
            onPicked(now)
        }
    }
}

/**
 * A row's band in the dialog (the owner, 2026-11-21: 「这个选中的区块是延伸到这个 pop up 这个卡片的最左边和最右边的」):
 * the web's — uncut, the list widened to the paper's edges ([TapListModal]) and the paper clipping it to its wobble,
 * the pen line over it. Round 33 §Q2: the words [TapListInset] in — the title's edge, and 略過's at the other side, as
 * every row of the family.
 */
internal object PassageBand {
    /** Never the tablet's rounded cut: the band runs to the paper's edges. */
    const val cut = false

    /** From the paper's edge to a row's words (and from its check to the other edge): the family's 24 (28 + 12 before). */
    val wordsInset: Dp = TapListInset
}

/** Whether row [i] has a rule over it (§P2): between two rows — never above the first (nor under the last). */
internal fun passageRuleAbove(i: Int): Boolean = i > 0

/** The title to the first row (§P1: 10, as the spec measures it). */
internal val PassageTitleGap = 10.dp

/** 略過's touch target: the floating pill's (round 33 §Q3: 44 at least). */
internal val PassageSkipHeight = FloatingExitHeight

/** The list's tallest before it scrolls inside: min(560, 70 % of the window's height) — Wave 2 #3a: three passages of about 100 characters each (the web's too). */
internal fun passagesListMax(windowHeight: Dp): Dp = min(560f, windowHeight.value * 0.7f).dp

/**
 * The dialog (§U1.3): a centred [OrganicModal] — never a bottom sheet, never a popover — [readerListWidth] wide (400 on a
 * phone, 480 wider), titled 悄悄告訴作者，哪一段讓你有共鳴; the [passages] as banded rows from the paper's edge to its
 * edge ([PassageBand]), each a button with its words
 * in the story's type ([script]) at 16 with the story's leading, **wrapped in full** — never cut; 略過 floating at the
 * foot's end, the family's tonal pill ([TapListModal], round 33 §Q3), no ✕. [picked] (reopened from the reader's own row, §U1.7) rests in the press ink with its check, selected.
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

    val keys = passages.map { "passage:" + it.id }
    val below = bandsBelow(keys, ListBands.EndKey)
    val press = Tokens.TowardInk.copy(alpha = ListBands.PressAlpha)
    val rule = DividerInk
    // Round 32 §P1: one scroll region — the title, then the rows — at most [cap]; round 33 §Q3: 略過 floats over its
    // foot, never moving (the tap-passage flow presses it by its id).
    TapListModal(
        onDismiss, L10n.Card.Tap.passageTitle, seed = 47.0, exit = L10n.Card.Tap.passageSkip,
        maxWidth = readerListWidth(layout.cls), cap = cap,
        exitModifier = Modifier.flowTag("tap-passage-skip"),
        regionModifier = Modifier.flowTag("tap-passages"),
    ) {
        TapListTitle(L10n.Card.Tap.passageTitle)
        passages.forEachIndexed { i, p ->
            val source = remember(p.id) { MutableInteractionSource() }
            val isChosen = chosen == p.id
            Row(
                Modifier
                    .fillMaxWidth()
                    .then(if (i == focused) Modifier.focusRequester(first) else Modifier)
                    // §P2: a rule between two rows (never above the first), the words' start to their end; the
                    // row's own band washes over it.
                    .then(if (passageRuleAbove(i)) Modifier.wavyRuleAbove(PassageBand.wordsInset, rule, seed = 47.0 + i) else Modifier)
                    .listBand(keys[i], below[i], source, { false }, rest = if (isChosen) press else null, cut = PassageBand.cut)
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
                    .padding(horizontal = PassageBand.wordsInset, vertical = ListBands.RowPad),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BasicText(p.text, Modifier.weight(1f), style = words)
                if (isChosen) OrganicIcon(IconName.Check, size = 16.dp, color = Tokens.Text)
            }
        }
    }
}
