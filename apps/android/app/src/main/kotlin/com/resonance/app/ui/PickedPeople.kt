package com.resonance.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.em
import com.resonance.api.models.TapPerson
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.LocalWindowLayout
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicModal
import com.resonance.design.StoryType
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.TapApi
import com.resonance.kit.l10n.L10n
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
    LaunchedEffect(list) { list.first() }
    PickedPeopleDialog(list, mark.picked.text, type, anonymous, onDismiss) { p ->
        onDismiss()
        open(tapRowRoute(p, anonymous))
    }
}

/**
 * The dialog as it is drawn (§S4.1–3): a centred [OrganicModal] — the who-resonated dialog's shell and widths
 * ([readerListWidth]: a phone's 400, 480 wider), never a sheet, never a popover — titled `card.tap.pickedTitle`; the
 * [sentence] once, 「…」, in the story's [type] at 16, muted, in full; that sentence's people, newest first, as the
 * author's list draws a row (a face 36, the pen name, the note's excerpt) — each [onRow] where that row leads in the
 * author's list ([tapRowRoute]); 顯示更多 for the next page; the small 關閉 at the foot's end.
 */
@Composable
internal fun PickedPeopleDialog(
    list: TapPeople,
    sentence: String,
    type: StoryType,
    anonymous: Boolean,
    onDismiss: () -> Unit,
    onRow: (TapPerson) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val quote = AppFonts.style(type.bodyFamily, 16f, type.bodyWeight, type.bodyLeading, Tokens.TextMuted, letterSpacing = type.bodyTracking.em)
    OrganicModal(onDismiss, L10n.Card.Tap.pickedTitle, seed = 53.0, closeLabel = L10n.Native.close, maxWidth = readerListWidth(LocalWindowLayout.current.cls)) {
        ModalTitle(L10n.Card.Tap.pickedTitle)
        // The flows find the dialog by it (maestro/flows/tap-picked.yaml).
        BasicText(L10n.Card.Tap.passageQuote(sentence), Modifier.fillMaxWidth().flowTag("tap-picked"), style = quote)
        TapRows(list, TapRowMeasure.Dialog, lines = { pickedRowLines(it, anonymous) }, onRow = onRow)
        if (showsMore(list)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                OrganicButton(L10n.Home.moreBtn, variant = ButtonVariant.Tonal, small = true) { scope.launch { list.more() } }
            }
        }
        // The flow closes it by this id: the backdrop is named 關閉 too (maestro/flows/tap-picked.yaml).
        ModalCloseButton(L10n.Native.close, onDismiss, buttonModifier = Modifier.flowTag("tap-picked-close"))
    }
}
