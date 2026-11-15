package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.api.models.TranslationResponse
import com.resonance.design.AppFonts
import com.resonance.design.ButtonLoader
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryTranslation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What the translate line says (round 25 §F2): its states, in the table's order. */
enum class TranslateState {
    /** 翻譯成中文 / Translate to English. */
    Offer,
    /** 翻譯中⋯, the loader in the globe's place. */
    Working,
    /** 已由 AI 翻譯 · 顯示原文: the translation shows. */
    Translated,
    /** 顯示翻譯: the original shows, a translation in hand. */
    Original,
    /** 沒有翻好，再試一次. */
    Failed,
    /** 今天的翻譯次數用完了: no control. */
    Spent,
}

/**
 * A card page's translation (round 25 §F2–F4), plain state so its rules are tested without a screen: what the line
 * says ([state]), what the page shows ([shownTitle], [shownStory]: the translation's while [showing]), and the auto
 * rule — with the switch on, the page asks as it opens, shows the original meanwhile with 翻譯中⋯, and when the
 * translation comes swaps if the line is in view; scrolled past it nothing moves and [onReadyOutOfView] is told (the
 * shell's 「譯文好了 · 看譯文」 toast). 顯示原文 keeps the card original for the rest of the visit: the auto rule never
 * swaps it back.
 */
@Stable
class StoryTranslator(
    /** The language it goes into (the interface's). */
    val target: String,
    private val originalTitle: String,
    private val originalStory: String,
    private val scope: CoroutineScope,
    private val fetch: suspend (to: String) -> TranslationResponse,
    /** The translated story's blocks, read off the main thread (a story of up to 30,000 characters). */
    private val parse: suspend (story: String) -> List<StoryBlock> = { withContext(Dispatchers.Default) { StoryParser.parse(it) } },
) {
    var state by mutableStateOf(TranslateState.Offer)
        private set
    var translation by mutableStateOf<TranslationResponse?>(null)
        private set
    /**
     * The translation's story as blocks, parsed before the translation is ever shown: the page lays the translated
     * article out whole at the frame after a swap (the toast's 看譯文 keeps the reader's place by measuring it then).
     */
    var translatedBlocks by mutableStateOf<List<StoryBlock>?>(null)
        private set
    /** Whether the page shows the translation now. */
    val showing: Boolean get() = state == TranslateState.Translated && translation != null
    val shownTitle: String get() = if (showing) translation!!.title else originalTitle
    val shownStory: String get() = if (showing) translation!!.story else originalStory
    /** The blocks the page draws: the translation's while it shows, else null (the page's own, the original's). */
    val shownBlocks: List<StoryBlock>? get() = if (showing) translatedBlocks else null
    /** 顯示原文 was pressed: this card stays original for the visit, whatever the switch says. */
    var keptOriginal by mutableStateOf(false)
        private set
    /** How many times the text swapped (either way): what was measured from the story is measured again after each. */
    var swaps by mutableStateOf(0)
        private set
    private var asking: Job? = null

    /** Whether it translates this text (the page read again with the same story keeps it, and 顯示原文). */
    fun isFor(title: String, story: String): Boolean = title == originalTitle && story == originalStory

    /** A tap on the line's control, by what it says. */
    fun tap() {
        when (state) {
            TranslateState.Offer, TranslateState.Failed -> ask(auto = false, inView = { true }, onReadyOutOfView = {})
            TranslateState.Translated -> {
                keptOriginal = true
                swap(TranslateState.Original)
            }
            TranslateState.Original -> swap(TranslateState.Translated)
            TranslateState.Working, TranslateState.Spent -> {}
        }
    }

    /**
     * The switch is on (§F4): asks as the page opens — once, and never after 顯示原文. [inView] says, when it comes,
     * whether the line is on screen, and [present] whether the page is still there to be told (composed and resumed):
     * a slow answer that comes after the reader has left shows no toast on another screen — the line then says
     * 顯示翻譯 when they come back.
     */
    fun auto(inView: () -> Boolean, present: () -> Boolean = { true }, onReadyOutOfView: () -> Unit) {
        if (keptOriginal || state != TranslateState.Offer) return
        ask(auto = true, inView = inView, onReadyOutOfView = { if (present()) onReadyOutOfView() })
    }

    /** The toast's 看譯文: the translation, swapped in now. */
    fun showReady() {
        if (state == TranslateState.Original && translation != null) swap(TranslateState.Translated)
    }

    private fun swap(to: TranslateState) {
        state = to
        swaps++
    }

    private fun ask(auto: Boolean, inView: () -> Boolean, onReadyOutOfView: () -> Unit) {
        if (asking?.isActive == true) return
        translation?.let {
            swap(TranslateState.Translated)
            return
        }
        state = TranslateState.Working
        asking = scope.launch {
            try {
                val got = fetch(target)
                val blocks = parse(got.story)
                translatedBlocks = blocks
                translation = got
                if (!auto || inView()) swap(TranslateState.Translated)
                else {
                    state = TranslateState.Original
                    onReadyOutOfView()
                }
            } catch (e: CancellationException) {
                state = TranslateState.Offer
                throw e
            } catch (e: ApiFailure) {
                state = if (e.status == 429) TranslateState.Spent else TranslateState.Failed
            } catch (e: Exception) {
                state = TranslateState.Failed
            }
        }
    }

    companion object {
        /** The line's target for [d] in the interface [interfaceTag] (§F3), or null: no line. */
        fun targetFor(d: CardDetail, interfaceTag: String): String? = StoryTranslation.lineTarget(
            published = d.card.publishedAt != null,
            public = d.card.visibility == FeedCard.Visibility.`public` && d.visibility == CardDetail.Visibility.`public`,
            isOwner = d.isOwner,
            title = d.card.title,
            story = d.story,
            interfaceTag = interfaceTag,
        )
    }
}

/** The words the line shows in [state]: the plain part (meta ink) and the control (accent ink), either may be absent. */
@Immutable
data class TranslateWords(val plain: String?, val control: String?)

/** §F2's table: the line's words in each state (the source language is never named). */
fun translateWords(state: TranslateState): TranslateWords = when (state) {
    TranslateState.Offer -> TranslateWords(null, L10n.Card.Translate.action)
    TranslateState.Working -> TranslateWords(L10n.Card.Translate.working, null)
    TranslateState.Translated -> TranslateWords(L10n.Card.Translate.done, L10n.Card.Translate.showOriginal)
    TranslateState.Original -> TranslateWords(null, L10n.Card.Translate.showTranslation)
    // After 「，」 / ", " the control goes on the sentence: "Couldn’t translate, try again" (a capital mid-line in English reads as a slip).
    TranslateState.Failed -> TranslateWords(
        L10n.Card.Translate.failed,
        L10n.Card.Translate.retry.let { if (Strings.language == Strings.Language.En) it.replaceFirstChar(Char::lowercaseChar) else it },
    )
    TranslateState.Spent -> TranslateWords(L10n.Card.Translate.spent, null)
}

/** The joint between the line's two parts: 「 · 」 after 已由 AI 翻譯, 「，」 / ", " after 沒有翻好. */
fun translateJoint(state: TranslateState, zh: Boolean): String = when (state) {
    TranslateState.Failed -> if (zh) "，" else ", "
    else -> " · "
}

/**
 * The translate line (round 25 §F2): a row of its own at the story's start column under the byline, in the meta
 * line's type — about 20 tall to the eye, 44 to the touch (its padding overlaps the gaps above and below, so the head
 * grows by about 20 + the gap); the plain words in the meta ink, the control's in the story links' accent ink, never
 * wrapping inside themselves (the row wraps between its two parts at large type). The globe at 16 leads in the idle
 * states; the small loader stands in its place while working. A polite announcement when the text swaps.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TranslateLine(translator: StoryTranslator, size: Float, gap: Dp, modifier: Modifier = Modifier) {
    val state = translator.state
    val words = translateWords(state)
    val zh = translator.target == StoryTranslation.ZH_TW
    val meta = AppFonts.body(size, lineHeight = 1.4f, color = Tokens.TextMuted)
    val control = AppFonts.body(size, 600, lineHeight = 1.4f, color = Tokens.ButtonOnTonal)
    // 44 to the touch, about 20 to the eye: the touch padding reaches into the gaps around it.
    val reach = ((44.dp - 20.dp) / 2).coerceAtMost(gap)
    FlowRow(
        modifier
            .fillMaxWidth()
            .overlapVertically(reach)
            .heightIn(min = 44.dp)
            .semantics {
                if (state == TranslateState.Translated || state == TranslateState.Original) liveRegion = LiveRegionMode.Polite
            },
        horizontalArrangement = Arrangement.spacedBy(0.dp),
        verticalArrangement = Arrangement.Center,
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.heightIn(min = 44.dp).padding(end = 6.dp), contentAlignment = Alignment.Center) {
            if (state == TranslateState.Working) ButtonLoader(Tokens.TextMuted, 16.dp)
            else OrganicIcon(IconName.Globe, size = 16.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
        }
        words.plain?.let { plain ->
            BasicText(
                if (words.control != null) plain + translateJoint(state, zh) else plain,
                style = meta, maxLines = 1, softWrap = false, overflow = TextOverflow.Visible,
                modifier = Modifier.heightIn(min = 44.dp).wrapContentHeight(Alignment.CenterVertically),
            )
        }
        words.control?.let { label ->
            BasicText(
                label, style = control, maxLines = 1, softWrap = false,
                modifier = Modifier
                    .heightIn(min = 44.dp)
                    .plainClickable(onClickLabel = label, role = Role.Button) { translator.tap() }
                    .wrapContentHeight(Alignment.CenterVertically),
            )
        }
    }
}

/** Takes [by] off the room it claims above and below (the touch padding laid over the gaps around it). */
private fun Modifier.overlapVertically(by: Dp): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    val d = by.roundToPx()
    layout(p.width, (p.height - 2 * d).coerceAtLeast(0)) { p.place(0, -d) }
}

/** What the feed's cards read of the switch and the viewer (round 25 §F7). */
@Immutable
data class SummaryReader(val viewerId: String?, val on: Boolean, val language: String)

internal val LocalSummaryReader = staticCompositionLocalOf { SummaryReader(null, false, "zh-TW") }
