package com.resonance.app.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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
import com.resonance.design.Mixes
import com.resonance.design.ModalCloseButton
import com.resonance.design.ModalTitle
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicModal
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
 * On the author's line, from the wave to the first face's rim: where that rim has stood since §U3.1 — the 8 before the
 * group, and the 3 of the paper pad the face sat on then. The pads are gone (the owner, round 26); the face stays put.
 */
internal val AuthorFacesGap: Dp = 11.dp

/** A face's group record: its avatar as [HandDrawnAvatar] draws it everywhere else. */
@Composable
internal fun Author.groupFace(): GroupFace = GroupFace(id, initials, avatarUrl, accent(), avatarSeedValue())

/**
 * The faces of the people who resonated (round 26 §U2 — the owner: 「避免直接使用文字說…直接放那個頭像就好」): stacked, no
 * words on screen, the blank disc when there are more. The whole group is one button opening the list (48 tall to
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
            AvatarGroup(faces.shown.map { it.groupFace() }, faces.showsMore, size = TapFaceSize, reducedMotion = reduced)
        }
    }
    Box(
        modifier
            .heightIn(min = 48.dp)
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
 * anonymous card). A reader's list: their own row alone ([viewerId]) — their pick, or 選一段 when the card offers
 * passages ([offersPassages]) — and no other row ever a second line, on a named card or an anonymous one (M3).
 */
internal fun tapRowLines(person: TapPerson, anonymous: Boolean, author: Boolean, viewerId: String?, offersPassages: Boolean): TapRowLines {
    val quote = person.passage?.text?.takeIf { it.isNotBlank() }
    if (author) return TapRowLines(quote = quote, excerpt = tapRowExcerpt(person, anonymous))
    if (viewerId == null || person.author.id != viewerId) return TapRowLines.NONE
    return TapRowLines(quote = quote, pick = quote == null && offersPassages)
}

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
) {
    val list = remember(cardId) { TapPeople { token -> session.taps.taps(cardId, token) } }
    LaunchedEffect(list) { list.first() }
    val viewerId = session.uid
    ReaderTapDialog(list, onDismiss, lines = { tapRowLines(it, anonymous = true, author = false, viewerId, offersPassages) }) { p ->
        onDismiss()
        if (readerRowPicks(p, viewerId, offersPassages)) onOwnRow() else open(Route.Author(p.author.handle))
    }
}

/** Where a row of the reader's list leads (§U3): their own, on a card offering passages, to the dialog; any other, the profile. */
internal fun readerRowPicks(person: TapPerson, viewerId: String?, offersPassages: Boolean): Boolean =
    offersPassages && viewerId != null && person.author.id == viewerId

/**
 * The reader's list as it is drawn: a centred dialog [readerListWidth] wide — **no visible title** (the reader sees only
 * connections; a title would claim all) — the banded rows of 60 with a face of 36 and the pen name, each [onRow] (to the
 * profile), and 關閉 at the foot's end, as every one-exit dialog.
 */
@Composable
internal fun ReaderTapDialog(
    list: TapPeople,
    onDismiss: () -> Unit,
    lines: (TapPerson) -> TapRowLines = { TapRowLines.NONE },
    onRow: (TapPerson) -> Unit,
) {
    val width = readerListWidth(LocalWindowLayout.current.cls)
    OrganicModal(onDismiss, L10n.Card.Tap.label, seed = 41.0, closeLabel = L10n.Native.close, maxWidth = width) {
        TapRows(list, TapRowMeasure.Dialog, lines = lines, onRow = onRow)
        ModalCloseButton(L10n.Native.close, onDismiss)
    }
}

/**
 * The reader's dialog's widest: a phone's 400 (min(the column, 400)); wider, the author's list's 480 — the width of
 * the app's other one-exit dialogs there ([AuthorTapList], the media dialog).
 */
internal fun readerListWidth(cls: LayoutClass): Dp = if (cls == LayoutClass.Compact) 400.dp else 480.dp

/**
 * What the author sees where a reader's row would be (§U3.1): one line — a 16 wave in the muted ink, 8 before the
 * faces, inside the hit area — and the three newest tappers' faces, the blank disc when there are more. Nothing when
 * no one has tapped; no number anywhere. It opens the author's list ([AuthorTapList]).
 */
@Composable
internal fun AuthorTaps(session: Session, cardId: String, faces: TapFaces, anonymous: Boolean, open: (Route) -> Unit, modifier: Modifier = Modifier, launchOpen: Boolean = false) {
    if (faces.isEmpty) return
    var showing by remember(cardId) { mutableStateOf(launchOpen) }
    TapFacesButton(faces, session.uid, author = true, onOpen = { showing = true }, modifier = modifier)
    if (showing) AuthorTapList(session, cardId, anonymous, onDismiss = { showing = false }, open = open)
}

/**
 * The author's list (§U3.2): a centred dialog on every device, 480 wide, titled 與這張卡片共振的人 — 30 rows, then
 * 顯示更多 (tonal) for the next page: the face of 36, the pen name and, when that person left a note on this named
 * card, a muted second line with its first words, tapping to that conversation ([tapRowRoute]); someone who only
 * tapped, to their profile. An anonymous card: faces and names only.
 */
@Composable
internal fun AuthorTapList(session: Session, cardId: String, anonymous: Boolean, onDismiss: () -> Unit, open: (Route) -> Unit) {
    val list = remember(cardId) { TapPeople { token -> session.taps.taps(cardId, token) } }
    val scope = rememberCoroutineScope()
    LaunchedEffect(list) { list.first() }
    OrganicModal(onDismiss, L10n.Card.ResonatorsModal.title, seed = 43.0, closeLabel = L10n.Native.close, maxWidth = 480.dp) {
        ModalTitle(L10n.Card.ResonatorsModal.title)
        TapRows(list, TapRowMeasure.Dialog, lines = { tapRowLines(it, anonymous, author = true, viewerId = null, offersPassages = false) }) { p ->
            onDismiss()
            open(tapRowRoute(p, anonymous))
        }
        if (showsMore(list)) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                OrganicButton(L10n.Home.moreBtn, variant = ButtonVariant.Tonal, small = true) { scope.launch { list.more() } }
            }
        }
        ModalCloseButton(L10n.Native.close, onDismiss)
    }
}

/**
 * A row of who resonated, measured for where it stands: [height] at least, the [face], [inset] from the paper's edge to
 * the face (and from the name's end), [gap] from the face to the name, the name at [handle] sp.
 */
internal data class TapRowMeasure(val height: Dp, val face: Dp, val inset: Dp, val gap: Dp, val handle: Float) {
    companion object {
        /** A dialog's (the reader's and the author's, on every device): 60, a face of 36, its bands' own 12 in. */
        val Dialog = TapRowMeasure(60.dp, 36.dp, 12.dp, 12.dp, 15f)
    }
}

/** The list's rows: banded, each the face, the pen name and the excerpt; the rows' shapes while read. */
@Composable
private fun TapRows(list: TapPeople, measure: TapRowMeasure, lines: (TapPerson) -> TapRowLines, onRow: (TapPerson) -> Unit) {
    val rowHeight = measure.height
    val face = measure.face
    val people = list.people
    when {
        !list.loaded && list.failed -> {
            val scope = rememberCoroutineScope()
            Column(Modifier.fillMaxWidth().padding(horizontal = measure.inset), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Native.loadError, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
                OrganicButton(L10n.Native.retry, variant = ButtonVariant.Tonal, small = true) { scope.launch { list.first() } }
            }
        }
        !list.loaded -> Column(Modifier.clearAndSetSemantics { contentDescription = L10n.Home.moreLoading }) {
            repeat(3) {
                Row(Modifier.fillMaxWidth().height(rowHeight).padding(horizontal = measure.inset), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(face).background(Mixes.SkeletonBase, RoundedCornerShape(face * 0.35f)))
                    Spacer(Modifier.width(measure.gap))
                    Box(Modifier.width(96.dp).height(12.dp).background(Mixes.SkeletonBase, RoundedCornerShape(6.dp)))
                }
            }
        }
        else -> Column(Modifier.fillMaxWidth()) {
            val keys = people.map { "tap:" + it.author.id }
            val below = bandsBelow(keys, ListBands.EndKey)
            people.forEachIndexed { i, p ->
                val source = remember(p.author.id) { MutableInteractionSource() }
                val said = lines(p)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = rowHeight)
                        .listBand(keys[i], below[i], source, { false }, cut = true)
                        .plainClickable(role = Role.Button) { onRow(p) }
                        .padding(horizontal = measure.inset, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(measure.gap),
                ) {
                    HandDrawnAvatar(p.author.initials, p.author.avatarUrl, p.author.accent(), face, p.author.avatarSeedValue())
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        BasicText(p.author.handle, style = AppFonts.body(measure.handle, 600, lineHeight = 1.4f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        // The pick (the author's own sentence: here it may be cut), or 選一段; then the note's first line.
                        if (said.quote != null) BasicText(
                            L10n.Card.Tap.passageQuote(said.quote),
                            style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.TextMuted),
                            maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                        else if (said.pick) BasicText(
                            L10n.Card.Tap.passagePick,
                            style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.ButtonOnTonal),
                            maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                        if (said.excerpt != null) BasicText(
                            said.excerpt,
                            style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.TextMuted),
                            maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            if (list.failed) BasicText(
                L10n.Native.loadError,
                style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted),
                modifier = Modifier.padding(horizontal = measure.inset, vertical = 8.dp),
            )
        }
    }
}
