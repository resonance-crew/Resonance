package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.AppFonts
import com.resonance.design.ModalActionMinWidth
import com.resonance.design.ModalActionsTop
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicModal
import com.resonance.design.QuietButton
import com.resonance.design.QuietButtonPadX
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryLinks

/** What the link sheet opens on: the selection's link (null: a new one), whether 卡片 is offered, and the choice it starts with. */
internal data class LinkSheetRequest(val link: IslandLink?, val canCard: Boolean, val display: LinkDisplay)

/**
 * The link sheet's first choice (round 16 §6): an existing link's own way of showing; for a new one, 卡片
 * on an empty line — where only a card can stand alone — and 文字 when words were selected (or where no
 * card can stand at all).
 */
internal fun linkSheetDisplay(link: IslandLink?, canCard: Boolean, wordsSelected: Boolean): LinkDisplay = when {
    link != null -> if (link.display == LinkDisplay.Card && canCard) LinkDisplay.Card else LinkDisplay.Text
    canCard && !wordsSelected -> LinkDisplay.Card
    else -> LinkDisplay.Text
}

/**
 * The writer's link editor (round 16 §6, round 17 §6.2): the app's modal — the confirmations' own card in the
 * middle of the room above the keyboard, 400 wide at most, no ✕ (a tap beside it and Back close it), no sheet at
 * the window's foot. Its title says what it does — 插入連結 for a new link, 編輯連結 for the caret's — then the
 * address across the width, focused with its text selected as it opens (the clipboard is never read on opening,
 * only on an explicit paste); then, only where the link is, or will be, alone in its paragraph
 * ([LinkSheetRequest.canCard]), 顯示為 on a line of its own over 卡片 | 文字 (the publish step's 卡片類型 control);
 * and at its foot 移除連結 at the start (editing a link; a quiet word, round 17 review D5 — it takes only the link
 * away) · 完成 at the end. The field, the choice and 完成 share one height, [LinkDialogControl]. 完成 — or the keyboard's Done — takes
 * only what the link rules take ([StoryLinks.linkTarget]: http(s); a bare `www.…` or `example.com/x` gets
 * `https://`); anything else says 這不是可以連結的網址 under the field and links nothing. [onApply] hands the
 * address and the choice to the island; [onRemove] unlinks; [onDismiss] closes without a change. Whichever way it
 * closes, the writer hands the story its caret, keyboard and bar back.
 */
@Composable
internal fun StoryLinkDialog(
    request: LinkSheetRequest,
    onApply: (String, LinkDisplay) -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    val start = remember {
        request.link?.href ?: (if (com.resonance.app.BuildConfig.DEBUG) com.resonance.app.DebugLaunch.linkDraft else null).orEmpty()
    }
    // The address the caret's link has (or the debug draft), all of it selected: typing replaces it, a tap places the caret.
    var field by remember { mutableStateOf(TextFieldValue(start, TextRange(0, start.length))) }
    val address = field.text
    var display by remember { mutableStateOf(request.display) }
    var invalid by remember { mutableStateOf(false) }
    // Typing again takes the refusal back until the next 完成.
    LaunchedEffect(address) { invalid = false }
    val apply = {
        val target = StoryLinks.linkTarget(address)
        if (target == null) invalid = true
        else onApply(target, if (request.canCard) display else LinkDisplay.Text)
    }
    // The field has the focus as the modal opens, the keyboard with it — no tap to start typing (round 16 review F10).
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        // The dialog's window is attached a frame after it is composed.
        withFrameNanos { }
        runCatching { focus.requestFocus() }
    }
    val title = linkDialogTitle(request)
    var focused by remember { mutableStateOf(false) }
    OrganicModal(onDismiss, title, seed = 37.0, closeLabel = L10n.Write.Editor.CardModal.cancel, maxWidth = LinkDialogWidth) {
        ModalTitle(title)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val text = AppFonts.body(15f, lineHeight = 1.6f)
            val placeholder = L10n.Write.Editor.linkPlaceholder
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = LinkDialogControl)
                    .fieldSurface(41.0, { focused })
                    .padding(horizontal = Tokens.FieldPadX.dp, vertical = LinkFieldPadY),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (address.isEmpty()) BasicText(placeholder, style = AppFonts.obliqueUnlessCjk(AppFonts.body(15f, lineHeight = 1.6f, color = Tokens.Placeholder), placeholder), maxLines = 1, overflow = TextOverflow.Ellipsis)
                BasicTextField(
                    field, { field = it },
                    textStyle = text,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                    // Enter is 完成.
                    keyboardActions = KeyboardActions(onDone = { if (address.isNotBlank()) apply() }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focus)
                        .onFocusChanged { focused = it.isFocused }
                        .semantics { contentDescription = placeholder },
                )
            }
            if (invalid) BasicText(
                L10n.Write.Editor.linkInvalid,
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = Tokens.Danger),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (request.canCard) {
            // 顯示為 on a line of its own, its control under it across the width, as the publish step sets 卡片類型.
            Column(Modifier.padding(top = LinkDialogChoiceLead), verticalArrangement = Arrangement.spacedBy(PublishLabelGap)) {
                BasicText(
                    L10n.Write.Editor.linkShowAs,
                    style = AppFonts.body(Tokens.LabelSize, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
                    maxLines = 1,
                )
                SegmentedActionBar(
                    listOf(LinkDisplay.Card to L10n.Write.Editor.linkAsCard, LinkDisplay.Text to L10n.Write.Editor.linkAsText).map { (choice, label) ->
                        val on = display == choice
                        Segment(
                            choice.key, label, if (choice == LinkDisplay.Card) IconName.Frame else IconName.Link,
                            fill = if (on) Tokens.ButtonTonal else null,
                            textColor = if (on) Tokens.ButtonOnTonal else Tokens.SegmentIdleInk,
                            press = Tokens.TowardInk.copy(alpha = 0.05f),
                            selected = on,
                        ) { display = choice }
                    },
                    Modifier.fillMaxWidth(),
                    fill = Tokens.CreamDark,
                    minHeight = LinkDialogControl,
                )
            }
        }
        // The foot: 移除連結 at the start (a link to take away: a quiet word, its words on the column's edge), 完成 at
        // the end — both the controls' one height.
        Row(Modifier.fillMaxWidth().padding(top = ModalActionsTop), verticalAlignment = Alignment.CenterVertically) {
            if (linkDialogRemoves(request)) QuietButton(
                L10n.Write.Editor.linkRemove, Modifier.offset(x = -QuietButtonPadX), minHeight = LinkDialogControl, onClick = onRemove,
            )
            Spacer(Modifier.weight(1f))
            // Nothing typed, nothing to link: 完成 waits for an address (as iOS's).
            OrganicButton(
                L10n.Write.Editor.linkApply, Modifier.heightIn(min = LinkDialogControl).widthIn(min = ModalActionMinWidth),
                enabled = address.isNotBlank(), small = true, onClick = apply,
            )
        }
    }
}

/** The link editor's title: 編輯連結 for the caret's link, 插入連結 for a new one. */
internal fun linkDialogTitle(request: LinkSheetRequest): String =
    if (request.link != null) L10n.Write.Editor.linkEdit else L10n.Write.Editor.insertLink

/** Whether the foot offers 移除連結: only for a link already there. */
internal fun linkDialogRemoves(request: LinkSheetRequest): Boolean = request.link != null

/** The link editor's card: 400 wide at most (min(400, the window − 32): the modal keeps 16 from each side). */
internal val LinkDialogWidth = 400.dp

/** The link editor's one control height (round 17 review D5): the field, 卡片 | 文字 and 完成 alike. */
internal val LinkDialogControl = 44.dp

/** The field's air over and under its one line (15 at 1.6: 24), so it stands [LinkDialogControl] tall. */
private val LinkFieldPadY = 10.dp

/** The air the display choice keeps over itself, past the modal's own gap: it parts from the field it is about. */
private val LinkDialogChoiceLead = 6.dp
