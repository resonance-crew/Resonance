package com.resonance.app.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.api.models.Author
import com.resonance.api.models.TapPerson
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.LocalWindowLayout
import com.resonance.design.OrganicModal
import com.resonance.design.StoryType
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.TapApi
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * What a row of the sentence's people says under the pen name (round 29 §S4.2): the note's first line (2 lines) when
 * they left one on this named card — and never the quote, which heads the dialog.
 */
internal fun pickedRowLines(person: TapPerson, anonymous: Boolean): TapRowLines = TapRowLines(excerpt = tapRowExcerpt(person, anonymous))

/**
 * The people who picked one sentence, a page at a time (§S4.4): the author's list read with `?passage=` — the same rows,
 * order (newest first) and pages, only that sentence's pickers.
 */
internal fun pickedPeople(taps: TapApi, cardId: String, passage: String): TapPeople =
    TapPeople { token -> taps.taps(cardId, token, passage = passage) }

/**
 * Who resonated with this sentence (round 29 §S4 — the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句。那作者
 * 的話他可能就可以多看一下那一個人回覆的小紙條」): opened by a sentence's faces or its wash on the author's own page.
 */
@Composable
internal fun PickedPeople(
    session: Session,
    cardId: String,
    mark: PassageMark,
    type: StoryType,
    anonymous: Boolean,
    onDismiss: () -> Unit,
    open: (Route) -> Unit,
) {
    val list = remember(cardId, mark.id) { pickedPeople(session.taps, cardId, mark.id) }
    // Round 32 §P3, round 33 §Q1: the dialog is drawn once its first page has answered — or, a slow one, after the
    // family's wait ([TAP_LIST_OPEN_WAIT_MS]) with the sentence's own faces as its rows ([TapRows]' expected) — never
    // first at another height.
    if (rememberFirstPageReady(list)) PickedPeopleDialog(list, mark.picked.text, type, anonymous, onDismiss, expected = mark.picked.people) { p ->
        onDismiss()
        open(tapRowRoute(p, anonymous))
    }
}

/**
 * The dialog as it is drawn (§S4.1–3): a centred [OrganicModal] — the who-resonated dialog's shell and widths
 * ([readerListWidth]: a phone's 400, 480 wider), never a sheet, never a popover — titled `card.tap.pickedTitle`; the
 * [sentence] once, 「…」, in the story's [type] at 16 sp, muted, in full, at the story's compact leading at every width
 * ([pickedSentenceLeading]) — [PickedTitleGap] under the title, [PickedRowsGap] over the rows (§S12: the web's and iOS's
 * measures); that sentence's people, newest first, as the
 * author's list draws a row (a face 36, the pen name, the note's excerpt) — each [onRow] where that row leads in the
 * author's list ([tapRowRoute]); 顯示更多 for the next page; the small 關閉 floating at the foot's end ([TapListModal]).
 */
@Composable
internal fun PickedPeopleDialog(
    list: TapPeople,
    sentence: String,
    type: StoryType,
    anonymous: Boolean,
    onDismiss: () -> Unit,
    /** Who the first page will hold, when known (the sentence's faces): its rows while it is read (§P3). */
    expected: List<Author>? = null,
    onRow: (TapPerson) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val quote = AppFonts.style(type.bodyFamily, tapListText(LocalWindowLayout.current.cls).sentence, type.bodyWeight, pickedSentenceLeading(type), Tokens.TextMuted, letterSpacing = type.bodyTracking.em)
    // The flow closes it by its id: the backdrop is named 關閉 too (maestro/flows/tap-picked.yaml).
    TapListModal(
        onDismiss, L10n.Card.Tap.pickedTitle, seed = 53.0, exit = L10n.Native.close,
        maxWidth = readerListWidth(LocalWindowLayout.current.cls), exitModifier = Modifier.flowTag(PICKED_CLOSE_TAG),
    ) {
        // The title, the sentence and the rows: 10 and 12 between them (§S12), all in the one scroll region.
        TapListTitle(L10n.Card.Tap.pickedTitle)
        // The flows find the dialog by it (maestro/flows/tap-picked.yaml).
        BasicText(
            L10n.Card.Tap.passageQuote(sentence),
            Modifier.fillMaxWidth().padding(horizontal = TapListInset).flowTag("tap-picked"),
            style = quote,
        )
        Spacer(Modifier.height(PickedRowsGap))
        TapRows(list, TapRowMeasure.dialog(LocalWindowLayout.current.cls), lines = { pickedRowLines(it, anonymous) }, expected = expected, onRow = onRow)
        if (showsMore(list)) TapListMore { scope.launch { list.more() } }
    }
}

/** The pop-up's title to its sentence (round 29 §S12: 10 on the web, iOS and here): the family's title gap. */
internal val PickedTitleGap = TapListTitleGap

/** The pop-up's sentence to its rows (§S12: 12). */
internal val PickedRowsGap = 12.dp

/** The sentence's leading in the pop-up (§S12): the story's compact one at every width — 1.8 for CJK, 1.6 for Latin. */
internal fun pickedSentenceLeading(type: StoryType): Float = if (type.cjk) Tokens.StoryLeadingCompact else Tokens.StoryLeadingLatinCompact

/** The flows' name of the pop-up's 關閉 (maestro/flows/tap-picked.yaml; iOS sets the same id). */
internal const val PICKED_CLOSE_TAG = "tap-picked-close"
