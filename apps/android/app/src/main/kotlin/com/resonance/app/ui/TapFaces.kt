package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.TapList
import com.resonance.api.models.TapPerson
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.AvatarGroup
import com.resonance.design.ButtonVariant
import com.resonance.design.GroupFace
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.ModalGap
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The faces under the capsule and on the author's line (§U2.2): the apps' 28. */
internal val TapFaceSize: Dp = 28.dp

/**
 * How far below its place the reader's own face starts rising (round 34 (9)): from centred in the faces' line
 * ([Row2Height], over 共振 with 0 between) to its top on the line's foot — wholly inside the segment, out of sight.
 */
internal val OwnFaceRise: Dp = (Row2Height + TapFaceSize) / 2

/**
 * On the author's line, from the wave to the first face's rim: where that rim has stood since §U3.1 — the 8 before the
 * group, and the 3 of the paper pad the face sat on then. The pads are gone (the owner, round 26); the face stays put.
 */
internal val AuthorFacesGap: Dp = 11.dp

/** A face's group record: its avatar as [HandDrawnAvatar] draws it everywhere else. */
@Composable
internal fun Author.groupFace(): GroupFace = GroupFace(id, initials, avatarUrl, accent(), avatarSeedValue())

/**
 * The faces of the people who resonated (round 26 §U2 — the owner: 「避免直接使用文字說…直接放那個頭像就好」): stacked, no
 * words on screen, at most three and nothing after them (round 29 §S5: no blank disc — who else, the list says). The whole group is one button opening the list (48 tall to
 * the finger) — except when the only face is the viewer's own ([TapFaces.selfOnly]): then it is no button, read as
 * 你共振了. A screen reader hears who ([facesLabel]); nothing on screen says it. Nothing when there are no faces.
 * [author]: the author's line — the 16 wave before the faces, inside the hit area (§U3.1).
 */
@Composable
internal fun TapFacesButton(
    faces: TapFaces,
    viewerId: String?,
    author: Boolean,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    /** The reader's own face alone still opens the list: the card offers passages, and their row picks one (round 27 §U3). */
    selfOpens: Boolean = false,
) {
    val reduced = LocalContext.current.prefersReducedMotion()
    // No faces: nothing to say or open — but the group stays composed, so a face taken back slides out.
    val none = faces.isEmpty
    val self = !author && !selfOpens && faces.selfOnly(viewerId)
    val label = facesLabel(faces, viewerId, author)
    val group: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (author && !none) {
                OrganicIcon(IconName.Wave, size = 16.dp, color = Tokens.TextMuted)
                Spacer(Modifier.width(AuthorFacesGap))
            }
            // Round 34 (9): a reader's own face rises out of 共振 (the segment right under this line, whose top edge is
            // this line's foot, clips it) and sinks back into it — from its place to under the line's foot.
            AvatarGroup(
                faces.shown.map { it.groupFace() }, size = TapFaceSize, reducedMotion = reduced,
                rise = if (author) null else viewerId, riseBy = OwnFaceRise,
            )
        }
    }
    Box(
        modifier
            .heightIn(min = 48.dp)
            // The line's foot is the 共振 segment's top edge: a rising face is seen only above it.
            .then(if (author) Modifier else Modifier.clipToBounds())
            // The flows find the faces by it (maestro/flows/tap.yaml: the viewer's face slides in).
            .flowTag(if (author) "author-taps" else "tap-faces")
            .then(
                if (none) Modifier.clearAndSetSemantics { }
                else if (self) Modifier.clearAndSetSemantics { contentDescription = label }
                else Modifier
                    .plainClickable(role = Role.Button, onClick = onOpen)
                    // The clickable's role and action stay (they are this node's); the faces inside are said as one name.
                    .clearAndSetSemantics { contentDescription = label },
            ),
        contentAlignment = Alignment.CenterStart,
    ) { group() }
}

/**
 * The people behind the faces, a page at a time (§U2.5, §U3.2): the author's 30 a page with 顯示更多 for the next, a
 * reader's one page. [first] reads the first page; [more] the next; a failure keeps what was read and says so.
 */
@Stable
internal class TapPeople(private val load: suspend (pageToken: String?) -> TapList) {
    var people by mutableStateOf<List<TapPerson>>(emptyList())
        private set
    var next by mutableStateOf<String?>(null)
        private set
    var loading by mutableStateOf(false)
        private set
    var loaded by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set

    suspend fun first() = read(null, replace = true)

    suspend fun more() {
        val token = next ?: return
        read(token, replace = false)
    }

    private suspend fun read(token: String?, replace: Boolean) {
        if (loading) return
        loading = true
        failed = false
        try {
            val page = load(token)
            people = if (replace) page.people else (people + page.people).distinctBy { it.author.id }
            next = page.nextPageToken
            loaded = true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            failed = true
        } finally {
            loading = false
        }
    }
}

/**
 * Where a row of the author's list leads (§U3.2): someone who left a note on this named card, to that conversation
 * (an unconnected reader's is the letter; replying connects, as today); someone who only tapped can't be replied to
 * — their profile. An anonymous card's rows never open a thread.
 */
internal fun tapRowRoute(person: TapPerson, anonymous: Boolean): Route =
    if (!anonymous && person.note != null) Route.Thread(person.author.handle, uid = person.author.id)
    else Route.Author(person.author.handle)

/** The row's muted second line: the first line of their note on a named card; nothing on an anonymous one. */
internal fun tapRowExcerpt(person: TapPerson, anonymous: Boolean): String? =
    if (anonymous) null else person.note?.excerpt?.takeIf { it.isNotBlank() }

/**
 * What a row of who resonated says under the pen name (round 27 §U2, §U3): the [quote] of the passage that person
 * picked (「…」, muted, 2 lines), or — the reader's own row on a card offering passages, with none picked — [pick]
 * (選一段, in the tonal label's ink); then the note's [excerpt] (2 lines). Nothing: the row is as before, 60 tall.
 */
internal data class TapRowLines(val quote: String? = null, val pick: Boolean = false, val excerpt: String? = null) {
    companion object {
        val NONE = TapRowLines()
    }
}

/**
 * The lines for [person]'s row. The author's list ([author]): every row's pick, then its note's first line (none on an
 * anonymous card). A reader's list: their own row ([viewerId]) — their pick, or 選一段 when the card offers passages
 * ([offersPassages]) — and, since Wave 2 #3b (everyone's picks are seen, 「像按讚一樣」), every other row's pick as the
 * server sent it; never a note on a reader's list, on a named card or an anonymous one (M3: the server sends none).
 */
internal fun tapRowLines(
    person: TapPerson,
    anonymous: Boolean,
    author: Boolean,
    viewerId: String?,
    offersPassages: Boolean,
    pagePick: PagePick? = null,
): TapRowLines {
    val listed = person.passage?.text?.takeIf { it.isNotBlank() }
    if (author) return TapRowLines(quote = listed, excerpt = tapRowExcerpt(person, anonymous))
    if (viewerId == null || person.author.id != viewerId) return listed?.let { TapRowLines(quote = it) } ?: TapRowLines.NONE
    // On a card offering passages the page knows the reader's pick before the list does (the list may have been read
    // while the pick's request was still on its way): the own row says the page's, as the web's.
    val quote = if (offersPassages && pagePick != null) pagePick.text?.takeIf { it.isNotBlank() } else listed
    return TapRowLines(quote = quote, pick = quote == null && offersPassages)
}

/** The reader's pick as the card page holds it now (its words, or null for none): what their own row says (§U3). */
internal data class PagePick(val text: String?)

/** The author's list shows 顯示更多 while there is a next page and it isn't being read. */
internal fun showsMore(list: TapPeople): Boolean = list.next != null && !list.loading

/**
 * A reader's list behind the faces (§U2.5, as the owner's look of 2026-11-19 amends it: 「我在想这个直接做成这个 model
 * 会不会好一点呢」 — 「手机上已经是这个 model 的设计了」): the same people as the faces, without the cap, in the phone's
 * dialog on every device ([ReaderTapDialog]). Never a bottom sheet, never a popover.
 */
@Composable
internal fun ReaderTapList(
    session: Session,
    cardId: String,
    onDismiss: () -> Unit,
    open: (Route) -> Unit,
    /** The card offers passages (round 27 §U3): the reader's own row says their pick, or 選一段, and opens [onOwnRow]. */
    offersPassages: Boolean = false,
    onOwnRow: () -> Unit = {},
    /** The reader's pick as the page holds it (a pick just made shows at once, before the list knows it). */
    pagePick: PagePick? = null,
    /** The faces over the capsule (at most 3): the rows while the first page is read past the wait (round 33 §Q1). */
    expected: List<Author> = emptyList(),
    /** The page's list, its first page read while the faces stand (round 34 (8)); none: read from the press. */
    list: TapPeople? = null,
) {
    val own = remember(cardId) { TapPeople { token -> session.taps.taps(cardId, token) } }
    val list = list ?: own
    // Round 33 §Q1: drawn once its first page has answered, or after the family's wait with the faces as its rows.
    if (!rememberFirstPageReady(list)) return
    val viewerId = session.uid
    ReaderTapDialog(list, onDismiss, lines = { tapRowLines(it, anonymous = true, author = false, viewerId, offersPassages, pagePick) }, expected = expected) { p ->
        onDismiss()
        if (readerRowPicks(p, viewerId, offersPassages)) onOwnRow() else open(Route.Author(p.author.handle))
    }
}

/** Where a row of the reader's list leads (§U3): their own, on a card offering passages, to the dialog; any other, the profile. */
internal fun readerRowPicks(person: TapPerson, viewerId: String?, offersPassages: Boolean): Boolean =
    offersPassages && viewerId != null && person.author.id == viewerId

/**
 * The reader's list as it is drawn: a centred dialog [readerListWidth] wide — **no visible title** (the reader sees only
 * connections; a title would claim all) — the rows of 60 with a face of 36 and the pen name, each [onRow] (to the
 * profile), their bands from the paper's edge to its edge, and 關閉 floating at the foot's end ([TapListModal]).
 */
@Composable
internal fun ReaderTapDialog(
    list: TapPeople,
    onDismiss: () -> Unit,
    lines: (TapPerson) -> TapRowLines = { TapRowLines.NONE },
    /** Who the first page will hold (the faces over the capsule): its rows while it is read. */
    expected: List<Author>? = null,
    onRow: (TapPerson) -> Unit,
) {
    val width = readerListWidth(LocalWindowLayout.current.cls)
    TapListModal(onDismiss, L10n.Card.Tap.label, seed = 41.0, exit = L10n.Native.close, maxWidth = width) {
        TapRows(list, TapRowMeasure.dialog(LocalWindowLayout.current.cls), lines = lines, expected = expected, onRow = onRow)
    }
}

/**
 * The reader's dialog's widest: a phone's 400 (min(the column, 400)); wider, the author's list's 480 — the width of
 * the app's other one-exit dialogs there ([AuthorTapList], the media dialog).
 */
internal fun readerListWidth(cls: LayoutClass): Dp = if (cls == LayoutClass.Compact) 400.dp else 480.dp

/**
 * What the author sees where a reader's row would be (§U3.1): one line — a 16 wave in the muted ink, 8 before the
 * faces, inside the hit area — and the three newest tappers' faces, nothing after them (round 29 §S5). Nothing when
 * no one has tapped; no number anywhere. It opens the author's list ([AuthorTapList]).
 */
@Composable
internal fun AuthorTaps(session: Session, cardId: String, faces: TapFaces, anonymous: Boolean, open: (Route) -> Unit, modifier: Modifier = Modifier, launchOpen: Boolean = false) {
    if (faces.isEmpty) return
    var showing by remember(cardId) { mutableStateOf(launchOpen) }
    TapFacesButton(faces, session.uid, author = true, onOpen = { showing = true }, modifier = modifier)
    if (showing) AuthorTapList(session, cardId, anonymous, onDismiss = { showing = false }, open = open, expected = faces.shown)
}

/**
 * The author's list (§U3.2): a centred dialog on every device, 480 wide, titled 與這張卡片共振的人 — 30 rows, then
 * 顯示更多 (tonal) for the next page: the face of 36, the pen name and, when that person left a note on this named
 * card, a muted second line with its first words, tapping to that conversation ([tapRowRoute]); someone who only
 * tapped, to their profile. An anonymous card: faces and names only.
 */
@Composable
internal fun AuthorTapList(
    session: Session,
    cardId: String,
    anonymous: Boolean,
    onDismiss: () -> Unit,
    open: (Route) -> Unit,
    /** The author's line's faces: the rows while the first page is read past the wait (round 33 §Q1). */
    expected: List<Author> = emptyList(),
) {
    val list = remember(cardId) { TapPeople { token -> session.taps.taps(cardId, token) } }
    if (!rememberFirstPageReady(list)) return
    AuthorTapDialog(list, anonymous, onDismiss, expected) { p ->
        onDismiss()
        open(tapRowRoute(p, anonymous))
    }
}

/**
 * The author's list as it is drawn (§U3.2; round 33 §Q2–§Q3): titled, the rows from the paper's edge to its edge, 顯示更多
 * for the next page at the list's end, 關閉 floating at the foot's end ([TapListModal]).
 */
@Composable
internal fun AuthorTapDialog(
    list: TapPeople,
    anonymous: Boolean,
    onDismiss: () -> Unit,
    expected: List<Author>? = null,
    onRow: (TapPerson) -> Unit,
) {
    val scope = rememberCoroutineScope()
    TapListModal(onDismiss, L10n.Card.ResonatorsModal.title, seed = 43.0, exit = L10n.Native.close, maxWidth = 480.dp) {
        TapListTitle(L10n.Card.ResonatorsModal.title)
        TapRows(list, TapRowMeasure.dialog(LocalWindowLayout.current.cls), lines = { tapRowLines(it, anonymous, author = true, viewerId = null, offersPassages = false) }, expected = expected, onRow = onRow)
        if (showsMore(list)) TapListMore { scope.launch { list.more() } }
    }
}

/** A family dialog's title in its scroll region, on the rows' faces' edge ([TapListInset]), 10 over what follows. */
@Composable
internal fun TapListTitle(title: String) {
    val size = tapListText(LocalWindowLayout.current.cls).title
    Box(Modifier.fillMaxWidth().padding(horizontal = TapListInset).padding(bottom = TapListTitleGap)) {
        // ModalTitle's face and leading, at the family's size for the device.
        BasicText(title, style = AppFonts.heading(size, lineHeight = 1.3f))
    }
}

/** The title to the first row (round 29 §S12, round 32 §P1: 10). */
internal val TapListTitleGap = 10.dp

/** 顯示更多 at a list's end, centred, the modal's 14 over it. */
@Composable
internal fun TapListMore(onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(top = ModalGap), contentAlignment = Alignment.Center) {
        OrganicButton(L10n.Home.moreBtn, variant = ButtonVariant.Tonal, small = true, onClick = onClick)
    }
}

/**
 * A row of who resonated, measured for where it stands: [height] at least, the [face], [inset] from the paper's edge to
 * the face (and from the name's end), [gap] from the face to the name, the name at [handle] sp.
 */
internal data class TapRowMeasure(val height: Dp, val face: Dp, val inset: Dp, val gap: Dp, val handle: Float, val line: Float = 13f) {
    companion object {
        /**
         * A dialog's (the reader's and the author's, on every device): 60, a face of 36 — its band from the paper's edge
         * to its edge, the face and the words [TapListInset] in (round 33 §Q2: the title's edge and the button's); the
         * pen name and the lines under it at [TapListText]'s sizes for [cls] (round 34: a tablet's reading sizes).
         */
        fun dialog(cls: LayoutClass): TapRowMeasure = tapListText(cls).let { TapRowMeasure(60.dp, 36.dp, TapListInset, 12.dp, it.handle, it.line) }
    }
}

/**
 * The tap-list family's type sizes (sp, so the system's text size still scales them) — round 34 (the owner, on the
 * iPad: 名单弹窗里面的字体太小…没有适配平板阅读字级): a phone keeps its own (the title 20, the pen name 15, the quote and
 * the note 13, a sentence 16); a tablet (wider than [LayoutClass.Compact]) reads one step up — 22, 17, 15, 18 (the
 * story's own 18 for a sentence). The pill and 顯示更多 stay the design system's small pill (14) on both.
 */
internal data class TapListText(val title: Float, val handle: Float, val line: Float, val sentence: Float)

internal fun tapListText(cls: LayoutClass): TapListText =
    if (cls == LayoutClass.Compact) TapListText(title = 20f, handle = 15f, line = 13f, sentence = 16f)
    else TapListText(title = 22f, handle = 17f, line = 15f, sentence = 18f)

/** The list's rows: banded, each the face, the pen name and the excerpt; while read, the known faces' rows. */
@Composable
internal fun TapRows(
    list: TapPeople,
    measure: TapRowMeasure,
    lines: (TapPerson) -> TapRowLines,
    /**
     * Who the first page will hold, as the page already knows (round 32 §P3, round 33 §Q1: a picked sentence's faces,
     * the faces over the capsule, the author's line's): while it is read, those rows as they will stand — the face, the
     * pen name — as many as the faces known, never a default count. Null or none: nothing yet.
     */
    expected: List<Author>? = null,
    onRow: (TapPerson) -> Unit,
) {
    val people = list.people
    when {
        !list.loaded && list.failed -> {
            val scope = rememberCoroutineScope()
            Column(Modifier.fillMaxWidth().padding(horizontal = measure.inset), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Native.loadError, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
                OrganicButton(L10n.Native.retry, variant = ButtonVariant.Tonal, small = true) { scope.launch { list.first() } }
            }
        }
        !list.loaded -> Column(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = L10n.Home.moreLoading }) {
            val known = expected.orEmpty()
            val keys = known.map { "tap:" + it.id }
            val below = bandsBelow(keys, ListBands.EndKey)
            known.forEachIndexed { i, a ->
                val source = remember(a.id) { MutableInteractionSource() }
                TapRow(TapPerson(a, null), TapRowLines.NONE, measure, keys[i], below[i], source, onClick = null)
            }
        }
        else -> Column(Modifier.fillMaxWidth()) {
            val keys = people.map { "tap:" + it.author.id }
            val below = bandsBelow(keys, ListBands.EndKey)
            people.forEachIndexed { i, p ->
                val source = remember(p.author.id) { MutableInteractionSource() }
                TapRow(p, lines(p), measure, keys[i], below[i], source) { onRow(p) }
            }
            if (list.failed) BasicText(
                L10n.Native.loadError,
                style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted),
                modifier = Modifier.padding(horizontal = measure.inset, vertical = 8.dp),
            )
        }
    }
}

/** One row of who resonated: the face, the pen name and the row's [said] lines; [onClick] null — a row being read, not pressable yet. */
@Composable
private fun TapRow(
    p: TapPerson,
    said: TapRowLines,
    measure: TapRowMeasure,
    topKey: String,
    bottomKey: String,
    source: MutableInteractionSource,
    onClick: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = measure.height)
            // Round 33 §Q2: the band from the paper's edge to its edge (the dialog's region reaches them, the paper's
            // wobble clipping it under its pen line), never the rounded inset card of round 26.
            .listBand(topKey, bottomKey, source, { false }, cut = false)
            .then(if (onClick != null) Modifier.plainClickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(horizontal = measure.inset, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(measure.gap),
    ) {
        HandDrawnAvatar(p.author.initials, p.author.avatarUrl, p.author.accent(), measure.face, p.author.avatarSeedValue())
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(p.author.handle, style = AppFonts.body(measure.handle, 600, lineHeight = 1.4f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            // The pick (the author's own sentence: here it may be cut), or 選一段; then the note's first line.
            if (said.quote != null) BasicText(
                L10n.Card.Tap.passageQuote(said.quote),
                style = AppFonts.body(measure.line, lineHeight = 1.45f, color = Tokens.TextMuted),
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            else if (said.pick) BasicText(
                L10n.Card.Tap.passagePick,
                style = AppFonts.body(measure.line, lineHeight = 1.45f, color = Tokens.ButtonOnTonal),
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            if (said.excerpt != null) BasicText(
                said.excerpt,
                style = AppFonts.body(measure.line, lineHeight = 1.45f, color = Tokens.TextMuted),
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
