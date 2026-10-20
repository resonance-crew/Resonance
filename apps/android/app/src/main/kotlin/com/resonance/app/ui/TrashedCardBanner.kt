package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.ButtonVariant
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.api.isTrashed
import com.resonance.kit.l10n.L10n
import java.time.Instant

/**
 * 「這張卡片在垃圾桶裡」 — what the owner sees at the head of their card's page while it is in the
 * trash (TrashedCardBanner.tsx; trash.spec §5.4 with the critique's placement: the article's first
 * block, above the cover or the title): how long it has and that only they can see it, that an
 * anonymous card's notes went with it, then 還原 (the card comes back here, as it was) and 永久刪除
 * (asked first, in red; then [onDeleted], away from the page). The soft panel's tint, a notice
 * rather than a form; on a phone the two buttons wrap under the words. Everyone else never sees the
 * card at all (it is private while it is there).
 */
@Composable
fun TrashedCardBanner(
    card: FeedCard,
    anonymous: Boolean,
    compact: Boolean,
    /** Bumped when the card was moved to the trash on this page: the banner's title takes the focus. */
    focusTicket: Int = 0,
    onDeleted: () -> Unit,
) {
    val trash = LocalTrash.current ?: return
    val toasts = LocalToasts.current
    var restoring by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val title = remember { FocusRequester() }
    LaunchedEffect(focusTicket) { if (focusTicket > 0) runCatching { title.requestFocus() } }
    val ref = TrashRef(card.id, card.title)
    val caption = trashBannerCaption(card)
    val actions: @Composable () -> Unit = {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OrganicButton(L10n.Me.Actions.restore, small = true, loading = restoring, enabled = !deleting) {
                if (!restoring) {
                    restoring = true
                    // The page reads the card again as it comes back: the banner goes with the trash.
                    trash.launch {
                        try {
                            restoreSaying(ref)
                        } finally {
                            restoring = false
                        }
                    }
                }
            }
            OrganicButton(L10n.Me.Actions.deleteForever, variant = ButtonVariant.DangerTonal, small = true, enabled = !restoring) { deleting = true }
        }
    }
    Column(
        Modifier
            .fillMaxWidth()
            .padding(bottom = 24.dp)
            // Panel soft: cream-dark at half strength, its corners 20 24 18 22.
            .background(Tokens.CreamDark.copy(alpha = 0.5f), RoundedCornerShape(topStart = 20.dp, topEnd = 24.dp, bottomEnd = 18.dp, bottomStart = 22.dp))
            .padding(horizontal = 18.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            OrganicIcon(IconName.Trash, size = 20.dp, color = Tokens.TextMuted)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                // Not a heading: it comes before the card's own title.
                BasicText(
                    L10n.Card.Trashed.title,
                    style = AppFonts.body(15f, 600, lineHeight = 1.4f),
                    modifier = Modifier.focusRequester(title).focusable(),
                )
                BasicText(caption, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
                if (anonymous && card.publishedAt != null) {
                    BasicText(L10n.Card.Trashed.notesGone, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
                }
            }
            if (!compact) actions()
        }
        // A phone: the buttons in one row under the words, at their start (past the glyph).
        if (compact) Row(Modifier.padding(start = 34.dp)) { actions() }
    }
    if (deleting) DeleteForeverDialog(trash, toasts, ref, seed = 71.0, onClose = { deleting = false }, onDeleted = onDeleted)
}

/** The page is the owner's own card in the trash: the banner first, no share, no ⋯, no lists around it. */
internal fun ownTrashed(detail: CardDetail): Boolean = detail.isOwner && detail.card.isTrashed

/** The banner's line: 「{n} 天後永久刪除 · 只有你看得到」 (or 一天內永久刪除 in its last day). */
internal fun trashBannerCaption(card: FeedCard, now: Instant = Instant.now()): String =
    listOfNotNull(TrashWords.left(card, now), L10n.Card.Trashed.onlyYou).joinToString(" · ")
