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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
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
import com.resonance.design.PaperPopover
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.prefersReducedMotion
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** The faces under the capsule and on the author's line (§U2.2): the apps' 28. */
internal val TapFaceSize: Dp = 28.dp

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
) {
    if (faces.isEmpty) return
    val reduced = LocalContext.current.prefersReducedMotion()
    val self = !author && faces.selfOnly(viewerId)
    val label = facesLabel(faces, viewerId, author)
    val group: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (author) {
                OrganicIcon(IconName.Wave, size = 16.dp, color = Tokens.TextMuted)
                Spacer(Modifier.width(8.dp))
            }
            AvatarGroup(faces.faces.map { it.groupFace() }, faces.more, size = TapFaceSize, reducedMotion = reduced)
        }
    }
    Box(
        modifier
            .heightIn(min = 48.dp)
            .then(
                if (self) Modifier.clearAndSetSemantics { contentDescription = label }
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

/** The author's list shows 顯示更多 while there is a next page and it isn't being read. */
internal fun showsMore(list: TapPeople): Boolean = list.next != null && !list.loading

/**
 * A reader's list behind the faces (§U2.5): the same people as the faces, without the cap. On a phone a centred
 * modal (min(column, 400), **no visible title** — the reader sees only connections; a title would claim all —, the
 * close at its foot, banded rows of 60 with a face of 36 and the pen name, each to the profile); wider, a popover under
 * the faces ([PaperPopover]: 8 below, start-aligned, 280 wide, rows 52 with faces of 28, six rows then it scrolls).
 * Never a bottom sheet. Called inside the faces' own Box (the popover hangs from it).
 */
@Composable
internal fun ReaderTapList(session: Session, cardId: String, onDismiss: () -> Unit, open: (Route) -> Unit) {
    val list = remember(cardId) { TapPeople { token -> session.taps.taps(cardId, token) } }
    LaunchedEffect(list) { list.first() }
    val phone = LocalWindowLayout.current.cls == LayoutClass.Compact
    val go: (TapPerson) -> Unit = { p ->
        onDismiss()
        open(Route.Author(p.author.handle))
    }
    if (phone) {
        OrganicModal(onDismiss, L10n.Card.Tap.label, seed = 41.0, closeLabel = L10n.Native.close, maxWidth = 400.dp) {
            TapRows(list, rowHeight = 60.dp, face = 36.dp, anonymous = true, onRow = go)
            ModalCloseButton(L10n.Native.close, onDismiss)
        }
    } else {
        PaperPopover(onDismiss, width = 280.dp, paneTitle = L10n.Card.Tap.label) {
            Column(Modifier.heightIn(max = 52.dp * 6 + 12.dp).verticalScroll(rememberScrollState()).padding(vertical = 6.dp)) {
                TapRows(list, rowHeight = 52.dp, face = TapFaceSize, anonymous = true, bands = false, onRow = go)
            }
        }
    }
}

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
        TapRows(list, rowHeight = 60.dp, face = 36.dp, anonymous = anonymous) { p ->
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

/** The list's rows: banded (a dialog's), each the face, the pen name and the excerpt; the rows' shapes while read. */
@Composable
private fun TapRows(list: TapPeople, rowHeight: Dp, face: Dp, anonymous: Boolean, bands: Boolean = true, onRow: (TapPerson) -> Unit) {
    val people = list.people
    when {
        !list.loaded && list.failed -> {
            val scope = rememberCoroutineScope()
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                BasicText(L10n.Native.loadError, style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted))
                OrganicButton(L10n.Native.retry, variant = ButtonVariant.Tonal, small = true) { scope.launch { list.first() } }
            }
        }
        !list.loaded -> Column(Modifier.clearAndSetSemantics { contentDescription = L10n.Home.moreLoading }) {
            repeat(3) {
                Row(Modifier.fillMaxWidth().height(rowHeight).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(face).background(Mixes.SkeletonBase, RoundedCornerShape(face * 0.35f)))
                    Spacer(Modifier.width(12.dp))
                    Box(Modifier.width(96.dp).height(12.dp).background(Mixes.SkeletonBase, RoundedCornerShape(6.dp)))
                }
            }
        }
        else -> Column(Modifier.fillMaxWidth()) {
            val keys = people.map { "tap:" + it.author.id }
            val below = bandsBelow(keys, ListBands.EndKey)
            people.forEachIndexed { i, p ->
                val source = remember(p.author.id) { MutableInteractionSource() }
                val excerpt = tapRowExcerpt(p, anonymous)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = rowHeight)
                        .then(if (bands) Modifier.listBand(keys[i], below[i], source, { false }, cut = true) else Modifier)
                        .plainClickable(role = Role.Button) { onRow(p) }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    HandDrawnAvatar(p.author.initials, p.author.avatarUrl, p.author.accent(), face, p.author.avatarSeedValue())
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        BasicText(p.author.handle, style = AppFonts.body(15f, 600, lineHeight = 1.4f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (excerpt != null) BasicText(
                            excerpt,
                            style = AppFonts.body(13f, lineHeight = 1.45f, color = Tokens.TextMuted),
                            maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            if (list.failed) BasicText(
                L10n.Native.loadError,
                style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted),
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}
