package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.api.models.CardDetail
import com.resonance.api.models.CardTap
import com.resonance.api.models.TranslationResponse
import com.resonance.app.DebugLaunch
import com.resonance.app.DraftService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.Segment
import com.resonance.design.SegmentedActionBar
import com.resonance.design.segmentCentre
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * The end of someone else's story (round 26 §U1–§U4; the web's ReadAfterArea → CardViewerActions, iOS's twin) — three
 * answers and two quiet things, the owner's: 「三種回饋的操作…其他被動的就包括分享和收藏」. Top to bottom (round 30): the
 * faces' line, the capsule, the note's field.
 *
 * - **Row 1, the capsule** ([SegmentedActionBar], the paper puppets standing on it): **共振** — a switch, tonal at rest,
 *   on in the solid face with two waves in phase, its words unchanged; it opens nothing — · **寄小紙條**, opening the note's field
 *   in place under the capsule (never a dialog) · **用卡片回應** (the old 共振: write a card in answer, or pick one —
 *   [ResonatePicker]; 修改 with a draft, 已回應 once published). All three tonal at rest. Narrow, in English or with large
 *   text the reply says 寫卡片; still too wide, two lines ([EndRowLayout]). No segment is ever hidden.
 * - **收藏** ([bookmark], the page's — round 28 §S2): on a wide column at the end of the capsule's own row, the
 *   content column's end, centred on the capsule's (first) line, the capsule's words weighed in the room left
 *   ([EndRowLayout.capsuleRoom]); on a phone the page draws it at the end of the tags' row ([StoryTagsRow]).
 *   Share and ⋯ stay where the page has them (the bar, the byline).
 * - **The faces' line** ("row 2" until round 30, which moved it), right over the capsule, 0 between, 48 tall and as
 *   wide: the faces of the viewer's connections who resonated (their own first while on), one button opening the list
 *   ([TapFacesButton], [ReaderTapList]) — nothing at its end. Always there, faces or none, so the capsule never moves.
 * - **The note's field** ([NoteInPlace]), 12 under the capsule when open, the column's width.
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
    /** The note's field asks the page's bar to step aside (true) — no room under it over the keyboard — or come back. */
    onNoteRoom: (Boolean) -> Unit = {},
    /**
     * The translation the story shows now (round 25 §F), or null: the original. In translation the dialog offers the
     * passages its answer places, in its words and its script (round 31 §R1); none when it places none.
     */
    translation: () -> TranslationResponse? = { null },
    /** The card is to be read again (round 27 §U1.6: a pick refused because the passages or the tap changed). */
    onStale: () -> Unit = {},
    /** The page's 收藏 ([rememberCardBookmark]): drawn here on a wide column, in the tags' row on a phone (round 28). */
    bookmark: BookmarkToggle? = null,
) {
    val cardId = detail.card.id
    val toasts = LocalToasts.current
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val reduced = LocalContext.current.prefersReducedMotion()

    // Your card answering this one (draft or published): null while looking, NONE when there is none.
    var mine by remember(cardId) { mutableStateOf<DraftService.Resonance?>(null) }
    var looking by remember(cardId) { mutableStateOf(true) }
    var picking by remember(cardId) { mutableStateOf(false) }
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    LaunchedEffect(cardId, changes) {
        // A failed lookup stays inert, as on the web — better than risking a second reply card.
        val drafts = session.drafts
        mine = if (drafts == null) NONE else try {
            drafts.myResonance(cardId) ?: NONE
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        looking = false
    }

    // The tap: the server's faces, and the viewer's own drawn at once.
    val served = TapFaces.of(detail.tap)
    val mayNote = detail.tap?.mayNote ?: true
    session.uid?.let { uid -> served.faces.firstOrNull { it.id == uid }?.let { session.selfFace = it } }
    val latestDetail by rememberUpdatedState(detail)
    val switch = remember(cardId) {
        TapSwitch(
            served.mine,
            // The account's scope: the tap still goes, and the page still hears of it, once this row has left the page.
            launch = { work -> session.launch(work) },
            send = { on ->
                val now = session.taps.set(cardId, on)
                session.noteOwnWrite()
                val me = session.me
                val base = TapFaces.of(latestDetail.tap)
                // A tap sent was off before or goes off now: either way it has no pick on the server (§P4.4).
                val after = (if (me == null) base.copy(mine = now) else base.withViewer(viewerFace(me, session.selfFace), now)).copy(passage = null)
                // The card's passages and the pick ride along (§P7): the page and its kept copy lose neither.
                onTapChanged(after.toCardTap(latestDetail.tap?.mayNote ?: true))
                now
            },
            onFailed = { toasts.show(L10n.Card.Tap.failed) },
        )
    }
    LaunchedEffect(detail.tap?.mine) { detail.tap?.let { switch.read(it.mine) } }
    val me = session.me
    val faces = if (me == null || switch.on == served.mine) served else served.withViewer(viewerFace(me, session.selfFace), switch.on)

    // Round 27 §U1: which part stayed with the reader — the dialog after a press that turned 共振 on, or from their own row.
    var passagesOpen by remember(cardId) { mutableStateOf(false) }
    // The tap's request the pick waits for (the press that opened the dialog), and the pick drawn before the server has it.
    var tapJob by remember(cardId) { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    var pickShown by remember(cardId) { mutableStateOf<String?>(null) }
    var holdPicked by remember(cardId) { mutableStateOf(false) }
    // Opened by the press that turned 共振 on: that tap starts with no pick on the server (§P4.4), whatever the page's
    // copy still says while the off flip before it is in flight — so the dialog marks none (only the own row shows one).
    var fromPress by remember(cardId) { mutableStateOf(false) }
    val currentPick = if (switch.on) faces.passage else null
    val pick = remember(cardId) {
        PassagePick(
            launch = { work -> session.launch(work) },
            send = { id -> session.taps.setPassage(cardId, id) },
            tapOn = { switch.on },
            // The pick as the page's copy has it, which is the server's (written back only once a request answered).
            held = { latestDetail.tap?.let { TapFaces.of(it).passage } },
            onPicked = { now ->
                val tap = latestDetail.tap ?: return@PassagePick
                // The page's copy and its kept page hold the pick as the server now has it (§P7).
                onTapChanged(TapFaces.of(tap).copy(passage = now).toCardTap(tap.mayNote))
            },
            onStale = {
                passagesOpen = false
                onStale()
            },
            onFailed = { toasts.show(L10n.Card.Tap.failed) },
        )
    }
    // The tap's PUT failed (it is off again), or it was taken back: the dialog goes with it.
    LaunchedEffect(switch.on) { if (!switch.on) passagesOpen = false }
    // The dialog's rows: the card's passages, or the translation's words for them while it shows (round 31 §R1) — in
    // the script of what the page shows (a Chinese story read in English takes Latin type).
    val shownTranslation = translation()
    val script = remember(detail.card.title, detail.story, shownTranslation) {
        val (title, story) = shownTranslation?.let { it.title to it.story } ?: (detail.card.title to detail.story)
        com.resonance.kit.story.StoryScripts.storyType(title, story).script
    }
    val offered = offeredPassages(faces, shownTranslation != null, shownTranslation?.passages)
    val offers = offered.isNotEmpty()
    // A swap to a translation that places none of them: the dialog goes (it comes back only by a press or the own row).
    LaunchedEffect(offers) { if (!offers) passagesOpen = false }

    // The note in place.
    val note = remember(cardId) { NoteFieldState(session.noteDrafts?.text(cardId).orEmpty(), mayNote) }
    // Kept a moment after typing stops, as the app leaves the screen, and as the page goes — never the screenshots'
    // words (`cardEnd lines`), which would open the next capture's field on them.
    val keeps = remember(cardId) { DebugLaunch.CardEnd.Lines !in launch }
    val typed by rememberUpdatedState(note.draft?.takeIf { keeps })
    LaunchedEffect(note.draft) {
        delay(NOTE_DRAFT_DELAY_MS)
        if (keeps) note.draft?.let { keepDraft(session, cardId, it) }
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
    // The screenshots' states (`--es cardEnd tap,note,lines,taps`), as the page took them.
    var openList by remember(cardId) { mutableStateOf(false) }
    LaunchedEffect(cardId, launch) {
        if (DebugLaunch.CardEnd.Tap in launch && !switch.on) switch.flip()
        if (DebugLaunch.CardEnd.Note in launch && !note.open) note.segment(mayNote)
        if (DebugLaunch.CardEnd.Lines in launch) {
            if (!note.open) note.segment(mayNote)
            note.edit(VISUAL_NOTE_LINES)
        }
        if (DebugLaunch.CardEnd.Taps in launch) openList = true
        // `passages`: 共振 pressed, the dialog open; `passage-picked`: held open on the second row pressed (§V2).
        val picked = DebugLaunch.CardEnd.PassagePicked in launch
        // Under 自動翻譯 the rows become the translation's once it shows (`card-passages-translated`, round 31 §V).
        if ((DebugLaunch.CardEnd.Passages in launch || picked) && faces.offersPassages) {
            // Shown on, never sent: a stored tap would stay on the run's stack for the next variants (§V2).
            fromPress = switch.showOnForCapture()
            tapJob = null
            if (picked) {
                holdPicked = true
                pickShown = faces.passages[1].id
            }
            passagesOpen = true
        }
    }

    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = AppFonts.body(14f, 600, lineHeight = 1f)
    BoxWithConstraints(modifier) {
        // The content column; wide, the capsule shares its row with 收藏 (§S2).
        val column = maxWidth.value
        val wide = EndRowLayout.placement(column) == EndRowPlacement.Wide
        fun width(text: String) = with(density) { measurer.measure(text, style, softWrap = false, maxLines = 1).size.width.toDp().value }
        val tapWords = width(tapLabel)
        val noteWords = width(L10n.Card.Note.short)
        val replyFull = ReplyAction.of(mine.asMine(), short = false).label
        val replyShort = ReplyAction.of(mine.asMine(), short = true).label
        val form = EndRowLayout.choose(
            listOf(tapWords, noteWords, width(replyFull)),
            listOf(tapWords, noteWords, width(replyShort)),
            column,
            english = Strings.language == Strings.Language.En,
            largeText = density.fontScale > EndRowLayout.LARGE_TEXT,
        )
        val reply = ReplyAction.of(mine.asMine(), short = form != EndRowForm.Full)
        val capsule = EndRowLayout.capsuleWidth(listOf(tapWords, noteWords, width(reply.label)), column, form)

        val tap = Segment(
            "tap", tapLabel, tapIcon(switch.on),
            fill = if (switch.on) Tokens.ButtonFill else null,
            textColor = if (switch.on) Tokens.Cream else null,
            press = if (switch.on) OrganicIndication.OnFill else null,
            toggled = switch.on,
        ) {
            haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
            val job = switch.flip()
            if (passagesOpenOnPress(switch.on, faces, shownTranslation != null, shownTranslation?.passages)) {
                tapJob = job
                scope.launch {
                    delay(TapPassagesTiming.openDelay(reduced))
                    // Still on, and still offered, once the segment has filled.
                    val now = translation()
                    if (switch.on && offeredPassages(faces, now != null, now?.passages).isNotEmpty()) {
                        pickShown = null
                        holdPicked = false
                        fromPress = true
                        passagesOpen = true
                    }
                }
            }
        }
        val noteSegment = Segment(
            "note", L10n.Card.Note.short, IconName.Note,
            // While its field is open, its hover wash stays (never solid: solid is the tap on).
            fill = if (note.open) OrganicIndication.Wash.compositeOver(Tokens.ButtonTonal) else null,
            expanded = note.open,
        ) { note.segment(mayNote) }
        // While your reply card is looked for, its segment waits (a second reply card is never started by accident).
        val replySegment = Segment("reply", reply.label, reply.icon, loading = mine == null && looking) {
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
        val twoLines = form == EndRowForm.TwoLines
        // The capsule's (first) line: 共振 alone on two lines (the puppets stand on it), else the three.
        val firstSegments = if (twoLines) listOf(tap) else listOf(tap, noteSegment, replySegment)
        val firstLine: @Composable () -> Unit = {
            SegmentedActionBar(
                firstSegments,
                Modifier.width(capsule.dp).onGloballyPositioned(onRow),
                mascotKey = "respond",
            )
        }
        ReaderEndStack(
            capsuleWidth = capsule.dp,
            // The faces over 共振 stand centred on its segment (round 29 §S11), on the capsule's first line.
            facesCentre = segmentCentre(firstSegments, capsule.dp),
            faces = { TapFacesButton(faces, session.uid, author = false, onOpen = { openList = true }, selfOpens = offers) },
            firstLine = firstLine,
            // Wide: 收藏 ends the capsule's row at the column's end, its glyph where the byline's ⋯ ends (§S2).
            bookmark = if (wide && bookmark != null) ({ BookmarkButton(bookmark.saved, glyphEnd = BylineGlyphEnd) { bookmark.toggle() } }) else null,
            // 寄小紙條 · 寫卡片 on the second line.
            secondLine = if (twoLines) ({ SegmentedActionBar(listOf(noteSegment, replySegment), Modifier.width(capsule.dp), seed = 73.0) }) else null,
        ) {
            // The note's field, 12 under the capsule (its second line when it takes two), across the column (§S2, §S3).
            NoteInPlace(
                note, mayNote = mayNote, reducedMotion = reduced,
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
                onRoom = onNoteRoom,
            )
        }
    }
    // Round 34 (8) (the owner: 名单先出头像和名字，约 1 秒后每行的句子才出现): the list's first page is read while the faces
    // stand, not from the press — a press after it answered opens the dialog complete (faces, names, each quote) on its
    // first frame; the 300 ms wait was shorter than the page's round trip, so it opened on the faces alone. Read again
    // whenever the server's copy of the faces changes (a tap that answered, a pick written back).
    val mayList = !faces.isEmpty && (offers || !faces.selfOnly(session.uid))
    val readerList = remember(cardId, served) { TapPeople { token -> session.taps.taps(cardId, token) } }
    LaunchedEffect(readerList, mayList) { if (mayList) prefetchFirstPage(readerList) }
    // Who resonated, behind the faces: the phone's dialog on every device (the owner's look, 2026-11-19).
    if (openList && mayList) {
        ReaderTapList(
            session, cardId, onDismiss = { openList = false }, open = open, list = readerList,
            offersPassages = offers,
            // The faces over the capsule: the rows while the first page is read past the wait (round 33 §Q1).
            expected = faces.shown,
            pagePick = PagePick(faces.passages.firstOrNull { it.id == (pickShown ?: currentPick) }?.text),
            // The reader's own row: the dialog again, the current pick marked (§U3); the tap is on, nothing to wait for.
            onOwnRow = {
                tapJob = null
                pickShown = null
                holdPicked = false
                fromPress = false
                passagesOpen = true
            },
        )
    }
    if (passagesOpen && switch.on && offers) TapPassages(
        offered,
        picked = passagesMarked(pickShown, currentPick, fromPress),
        script = script,
        reducedMotion = reduced,
        hold = holdPicked,
        onPick = { id ->
            pickShown = id
            pick.pick(id, after = tapJob)
        },
        onDismiss = {
            passagesOpen = false
            pickShown = null
        },
    )
    if (picking) ResonatePicker(
        session, cardId, detail.card.referenceCardId,
        onWriteNew = onWriteNew,
        onResonated = { picking = false },
        onDismiss = { picking = false },
    )
}

/** The faces' line's height (§U1.2: 44 on the web and iOS, 48 here, a finger's) — over the capsule since round 30. */
internal val Row2Height = 48.dp

/**
 * How far in from the tags' row's end (a phone, round 28 §S3) 收藏's glyph stands, in its 48 to the finger flush with
 * that end: the web's — its glyph centred in a 44 button (a finger's pointer) on the row's end — so its 48 box keeps
 * the finger's room and only the glyph moves (centred, it stood 14 in). Wide, it is the byline's ⋯'s: [BylineGlyphEnd].
 */
internal val Row2GlyphEnd = 12.dp

/** 收藏's glyph (the web's 20). */
internal val BookmarkGlyph = 20.dp

/**
 * The faces' line (§U1.2, round 28 §S4; "row 2" while it stood under the capsule — round 30 §S1 stands it right over
 * it, 0 between): as wide as the capsule ([modifier] gives the width), [Row2Height] tall — [faces] centred on
 * [facesCentre] (the 共振 segment's centre from the capsule's start, round 29 §S11: one, two or three faces alike),
 * never past the line's start, centred in its height; nothing at its end (收藏 ends the capsule's row or the tags').
 */
@Composable
internal fun EndRowTwo(modifier: Modifier, facesCentre: Dp, faces: @Composable () -> Unit) {
    androidx.compose.ui.layout.Layout(
        content = { Box { faces() } },
        modifier = modifier.height(Row2Height),
    ) { measurables, constraints ->
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val group = measurables[0].measure(loose)
        val width = constraints.maxWidth
        val height = constraints.maxHeight.takeIf { it != androidx.compose.ui.unit.Constraints.Infinity } ?: Row2Height.roundToPx()
        layout(width, height) {
            val left = (facesCentre.toPx() - group.width / 2f).roundToInt().coerceAtLeast(0)
            group.place(left, (height - group.height) / 2)
        }
    }
}

/**
 * A reader's end, top to bottom (round 30 §S1, §S2): the faces' line ([EndRowTwo], [faces] centred on [facesCentre]),
 * 0 between, the capsule's (first) line — with [bookmark] at the column's end when wide ([EndBeside]) — its
 * [secondLine] [EndRowLayout.LINE_GAP] under it when it takes two, and the [note]'s place under them ([NoteInPlace]
 * keeps its own 12 over the field). Heard in that order: the faces, 共振, 寄小紙條, 用卡片回應, 收藏, the field.
 */
@Composable
internal fun ReaderEndStack(
    capsuleWidth: Dp,
    facesCentre: Dp,
    faces: @Composable () -> Unit,
    firstLine: @Composable () -> Unit,
    bookmark: (@Composable () -> Unit)?,
    secondLine: (@Composable () -> Unit)?,
    note: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        // Always there, faces or none, so the capsule never moves as faces come (the reader's own sliding in).
        EndRowTwo(Modifier.width(capsuleWidth), facesCentre, faces)
        if (bookmark != null) EndBeside(main = firstLine, end = bookmark, modifier = Modifier.fillMaxWidth()) else firstLine()
        if (secondLine != null) {
            Spacer(Modifier.height(EndRowLayout.LINE_GAP.dp))
            secondLine()
        }
        note()
    }
}

/** The words `--es cardEnd lines` opens the note on: three lines, as the web's and iOS's `card-note-lines` (screens.ts). */
internal const val VISUAL_NOTE_LINES = "讀到早晨屬於自己的那段，\n想起我第一次一個人搬出來住，\n也是這樣手忙腳亂地沖咖啡。"

/** How long after the last keystroke a note's draft is written down. */
private const val NOTE_DRAFT_DELAY_MS = 400L

/** The card's note draft as the field holds it now (none clears it). */
private fun keepDraft(session: Session, cardId: String, text: String) {
    val drafts = session.noteDrafts ?: return
    if (text.isBlank()) drafts.clear(cardId) else if (drafts.text(cardId) != text) drafts.keep(cardId, text)
}

/**
 * 收藏 (§U1.2, round 28): a glyph alone at the end of the tags' row or the capsule's, a 48 square to the finger — a bare glyph (the web's BareIconButton): the
 * muted text ink with the one pen (INK) at rest and once saved, drawn filled then, never the capsule's label brown —
 * its glyph [glyphEnd] in from the square's end ([Row2GlyphEnd], where the web's stands; [BylineGlyphEnd] beside the
 * capsule). Named by what a tap does (收藏 / 取消收藏, what the flows say to it).
 */
@Composable
internal fun BookmarkButton(saved: Boolean, glyphEnd: androidx.compose.ui.unit.Dp = Row2GlyphEnd, onClick: () -> Unit) {
    val label = if (saved) L10n.Card.Bookmark.remove else L10n.Card.Bookmark.add
    Box(
        Modifier
            .size(48.dp)
            .plainClickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics { contentDescription = label },
        contentAlignment = Alignment.CenterEnd,
    ) {
        OrganicIcon(
            IconName.Bookmark, Modifier.padding(end = glyphEnd), size = BookmarkGlyph, color = Tokens.TextMuted,
            fill = if (saved) Tokens.TextMuted else null,
            strokeWidth = Tokens.Ink.value,
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
