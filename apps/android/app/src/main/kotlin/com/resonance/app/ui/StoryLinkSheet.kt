package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicModal
import com.resonance.design.OrganicTextField
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
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
 * The writer's link sheet (round 16 §6), a compact sheet over the keyboard: the address field — the
 * caret's link's, else empty; the clipboard is never read on opening, only on an explicit paste — then
 * 顯示為 卡片 | 文字 only where the link is, or will be, alone in its paragraph ([LinkSheetRequest.canCard]),
 * and at its foot 移除連結 (editing a link) · 完成. 完成 takes only what the link rules take
 * ([StoryLinks.linkTarget]: http(s); a bare `www.…` or `example.com/x` gets `https://`); anything else
 * says 這不是可以連結的網址 under the field and links nothing. [onApply] hands the address and the choice
 * to the island; [onRemove] unlinks; [onDismiss] closes without a change.
 */
@Composable
internal fun StoryLinkSheet(
    request: LinkSheetRequest,
    onApply: (String, LinkDisplay) -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    var address by remember {
        mutableStateOf(request.link?.href ?: (if (com.resonance.app.BuildConfig.DEBUG) com.resonance.app.DebugLaunch.linkDraft else null).orEmpty())
    }
    var display by remember { mutableStateOf(request.display) }
    var invalid by remember { mutableStateOf(false) }
    // Typing again takes the refusal back until the next 完成.
    LaunchedEffect(address) { invalid = false }
    val apply = {
        val target = StoryLinks.linkTarget(address)
        if (target == null) invalid = true
        else onApply(target, if (request.canCard) display else LinkDisplay.Text)
    }
    // The field has the focus as the sheet opens, the keyboard with it — no tap to start typing (round 16 review F10).
    val field = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        // The dialog's window is attached a frame after it is composed.
        withFrameNanos { }
        runCatching { field.requestFocus() }
    }
    OrganicModal(
        onDismiss, L10n.Write.Editor.link, seed = 37.0, closeLabel = L10n.Write.Editor.CardModal.cancel, maxWidth = 560.dp, atFoot = true,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OrganicTextField(
                if (request.link != null) L10n.Write.Editor.linkEdit else L10n.Write.Editor.link,
                address, { address = it },
                placeholder = L10n.Write.Editor.linkPlaceholder,
                seed = 41.0,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onDone = { if (address.isNotBlank()) apply() }),
                focusRequester = field,
            )
            if (invalid) BasicText(
                L10n.Write.Editor.linkInvalid,
                style = AppFonts.body(Tokens.HintSize, lineHeight = 1.5f, color = Tokens.TextMuted),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (request.canCard) {
            // 顯示為 inline before its choice, as iOS and the web set it (round 16 review F11): field → 顯示為 [卡片|文字] → … 完成.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Write.Editor.linkShowAs, style = AppFonts.body(14f, lineHeight = 1.3f, color = Tokens.TextMuted), maxLines = 1)
                SegmentedActionBar(
                    listOf(LinkDisplay.Card to L10n.Write.Editor.linkAsCard, LinkDisplay.Text to L10n.Write.Editor.linkAsText).map { (choice, label) ->
                        val on = display == choice
                        Segment(
                            choice.key, label, if (choice == LinkDisplay.Card) IconName.Frame else IconName.Link,
                            fill = if (on) Tokens.ButtonTonal else null,
                            textColor = if (on) Tokens.ButtonOnTonal else Tokens.TextMuted,
                            press = Tokens.TowardInk.copy(alpha = 0.05f),
                            selected = on,
                        ) { display = choice }
                    },
                    Modifier.weight(1f),
                    fill = Tokens.CreamDark,
                )
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (request.link != null) OrganicButton(L10n.Write.Editor.linkRemove, variant = ButtonVariant.Text, small = true, onClick = onRemove)
            Spacer(Modifier.weight(1f))
            // Nothing typed, nothing to link: 完成 waits for an address (as iOS's).
            OrganicButton(L10n.Write.Editor.linkApply, enabled = address.isNotBlank(), small = true, onClick = apply)
        }
    }
}
