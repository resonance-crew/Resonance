package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.api.models.CardDetail
import com.resonance.api.models.CardTap
import com.resonance.app.DebugLaunch
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The end of someone else's story (round 26 §U1–§U4; the web's ReadAfterArea → CardViewerActions, iOS's twin) — three
 * answers and two quiet things, the owner's: 「三種回饋的操作…其他被動的就包括分享和收藏」.
 *
 * - **Row 1, the capsule** ([SegmentedActionBar], the paper puppets standing on it): **共振** — a switch, tonal at rest,
 *   on in the solid face with two waves in phase and 已共振; it opens nothing — · **寄小紙條**, opening the note's field
 *   in place under row 2 (never a dialog) · **用卡片回應** (the old 共振: write a card in answer, or pick one —
 *   [ResonatePicker]; 修改 with a draft, 已回應 once published). All three tonal at rest. Narrow, in English or with large
 *   text the reply says 寫卡片; still too wide, two lines ([EndRowLayout]). No segment is ever hidden.
 * - **Row 2**, right under it, 48 tall and as wide: the faces of the viewer's connections who resonated (their own
 *   first while on), one button opening the list ([TapFacesButton], [ReaderTapList]); at its end 收藏, a glyph alone.
 *   Share stays where the page has it (the bar, the byline).
 * - **The note's field** ([NoteInPlace]), 12 under row 2 when open.
 *
 * The tap flips at once and goes on ([TapSwitch]); a refusal flips it back with 沒送出去，再試一次. [onTapChanged] hands the
 * page the tap as it is now, so the page shows it on its way back. [onRow] reports where row 1 is (the reading
 * report's end, §U7).
 */
@Composable
fun CardViewerActions(
    session: Session,
    detail: CardDetail,
    onWriteNew: () -> Unit,
    onModify: (resonanceId: String) -> Unit,
    onOpenMine: (routeKey: String) -> Unit,
    onUpgradeNote: (String) -> Unit,
    open: (Route) -> Unit,
    modifier: Modifier = Modifier,
    /** Opens this card's page again: a failed note's 再寄一次 when the page is no longer on screen (round 21). */
    onOpenCard: () -> Unit = {},
    onTapChanged: (CardTap) -> Unit = {},
    onRow: (LayoutCoordinates) -> Unit = {},
    /** What the screenshots ask of this end once it is on screen (`--es cardEnd …`, [DebugLaunch.cardEnd]). */
    launch: Set<DebugLaunch.CardEnd> = emptySet(),
) {
    val cardId = detail.card.id
    val toasts = LocalToasts.current
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val reduced = LocalContext.current.prefersReducedMotion()

    // Your card answering this one (draft or published): null while looking, NONE when there is none.
    var mine by remember(cardId) { mutableStateOf<DraftService.Resonance?>(null) }
    var picking by remember(cardId) { mutableStateOf(false) }
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    LaunchedEffect(cardId, changes) {
        // A failed lookup stays dimmed, as on the web — better than risking a second reply card.
        val drafts = session.drafts
        mine = if (drafts == null) NONE else try {
            drafts.myResonance(cardId) ?: NONE
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    // The tap: the server's faces, and the viewer's own drawn at once.
    val served = TapFaces.of(detail.tap)
    val mayNote = detail.tap?.mayNote ?: true
    session.uid?.let { uid -> served.faces.firstOrNull { it.id == uid }?.let { session.selfFace = it } }
    val latestDetail by rememberUpdatedState(detail)
    val switch = remember(cardId) {
        TapSwitch(
            served.mine,
            send = { on ->
                val now = session.taps.set(cardId, on)
                session.noteOwnWrite()
                val me = session.me
                val base = TapFaces.of(latestDetail.tap)
                val after = if (me == null) base else base.withViewer(viewerFace(me, session.selfFace), now)
                onTapChanged(CardTap(mine = now, faces = after.faces, more = after.more, mayNote = latestDetail.tap?.mayNote ?: true))
                now
            },
            onFailed = { toasts.show(L10n.Card.Tap.failed) },
        )
    }
    LaunchedEffect(detail.tap?.mine) { detail.tap?.let { switch.read(it.mine) } }
    val me = session.me
    val faces = if (me == null || switch.on == served.mine) served else served.withViewer(viewerFace(me, session.selfFace), switch.on)

    // The note in place.
    val note = remember(cardId) { NoteFieldState(session.noteDrafts?.text(cardId).orEmpty(), mayNote) }
    var hint by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(note.open) { if (note.open && !hint) hint = session.hints?.claim("note-privacy") ?: false }
    // Kept a moment after typing stops, as the app leaves the screen, and as the page goes.
    val typed by rememberUpdatedState(note.draft)
    LaunchedEffect(note.draft) {
        delay(NOTE_DRAFT_DELAY_MS)
        note.draft?.let { keepDraft(session, cardId, it) }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { typed?.let { keepDraft(session, cardId, it) } }
    DisposableEffect(cardId) { onDispose { typed?.let { keepDraft(session, cardId, it) } } }
    // A note that didn't go: its field opens again here, on its kept words, saying why (or from 再寄一次).
    val sends = session.noteSends
    DisposableEffect(sends, cardId) {
        sends.host(cardId, true)
        onDispose { sends.host(cardId, false) }
    }
    val reopen by sends.reopen.collectAsStateWithLifecycle()
    LaunchedEffect(reopen, cardId) {
        val ask = reopen?.takeIf { it.cardId == cardId } ?: return@LaunchedEffect
        sends.took(cardId)
        note.failed(session.noteDrafts?.text(cardId).orEmpty(), ask.error)
    }
    // The screenshots' states (`--es cardEnd tap,note,taps`), as the page took them.
    var openList by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(cardId, launch) {
        if (DebugLaunch.CardEnd.Tap in launch && !switch.on) switch.flip(scope)
        if (DebugLaunch.CardEnd.Note in launch && !note.open) note.segment(mayNote)
        if (DebugLaunch.CardEnd.Taps in launch) openList = true
    }

    var bookmarked by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(cardId) { bookmarked = runCatching { session.bookmarks?.isBookmarked(cardId) }.getOrNull() ?: false }

    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = AppFonts.body(14f, 600, lineHeight = 1f)
    BoxWithConstraints(modifier) {
        val room = maxWidth.value
        fun width(text: String) = with(density) { measurer.measure(text, style, softWrap = false, maxLines = 1).size.width.toDp().value }
        val tapWords = width(tapLabel(true)).coerceAtLeast(width(tapLabel(false)))
        val noteWords = width(L10n.Card.Note.short)
        val replyFull = ReplyAction.of(mine.asMine(), short = false).label
        val replyShort = ReplyAction.of(mine.asMine(), short = true).label
        val form = EndRowLayout.choose(
            listOf(tapWords, noteWords, width(replyFull)),
            listOf(tapWords, noteWords, width(replyShort)),
            room,
            english = Strings.language == Strings.Language.En,
            largeText = density.fontScale > EndRowLayout.LARGE_TEXT,
        )
        val reply = ReplyAction.of(mine.asMine(), short = form != EndRowForm.Full)
        val capsule = EndRowLayout.capsuleWidth(listOf(tapWords, noteWords, width(reply.label)), room, form)

        val tap = Segment(
            "tap", tapLabel(switch.on), tapIcon(switch.on),
            fill = if (switch.on) Tokens.ButtonFill else null,
            textColor = if (switch.on) Tokens.Cream else null,
            press = if (switch.on) OrganicIndication.OnFill else null,
            toggled = switch.on,
        ) {
            haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
            switch.flip(scope)
        }
        val noteSegment = Segment(
            "note", L10n.Card.Note.short, IconName.Note,
            // While its field is open, its hover wash stays (never solid: solid is the tap on).
            fill = if (note.open) OrganicIndication.Wash.compositeOver(Tokens.ButtonTonal) else null,
            expanded = note.open,
        ) { note.segment(mayNote) }
        // While your reply card is looked for, its segment waits (a second reply card is never started by accident).
        val replySegment = Segment("reply", reply.label, reply.icon, loading = mine == null) {
            val answered = mine
            when {
                answered == null -> Unit
                answered == NONE -> picking = true
                // A published reply card is done: the segment says so and opens it.
                answered.published -> onOpenMine(answered.routeKey)
                // A draft is still being written: 修改 takes it back to the writer.
                else -> onModify(answered.id)
            }
        }
        Column(Modifier.fillMaxWidth()) {
            if (form == EndRowForm.TwoLines) {
                // 共振 alone on the first line (the puppets stand on it), 寄小紙條 · 寫卡片 on the second.
                SegmentedActionBar(listOf(tap), Modifier.width(capsule.dp).onGloballyPositioned(onRow), mascotKey = "respond")
                Spacer(Modifier.height(EndRowLayout.LINE_GAP.dp))
                SegmentedActionBar(listOf(noteSegment, replySegment), Modifier.width(capsule.dp), seed = 73.0)
            } else {
                SegmentedActionBar(
                    listOf(tap, noteSegment, replySegment),
                    Modifier.width(capsule.dp).onGloballyPositioned(onRow),
                    mascotKey = "respond",
                )
            }
            // Row 2: the faces at its start, under 共振; 收藏 at its end. Always there, so nothing moves as faces come.
            Row(Modifier.width(capsule.dp).height(Row2Height), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.padding(start = 6.dp)) {
                    TapFacesButton(faces, session.uid, author = false, onOpen = { openList = true })
                    if (openList && !faces.isEmpty && !faces.selfOnly(session.uid)) {
                        ReaderTapList(session, cardId, onDismiss = { openList = false }, open = open)
                    }
                }
                Spacer(Modifier.weight(1f))
                BookmarkButton(bookmarked) {
                    val bookmarks = session.bookmarks ?: return@BookmarkButton
                    // Optimistic, then reconciled with what the write returns.
                    val saving = !bookmarked
                    bookmarked = saving
                    haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                    // Said as it is drawn, as the web does: 收藏到卡片盒了.
                    if (saving) toasts.show(L10n.Card.saved)
                    scope.launch {
                        bookmarked = runCatching { bookmarks.toggle(cardId) }.onSuccess { session.noteOwnWrite() }.getOrElse { !saving }
                    }
                }
            }
            NoteInPlace(
                note, tapOn = switch.on, mayNote = mayNote, hint = hint, reducedMotion = reduced,
                onSend = { words ->
                    // Kept until the server has it: a failure brings these words back into the field.
                    keepDraft(session, cardId, words)
                    note.sent()
                    toasts.show(L10n.Card.Note.sent)
                    sendNoteOnward(session, toasts, cardId, words, onOpenCard)
                },
                onUpgrade = { words ->
                    // Carried into a card of their own (the web's rule): the writer keeps the words from here.
                    session.noteDrafts?.clear(cardId)
                    note.upgraded()
                    onUpgradeNote(words)
                },
            )
        }
    }
    if (picking) ResonatePicker(
        session, cardId, detail.card.referenceCardId,
        onWriteNew = onWriteNew,
        onResonated = { picking = false },
        onDismiss = { picking = false },
    )
}

/** Row 2's height (§U1.2: 44 on the web and iOS, 48 here, a finger's). */
private val Row2Height = 48.dp

/** How long after the last keystroke a note's draft is written down. */
private const val NOTE_DRAFT_DELAY_MS = 400L

/** The card's note draft as the field holds it now (none clears it). */
private fun keepDraft(session: Session, cardId: String, text: String) {
    val drafts = session.noteDrafts ?: return
    if (text.isBlank()) drafts.clear(cardId) else if (drafts.text(cardId) != text) drafts.keep(cardId, text)
}

/**
 * 收藏 (§U1.2): a glyph alone at row 2's end, a 48 square to the finger — the bookmark drawn filled once saved, and
 * named by what a tap does (收藏 / 取消收藏, what the flows say to it).
 */
@Composable
private fun BookmarkButton(saved: Boolean, onClick: () -> Unit) {
    val label = if (saved) L10n.Card.Bookmark.remove else L10n.Card.Bookmark.add
    Box(
        Modifier
            .size(48.dp)
            .plainClickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        OrganicIcon(
            IconName.Bookmark, size = 20.dp, color = Tokens.ButtonOnTonal,
            fill = if (saved) Tokens.ButtonOnTonal else null,
            strokeWidth = if (saved) 2f else 1.6f,
        )
    }
}

/** No reply card of yours answers the card (looked, and found none). */
private val NONE = DraftService.Resonance("", "", published = false)

/** What the lookup found, as [ReplyAction] reads it (null while looking). */
private fun DraftService.Resonance?.asMine(): ReplyAction.Mine? = when {
    this == null -> null
    this === NONE || id.isEmpty() -> ReplyAction.Mine.None
    else -> ReplyAction.Mine.Found(published)
}
