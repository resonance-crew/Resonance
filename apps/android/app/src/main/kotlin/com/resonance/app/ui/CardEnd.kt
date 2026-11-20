package com.resonance.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.resonance.api.models.Author
import com.resonance.api.models.CardTap
import com.resonance.api.models.Me
import com.resonance.design.SegmentedLayout
import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * How the end of a story lays out its three answers (round 26 §U1.3): 共振 · 寄小紙條 · 用卡片回應 in one capsule
 * ([Full]); the reply's short words 寫卡片 ([Short]) where the content is narrow (≤ 340), in English, with large text,
 * or where the full words don't fit; and, when even those don't fit, two lines ([TwoLines]): 共振 alone on the first,
 * 寄小紙條 · 寫卡片 on the second, 8 between. No segment is ever hidden or cut to its glyph.
 */
internal enum class EndRowForm { Full, Short, TwoLines }

internal object EndRowLayout {
    /** At most this wide (dp), a column takes the short words whatever fits (§U1.3). */
    const val NARROW = 340f

    /** A text scale past this is "large text" (§U1.3): the short words. */
    const val LARGE_TEXT = 1.15f

    /** Between the two lines of [EndRowForm.TwoLines] (dp). */
    const val LINE_GAP = 8f

    /** A segment's own width at a phone's padding: its padding, glyph, gap and words, a dp to spare ([SegmentedLayout]'s). */
    fun natural(label: Float, pad: Float = SegmentedLayout.PAD): Float = 2 * pad + SegmentedLayout.ICON + SegmentedLayout.GAP + label + 1f

    /** What the three segments need side by side, their words [labels] wide (dp) at [pad] a side. */
    fun need(labels: List<Float>, pad: Float = SegmentedLayout.PAD): Float = labels.sumOf { natural(it, pad).toDouble() }.toFloat()

    /**
     * The form for a column [room] wide, the segments' words measured [full] (共振, 寄小紙條, 用卡片回應) and [short]
     * (共振, 寄小紙條, 寫卡片); [english] or [largeText] take the short words at once.
     */
    fun choose(full: List<Float>, short: List<Float>, room: Float, english: Boolean, largeText: Boolean): EndRowForm {
        val pad = if (room < SegmentedLayout.SPREAD_BELOW) SegmentedLayout.PAD else SegmentedLayout.WIDE_PAD
        val shortWords = english || largeText || room <= NARROW
        if (!shortWords && need(full, pad) <= room + 0.5f) return EndRowForm.Full
        if (need(short, pad) <= room + 0.5f) return EndRowForm.Short
        return EndRowForm.TwoLines
    }

    /**
     * How wide the capsule stands (dp) — and row 2 under it, as wide: a phone's column whole (the bar spans it), a wider
     * one the segments' own widths, never past the room. Two lines span the column.
     */
    fun capsuleWidth(labels: List<Float>, room: Float, form: EndRowForm): Float {
        if (form == EndRowForm.TwoLines || room < SegmentedLayout.SPREAD_BELOW) return room
        return minOf(room, need(labels, SegmentedLayout.WIDE_PAD))
    }
}

/**
 * What the reply's segment says and draws, from the card you answered this one with (round 26 §U1.1: 用卡片回應, the
 * old 共振 — never 連結, never the link glyph): still looking or none, 用卡片回應 / 寫卡片 with the cards glyph; a draft,
 * 修改 with the pen; published, 已回應 with the tick (a card is written: that is done).
 */
internal class ReplyAction private constructor(val label: String, val icon: IconName) {
    sealed interface Mine {
        data object None : Mine
        data class Found(val published: Boolean) : Mine
    }

    companion object {
        fun of(mine: Mine?, short: Boolean): ReplyAction = when {
            mine is Mine.Found && mine.published -> ReplyAction(L10n.Card.Reply.done, IconName.Check)
            mine is Mine.Found -> ReplyAction(L10n.Card.modify, IconName.Pen)
            else -> ReplyAction(if (short) L10n.Card.Reply.short else L10n.Card.Reply.label, IconName.Cards)
        }
    }
}

/**
 * The tap's segment (§U1.1): 共振 with the wave at rest; on, two waves in phase on the solid face — the same words, so
 * nothing in the capsule moves (the owner, 2026-11-20: 已共振 moved the wave beside it). TalkBack hears it checked.
 */
internal val tapLabel: String get() = L10n.Card.Tap.label
internal fun tapIcon(on: Boolean): IconName = if (on) IconName.WavePair else IconName.Wave

/**
 * The faces under the capsule (§U2) as the viewer sees them: the viewer's own face first while their tap is on
 * ([mine]), then their connections who tapped (the author's: the newest tappers), all of them as the server gave them,
 * and whether it knows [more]. The server's `CardDetail.tap`, then the viewer's taps drawn at once ([withViewer]).
 * Only the drawing cuts them to [MAX] ([shown], then the blank disc: [showsMore]) — kept whole, a tap turned on and
 * off again gives back the face it pushed out (iOS's TapState keeps them so too).
 */
internal data class TapFaces(val mine: Boolean, val faces: List<Author>, val more: Boolean) {
    /** After the viewer's tap went [on]: their face first, or gone — the others keep their order. [viewer] is who they are. */
    fun withViewer(viewer: Author, on: Boolean): TapFaces {
        val others = faces.filter { it.id != viewer.id }
        return if (on) TapFaces(true, listOf(viewer) + others, more) else TapFaces(false, others, more)
    }

    /** The faces drawn: [MAX] at most. */
    val shown: List<Author> get() = faces.take(MAX)

    /** The blank disc after them: more people than the faces drawn (a fourth face pushed out tells there are more). */
    val showsMore: Boolean get() = more || faces.size > MAX

    /** Only the viewer's own face: nothing to open (§U2.4) — read as 你共振了. */
    fun selfOnly(viewerId: String?): Boolean = faces.size == 1 && !more && faces[0].id == viewerId

    val isEmpty: Boolean get() = faces.isEmpty()

    companion object {
        const val MAX = 3
        val NONE = TapFaces(false, emptyList(), false)

        fun of(tap: CardTap?): TapFaces = tap?.let { TapFaces(it.mine, it.faces, it.more) } ?: NONE
    }
}

/** The viewer as a face: the [known] author record of them when the app has one (its avatar's seed), else from [me]. */
internal fun viewerFace(me: Me, known: Author?): Author =
    known?.takeIf { it.id == me.id }?.copy(handle = me.handle, initials = me.initials, accentColor = me.accentColor, avatarUrl = me.avatarUrl)
        ?: Author(id = me.id, handle = me.handle, initials = me.initials, accentColor = me.accentColor, avatarUrl = me.avatarUrl, avatarSeed = null, verified = false, region = me.region)

/**
 * What a screen reader says of the faces (§U2.4) — never shown: the reader's 「你連結的人裡，與這張卡片共振的：小安、阿明，
 * 還有其他人」 (their own face first said as 你共振了), the author's 「與這張卡片共振的人：…」; only the viewer's own face,
 * 你共振了.
 */
internal fun facesLabel(faces: TapFaces, viewerId: String?, author: Boolean): String {
    val zh = Strings.language == Strings.Language.ZhTW
    val list = if (zh) "、" else ", "
    val and = if (zh) "，" else ", "
    // The faces drawn, then the disc: what is said is what is seen.
    val more = faces.showsMore
    val others = faces.shown.filter { it.id != viewerId }.map { it.handle }
    if (others.isEmpty() && !more) return if (faces.mine) L10n.Card.Tap.selfOnly else ""
    val names = others.joinToString(list) + if (more) (if (others.isEmpty()) "" else and) + L10n.Card.Tap.more else ""
    val said = if (author) L10n.Card.Tap.facesAuthor(names) else L10n.Card.Tap.facesReader(names)
    return if (faces.mine && !author) L10n.Card.Tap.selfOnly + and + said else said
}

/**
 * The viewer's tap as the segment shows it (§U1.6): flipped at once, then sent — one request at a time, each saying
 * what the segment shows by then, so flips made while one is on its way end where the last one left it. A refusal
 * puts it back as the server last had it and says so ([onFailed]: the toast 沒送出去，再試一次).
 *
 * Its requests run where [launch] puts them — the account's scope ([com.resonance.app.Session.launch]), never the end
 * row's: a reader who taps and then leaves the page, or scrolls the story's end away, before the server answers still
 * has their tap sent, the page told ([send]'s own work) and a refusal said (iOS sends from a task that outlives the view).
 */
internal class TapSwitch(
    initial: Boolean,
    private val launch: (suspend CoroutineScope.() -> Unit) -> Job,
    private val send: suspend (Boolean) -> Boolean,
    private val onFailed: () -> Unit = {},
) {
    var on by mutableStateOf(initial)
        private set
    private var server = initial
    private val lock = Mutex()

    /** The server's word on it, from a page read again: shown unless a flip is on its way. */
    fun read(now: Boolean) {
        if (!lock.isLocked) {
            server = now
            on = now
        }
    }

    fun flip(): Job {
        on = !on
        return launch {
            lock.withLock {
                val want = on
                if (want == server) return@withLock
                try {
                    server = send(want)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    on = server
                    onFailed()
                    return@withLock
                }
                if (on == want) on = server
            }
        }
    }
}
