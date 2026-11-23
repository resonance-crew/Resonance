package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.ImageRevealKind
import com.resonance.design.RevealImage
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardPalette
import com.resonance.design.LocalWindowLayout
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicModal
import com.resonance.design.StoryMarkdown
import com.resonance.design.StoryType
import com.resonance.design.WobRectShape
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.CardCache
import kotlinx.coroutines.CancellationException

/**
 * What a reply card's writer is told of the story it answers (round 26 §U6, S10): nothing showed it under 1200 wide.
 * A band [ReplyingBandHeight] tall over the title — the original's cover at [ReplyingCover] and 「回應〈一場雨後的散步〉」 —
 * whose tap opens the original in a centred dialog (never a bottom sheet). Nothing while the original isn't known (still
 * read, gone, hidden from the writer since).
 */
@Composable
internal fun ReplyingBand(session: Session, referenceCardId: String, modifier: Modifier = Modifier) {
    var card by remember(referenceCardId) { mutableStateOf(session.cardCache.preview(referenceCardId)) }
    LaunchedEffect(referenceCardId) {
        if (card != null) return@LaunchedEffect
        card = try {
            session.reading.cards(listOf(referenceCardId)).firstOrNull()?.also(session.cardCache::rememberPreview)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
    val original = card ?: return
    val label = replyingLabel(original) ?: return
    var reading by remember(referenceCardId) { mutableStateOf(false) }
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = ReplyingBandHeight)
            .plainClickable(role = Role.Button) { reading = true },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        CoverTile(original, ReplyingCover)
        BasicText(
            label,
            style = AppFonts.body(14f, lineHeight = 1.4f, color = Tokens.TextMuted),
            maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
    if (reading) OriginalDialog(session, original) { reading = false }
}

/** The band's words: 「回應〈{title}〉」 / Replying to “{title}”; none for a card with no title to name. */
internal fun replyingLabel(card: FeedCard?): String? = card?.title?.trim()?.takeIf { it.isNotEmpty() }?.let(L10n.Card::replying)

/** The band (§U6: 44) and the original's cover in it. */
internal val ReplyingBandHeight: Dp = 44.dp
internal val ReplyingCover: Dp = 36.dp

/** The original's cover as a small tile: its picture, else its family's fill with the title's first character. */
@Composable
private fun CoverTile(card: FeedCard, size: Dp) {
    val colors = CardPalette.of(previewFamily(card.accentHue, card.id)).colors
    val shape = remember(card.id) { WobRectShape(size.value * 0.26, (card.id.hashCode() % 97).toDouble()) }
    Box(Modifier.size(size).clip(shape).background(if (card.imageUrl != null) colors.skeleton else colors.fill), contentAlignment = Alignment.Center) {
        val cover = card.imageUrl
        if (cover != null) {
            RevealImage(cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(), kind = ImageRevealKind.Thumb)
        } else {
            BasicText(coverInitial(card.title), style = AppFonts.style(AppFonts.Family.HeadingCJK, 16f, 600, lineHeight = 1f, color = colors.deep))
        }
    }
}

/** The first character of a title (a whole code point), or nothing. */
internal fun coverInitial(title: String): String = title.trim().let { t -> if (t.isEmpty()) "" else String(Character.toChars(t.codePointAt(0))) }

/** The original in a centred dialog: its title and its story, read for it (the card's own page, as the app keeps it). */
@Composable
private fun OriginalDialog(session: Session, card: FeedCard, onDismiss: () -> Unit) {
    var page by remember(card.id) { mutableStateOf<CardCache.Page?>(session.cardCache.page(card.id)) }
    LaunchedEffect(card.id) {
        page = try {
            session.cardPages.load(card.id, card)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            page
        }
    }
    val context = LocalContext.current
    val cls = LocalWindowLayout.current.cls
    OrganicModal(onDismiss, card.title, seed = 47.0, closeLabel = L10n.Native.close, maxWidth = 560.dp) {
        ModalTitle(card.title)
        page?.let { p ->
            val type = StoryType.of(p.storyText.script, cls)
            // Read here, not followed: a link in it opens outside, a card it embeds is named by its title.
            StoryMarkdown(p.blocks, type, p.storyText.lang, { href -> openStoryLink(context, session.config.origin, href) {} }) { _, title, _ ->
                BasicText(title, style = AppFonts.body(15f, lineHeight = 1.6f, color = Tokens.TextMuted))
            }
        } ?: BasicText(card.excerpt, style = AppFonts.body(15f, lineHeight = 1.7f))
        ModalCloseButton(L10n.Native.close, onDismiss)
    }
}
