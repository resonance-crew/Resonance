package com.resonance.app.thoughtmap

import android.graphics.Paint
import android.util.Log
import android.util.LruCache
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Path
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.GeometryCache
import com.resonance.design.toPath
import com.resonance.geometry.EdgeGeometry
import com.resonance.geometry.MapCamera
import com.resonance.geometry.MapGroupRect
import com.resonance.geometry.PathCommand
import com.resonance.geometry.Pt
import com.resonance.geometry.Rect
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.arrowHeadPath
import com.resonance.geometry.autoMag
import com.resonance.geometry.autoSegments
import com.resonance.geometry.fitCameraClear
import com.resonance.geometry.majorityGroupId
import com.resonance.geometry.mapNodeH
import com.resonance.geometry.mapNodeRect
import com.resonance.geometry.mapNodeW
import com.resonance.geometry.organicEdgePath
import com.resonance.geometry.rectContains
import com.resonance.geometry.resolveOverlap
import com.resonance.geometry.screenToWorld
import com.resonance.geometry.seedFromString
import com.resonance.geometry.wobRect
import com.resonance.geometry.zoomAt
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.FeedLoader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/** A card on my map. Position and filing are snapshot state of their own, so dragging one card redraws just that card. */
@Stable
class MapNode(val cardId: String, x: Double, y: Double, groupId: String?) {
    var x by mutableDoubleStateOf(x)
    var y by mutableDoubleStateOf(y)
    var groupId: String? by mutableStateOf(groupId)
}

/** A directed arrow between two of my cards (`{source}_{target}`), with its optional words. */
@Stable
class MapEdge(val id: String, val sourceCardId: String, val targetCardId: String, label: String) {
    var label by mutableStateOf(label)
}

/** A region (分類): a titled, tinted box cards are filed into. */
@Stable
class MapGroup(val id: String, title: String, val hue: Double, x: Double, y: Double, w: Double, h: Double) {
    var title by mutableStateOf(title)
    var x by mutableDoubleStateOf(x)
    var y by mutableDoubleStateOf(y)
    var w by mutableDoubleStateOf(w)
    var h by mutableDoubleStateOf(h)

    val rect: Rect get() = Rect(x, y, w, h)
}

/** An arrow's drawn geometry in world units: its curve and head as paths, cached until an end moves. */
class EdgeGeo(val geo: EdgeGeometry, val path: Path, val head: Path)

/**
 * A side of a card an arrow can be drawn out of (the web's `NodeSide`): its link handle's centre, card-local,
 * on the side's middle and straddling the outline (`.linkHandle[data-side]`: a 28 circle 15 out). The arrow
 * docks to whichever side faces the finger (`organicEdgePath`), so which handle starts it changes nothing else.
 */
enum class LinkSide(val cx: Double, val cy: Double) {
    Top(mapNodeW / 2, -1.0),
    Right(mapNodeW + 1, mapNodeH / 2),
    Bottom(mapNodeW / 2, mapNodeH + 1),
    Left(-1.0, mapNodeH / 2);

    /** How deep a card-local point lies inside the card's edge on this side (along its inward normal; outside, negative). */
    fun depth(lx: Double, ly: Double): Double = when (this) {
        Top -> ly
        Right -> mapNodeW - lx
        Bottom -> mapNodeH - ly
        Left -> lx
    }
}

/**
 * The thought map's state and its gestures — ThoughtMapCanvas.tsx without the
 * DOM, the twin of iOS's ThoughtMapStore. Edits are optimistic and written
 * through when a gesture ends (no debounce), exactly as on the web; the web's
 * pointer handlers are one state machine here, fed every touch by
 * `MapTouchSurface`, with hit-testing done in world coordinates in the web's
 * paint order. Every position is in dp (the web's CSS px).
 */
class ThoughtMapStore(private val reading: ReadingApi) {
    sealed interface Selection {
        data class Node(val id: String) : Selection
        data class Edge(val id: String) : Selection
        data class Group(val id: String) : Selection
    }

    data class LinkDraft(val sourceId: String, val wx: Double, val wy: Double)

    var loaded by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set

    // Insertion order is paint order (a new card or region lands on top), so each collection keeps its order beside its map.
    val nodes = mutableStateMapOf<String, MapNode>()
    val nodeOrder = mutableStateListOf<String>()
    val edges = mutableStateMapOf<String, MapEdge>()
    val edgeOrder = mutableStateListOf<String>()
    val groups = mutableStateMapOf<String, MapGroup>()
    val groupOrder = mutableStateListOf<String>()
    var cards by mutableStateOf<Map<String, MapCard>>(emptyMap())
        private set
    private var cardOrder: List<String> = emptyList()
    var resonated by mutableStateOf<Set<String>>(emptySet())
        private set

    /** `screen = world × s + (x, y)`; read while drawing, so a pan or pinch redraws without recomposing. */
    var camera by mutableStateOf(MapCamera(0.0, 0.0, 1.0))

    /**
     * The camera frames everything on the map — what 顯示全部 (👁) does — from the moment a visit
     * shows the map, and frames it again whenever what the map shows changes size (the workspace's
     * pane easing open, the divider let go, the tablet turned), a card opens in the pane beside it,
     * or what is on it arrives (a read finishing after the map has its size), until the reader
     * pans, pinches or zooms it themself; 顯示全部 hands the camera back to it (round 13, the web's
     * `followFitRef`).
     */
    var framing = true
        private set
    var viewportW = 0.0
        private set
    var viewportH = 0.0
        private set

    /**
     * The workspace's divider is held: the map's size is noted as it changes but nothing is framed again
     * until it is let go — framing everything on each frame of the drag zoomed every card on the map
     * under the finger. Let go, everything is framed in the width it was left at (still [framing]).
     */
    var resizing = false
        set(value) {
            if (field == value) return
            field = value
            if (!value) frameIfFraming()
        }

    /** How far the controls floating over the map reach in from its top (Leave and the tools) and its foot (the zoom sheet), in dp as the screen measures them: framing everything keeps the cards clear of them. */
    private var chromeTop = 0.0
    private var chromeBottom = 0.0
    var selection by mutableStateOf<Selection?>(null)
    var dragNodeId by mutableStateOf<String?>(null)
        private set
    var linkDraft by mutableStateOf<LinkDraft?>(null)
        private set
    var panning by mutableStateOf(false)
        private set
    var trayOpen by mutableStateOf(false)
    var editingGroupId by mutableStateOf<String?>(null)
    var groupDraft by mutableStateOf("")
    var editingEdgeId by mutableStateOf<String?>(null)
    var labelDraft by mutableStateOf("")

    /** Opening a card from its tab (the screen decides where: writer or card page). */
    var onOpen: (MapCard) -> Unit = {}

    private var service: ThoughtMapService? = null
    /**
     * When everything was last read, and the count of card changes it had seen then (the session
     * keeps this store between visits: see [open]).
     */
    private var readAt: Long? = null
    private var seenChanges = 0
    /**
     * Every read begun, numbered; the latest of the whole board ([load]) and of all my cards ([load],
     * [refreshCards]); and of each card read on its own (`refreshCards(ids)`). The cards change under
     * reads on their way — a card moved to the trash and restored a moment later is read twice — and an
     * answer a newer read of the same cards took over never puts back what was before it (the card
     * box's `readBy`).
     */
    private var reads = 0
    private var boardRead = 0
    private var allCardsRead = 0
    private val cardRead = HashMap<String, Int>()
    /**
     * How long the map's first read may keep it on its loader: past it, the map says it couldn't read
     * and offers 再試一次 (a read Firestore never answers — a stream stuck reconnecting — has no end of
     * its own). The read still shows the map should it answer, unless 再試一次 started a newer one.
     */
    internal var firstReadPatience: Duration = 10.seconds
    /** The whole board as a read finds it, and one card as it is now (the map's reads, apart for tests). */
    internal var readBoard: suspend (ThoughtMapService) -> Board = { read(it) }
    internal var readCard: suspend (ThoughtMapService, String) -> MapCard? = { service, id -> service.card(id) }
    // Writes outlive the screen (they are the gesture's ending), like iOS's unstructured Tasks.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    companion object {
        val groupHues = listOf(88.0, 215.0, 290.0, 140.0, 55.0, 18.0)
        val nodeHues = listOf(55.0, 290.0, 140.0, 88.0, 215.0, 18.0)

        /**
         * A card's action tab (TAB_X, TAB_W, TAB_H in ThoughtMapNode.tsx). It holds 開啟 alone: 移除 lives in
         * the card's opposite corner (the owner, 2026-10-29: side by side, one was tapped for the other).
         */
        const val tabX = 24.0
        const val tabW = 64.0
        const val tabH = 30.0

        /**
         * 移除 (off the map), across the card from 開啟: its icon's middle inside the selected card's
         * bottom-right, on the meta row's line, its edge on the content's 16 padding (the web's `.nodeRemove`).
         */
        const val removeX = mapNodeW - 23
        const val removeY = mapNodeH - 21

        /**
         * The most 移除's box reaches each way, in world units, however far out the map is zoomed: grown with the
         * finger's reach (22 on screen) it covered the card's whole bottom-right quarter at 0.6× and below, and a
         * press meant to drag the card took it off the map, with no undo.
         */
        const val removeReach = 18.0

        /** How deep inside a card's edge a link handle still takes a press: past it, the press is the card's (it drags). */
        const val handleDepth = 14.0

        /** A region can't shrink below a card with room around it. */
        const val minGroupW = mapNodeW + 60
        const val minGroupH = mapNodeH + 80

        /** [cam] moved, at its own zoom, so the middle of [rect] sits at the middle of a [vw] × [vh] viewport. */
        fun centredOn(cam: MapCamera, rect: Rect, vw: Double, vh: Double): MapCamera =
            cam.copy(x = vw / 2 - (rect.x + rect.w / 2) * cam.s, y = vh / 2 - (rect.y + rect.h / 2) * cam.s)

        fun hue(card: MapCard): Double = card.accentHue ?: nodeHues[seedFromString(card.id) % nodeHues.size]

        suspend fun read(service: ThoughtMapService): Board = coroutineScope {
            val mapJob = async { service.load() }
            val cardJob = async { service.cards() }
            val m = mapJob.await()
            val c = cardJob.await()
            val byId = LinkedHashMap(c.cards)
            // A placed card older than the newest 40 is still on the map: read it by id.
            val missing = m.nodes.map { it.cardId }.filter { byId[it] == null }
            for (card in service.cards(missing)) byId[card.id] = card
            Board(m, byId, c.resonated)
        }

        /** As the feed: what was read longer ago than this is read again. */
        val STALE_AFTER_MS = FeedLoader.STALE_AFTER.inWholeMilliseconds

        fun refresh(loaded: Boolean, readAt: Long?, seenChanges: Int, changes: Int, lastChange: Session.CardChange?, now: Long): Refresh {
            if (!loaded || readAt == null || now < readAt || now - readAt >= STALE_AFTER_MS) return Refresh.Everything
            if (changes == seenChanges) return Refresh.Nothing
            // One change since, naming its card: just that card (and the one it answers).
            val id = lastChange?.cardId
            if (changes == seenChanges + 1 && id != null) return Refresh.Cards(listOfNotNull(id, lastChange.referenceCardId))
            return Refresh.AllCards
        }

        /**
         * Out of view, the nodes whose card is gone ([known] false), into [parked]; back in view, the
         * parked ones whose card is known again, where they were (at the end of the drawing order).
         */
        fun parkNodes(nodes: MutableMap<String, MapNode>, order: MutableList<String>, parked: MutableMap<String, MapNode>, known: (String) -> Boolean) {
            for (id in order.toList()) if (!known(id)) {
                nodes.remove(id)?.let { parked[id] = it }
                order.remove(id)
            }
            for ((id, node) in parked.toList()) if (known(id) && nodes[id] == null) {
                nodes[id] = node
                order.add(id)
                parked.remove(id)
            }
        }

        /** The label pill's size in world units (TagPill sm: 10px 600 uppercase at 0.04em, 3×10 padding). */
        fun pillSize(text: String): Pair<Double, Double> =
            Pair(Math.ceil(MapText.width(text.uppercase(), AppFonts.Family.Body, 600, 10f, 0.04f).toDouble()) + 20, 19.0)
    }

    // Visits

    /** What a visit to the map (or a change from the writer while it is open) reads again. */
    sealed interface Refresh {
        /** What was read stands. */
        data object Nothing : Refresh
        /** The cards the writer just changed (the card, and the one it answers). */
        data class Cards(val ids: List<String>) : Refresh
        /** Every card, the map as it is. */
        data object AllCards : Refresh
        /** The map and its cards: never read, or read longer ago than [STALE_AFTER_MS]. */
        data object Everything : Refresh
    }

    /**
     * A visit. The session keeps this store between visits: one within [STALE_AFTER_MS] of the last
     * read shows what it read at once, reading again only the cards the writer changed since; a
     * later one reads everything again, behind what it shows. What a visit was in the middle of (a
     * selection, the tray, an open editor) doesn't carry over, nor where the last one left the
     * camera: every visit opens framing everything ([framing]).
     */
    suspend fun open(uid: String, changes: Int, lastChange: Session.CardChange?, now: Long = System.currentTimeMillis()) {
        visit()
        run(refresh(loaded && service?.uid == uid, readAt, seenChanges, changes, lastChange, now), uid, changes)
    }

    /** What a visit starts from: nothing picked or being typed, and the camera framing everything on the map. */
    internal fun visit() {
        selection = null
        trayOpen = false
        editingGroupId = null
        editingEdgeId = null
        touchesCancelled()
        framing = true
        frameIfFraming()
    }

    /** A card changed while the map is open (a card of it was being edited in the writer). */
    suspend fun cardsChanged(uid: String, changes: Int, lastChange: Session.CardChange?) {
        if (!loaded) return
        run(refresh(true, readAt, seenChanges, changes, lastChange, System.currentTimeMillis()), uid, changes)
    }

    private suspend fun run(refresh: Refresh, uid: String, changes: Int) {
        // Seen from now on, so a visit and the writer's change don't both read for it.
        if (refresh != Refresh.Nothing) seenChanges = changes
        when (refresh) {
            Refresh.Nothing -> Unit
            is Refresh.Cards -> refreshCards(refresh.ids)
            Refresh.AllCards -> refreshCards()
            Refresh.Everything -> load(uid)
        }
    }

    // Loading

    /** What a read of the whole board found: the map, my cards and the originals I resonated with. */
    class Board(val map: ThoughtMapService.Loaded, val cards: Map<String, MapCard>, val resonated: Set<String>)

    /**
     * Reads the whole board (再試一次 too, which shows the loader again). Only the latest read's
     * answer is shown; a first read with no answer past [firstReadPatience] says so (再試一次).
     */
    suspend fun load(uid: String) {
        val service = ThoughtMapService(uid, reading).also { this.service = it }
        val earlierBoard = boardRead
        val earlierAll = allCardsRead
        val read = begin()
        boardRead = read
        allCardsRead = read
        failed = false
        val started = System.currentTimeMillis()
        coroutineScope {
            val patience = launch {
                delay(firstReadPatience)
                if (!loaded && boardRead == read) failed = true
            }
            try {
                val board = readBoard(service)
                if (boardRead != read) return@coroutineScope
                val (byId, resonated) = merged(board.cards, board.resonated, read, ids = null)
                place(board.map, byId, resonated)
                readAt = started
            } catch (e: Exception) {
                // Failed, or left: an earlier read still on its way may answer in its place.
                if (allCardsRead == read) allCardsRead = earlierAll
                val latest = boardRead == read
                if (latest) boardRead = earlierBoard
                if (e is CancellationException) throw e
                Log.w("ThoughtMap", "load failed", e)
                if (latest) failed = !loaded
            } finally {
                patience.cancel()
            }
        }
    }

    private fun begin(): Int = ++reads

    /**
     * The cards shown with read [read]'s [answer] laid over them — every card ([ids] null: absent
     * from the answer, gone) or just [ids] — except a card a newer read has begun for since, which
     * stays as it is until that read's answer. A whole read hands its cards over in its own order
     * (the drafts last edited first); a read of a few keeps the order shown.
     */
    private fun merged(answer: Map<String, MapCard>, others: Set<String>, read: Int, ids: Collection<String>?): Pair<Map<String, MapCard>, Set<String>> {
        val asked = ids?.toSet()
        val byId = LinkedHashMap<String, MapCard>()
        val resonated = resonated.toMutableSet()
        for (id in if (asked == null) answer.keys + cards.keys else cards.keys + asked) {
            val laid = (asked == null || id in asked) && max(allCardsRead, cardRead[id] ?: 0) <= read
            (if (laid) answer[id] else cards[id])?.let { byId[id] = it }
            if (!laid) continue
            if (id in others) resonated += id else resonated -= id
        }
        return byId to resonated
    }

    /**
     * The map as it was read, with its cards: what it shows from now on. A card that's gone
     * (deleted, in the trash, an original I can no longer read) drops out of view; its place is
     * kept, for a card that comes back (a restore). Still [framing], the camera frames it.
     */
    internal fun place(board: ThoughtMapService.Loaded, byId: Map<String, MapCard>, resonated: Set<String>) {
        applyCards(byId, resonated)
        nodes.clear()
        nodeOrder.clear()
        parked.clear()
        for (n in board.nodes) {
            val node = MapNode(n.cardId, n.x, n.y, n.groupId)
            if (cards[n.cardId] != null) {
                nodes[n.cardId] = node
                nodeOrder.add(n.cardId)
            } else parked[n.cardId] = node
        }
        edges.clear()
        edgeOrder.clear()
        for (e in board.edges) {
            edges[e.id] = MapEdge(e.id, e.sourceCardId, e.targetCardId, e.label)
            edgeOrder.add(e.id)
        }
        groups.clear()
        groupOrder.clear()
        for (g in board.groups) {
            groups[g.id] = MapGroup(g.id, g.title, g.hue, g.x, g.y, g.w, g.h)
            groupOrder.add(g.id)
        }
        loaded = true
        failed = false
        frameIfFraming()
    }

    /** Titles and tags may have changed in the writer: refresh the cards, keep the map. */
    suspend fun refreshCards() {
        val service = service ?: return
        val earlier = allCardsRead
        val read = begin()
        allCardsRead = read
        val (answer, others) = try {
            val c = service.cards()
            val byId = LinkedHashMap(c.cards)
            val missing = (nodeOrder + parked.keys).filter { byId[it] == null }
            for (card in service.cards(missing)) byId[card.id] = card
            byId to c.resonated
        } catch (e: Exception) {
            // Failed, or left: an earlier read still on its way may answer in its place.
            if (allCardsRead == read) allCardsRead = earlier
            if (e is CancellationException) throw e
            Log.w("ThoughtMap", "refresh failed", e)
            return
        }
        val (shown, resonated) = merged(answer, others, read, ids = null)
        applyCards(shown, resonated)
        parkNodes(nodes, nodeOrder, parked, cards::containsKey)
        frameIfFraming()
    }

    /**
     * Just these cards, as they are now: one that's gone (deleted, or an original I can no longer
     * read) drops out of view, as a fresh load would leave it; one that couldn't be read for now
     * stays as it was. Laid over the cards as they are when it answers, not as they were when it
     * began: the trash's read of a card landing after its restore's leaves the card back on the map.
     */
    suspend fun refreshCards(ids: List<String>) {
        val service = service ?: return
        val read = begin()
        val earlier = ids.associateWith { cardRead[it] }
        for (id in ids) cardRead[id] = read
        // A card this read couldn't read for now (or was left before it answered): an earlier read of it may still answer for it.
        fun giveBack(id: String) {
            if (cardRead[id] != read) return
            val before = earlier[id]
            if (before == null) cardRead.remove(id) else cardRead[id] = before
        }
        val answer = HashMap<String, MapCard>()
        val others = HashSet<String>()
        val answered = LinkedHashSet<String>()
        try {
            for (id in ids) {
                val found = try {
                    readCard(service, id)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    continue
                }
                answered += id
                if (found != null) {
                    answer[id] = found
                    // Someone else's: the original of my resonance.
                    if (found.authorId != service.uid) others += id
                }
            }
        } catch (e: CancellationException) {
            ids.forEach(::giveBack)
            throw e
        }
        ids.filter { it !in answered }.forEach(::giveBack)
        val (shown, resonated) = merged(answer, others, read, answered)
        applyCards(shown, resonated)
        parkNodes(nodes, nodeOrder, parked, cards::containsKey)
        frameIfFraming()
    }

    /**
     * The places of cards that are gone for now (in the trash, made private): out of view, kept, so
     * a card that comes back — a restore — returns to where it was, its arrows with it. A fresh load
     * reads them from the map again.
     */
    private val parked = HashMap<String, MapNode>()

    private fun applyCards(byId: Map<String, MapCard>, resonated: Set<String>) {
        cards = byId
        // Newest first, drafts (no date) last — the order the web's query hands them over;
        // drafts keep the order they were read in (the last edited first; the sort is stable).
        cardOrder = byId.values.sortedWith { a, b ->
            val pa = a.publishedAt
            val pb = b.publishedAt
            when {
                pa != null && pb != null -> pb.compareTo(pa)
                pa != null -> -1
                pb != null -> 1
                else -> 0
            }
        }.map { it.id }
        this.resonated = resonated
    }

    /** What the map shows changed size (laid out first, the pane easing open, the divider let go, a turn): still [framing], everything framed in it. */
    fun setViewport(w: Double, h: Double) {
        if (w == viewportW && h == viewportH) return
        viewportW = w
        viewportH = h
        if (!resizing) frameIfFraming()
    }

    /** The controls over the map were laid out (or moved): still [framing], everything framed clear of them. */
    fun setChromeClear(top: Double, bottom: Double) {
        if (top == chromeTop && bottom == chromeBottom) return
        chromeTop = top
        chromeBottom = bottom
        frameIfFraming()
    }

    private fun frameIfFraming() {
        if (!framing || !loaded || viewportW <= 0 || viewportH <= 0) return
        val rects = nodeOrder.mapNotNull { nodeRect(it) } + groupOrder.mapNotNull { groups[it]?.rect }
        camera = fitCameraClear(rects, viewportW, viewportH, chromeTop, chromeBottom)
    }

    /** The reader moved the camera themself (a pan, a pinch, a zoom button): it stays where they put it. */
    private fun takeCamera() {
        framing = false
    }

    // Derived

    val isEmpty: Boolean get() = nodes.isEmpty() && groups.isEmpty()

    fun nodeRect(id: String): Rect? = nodes[id]?.let { mapNodeRect(it.x, it.y) }

    val groupRects: List<MapGroupRect>
        get() = groupOrder.mapNotNull { groups[it] }.map { MapGroupRect(it.id, it.rect) }

    private fun isFiled(id: String): Boolean = nodes[id]?.groupId?.let { groups[it] } != null

    /** Paint order: filed cards (inside their region's clip, regions in order), then free cards. */
    val filedOrder: List<String> get() = nodeOrder.filter { isFiled(it) }
    val freeOrder: List<String> get() = nodeOrder.filter { !isFiled(it) }

    /** Cards not on the map yet, drafts first, then newest. */
    val trayCards: List<MapCard>
        get() {
            val off = cardOrder.mapNotNull { cards[it] }.filter { nodes[it.id] == null }
            return off.filter { it.publishedAt == null } + off.filter { it.publishedAt != null }
        }

    /** The region a dragged card is being filed into shows as an open folder. */
    fun hotGroupId(): String? = dragNodeId?.let { nodes[it]?.groupId }

    /** The node an arrow in progress would land on. */
    val linkTarget: String?
        get() {
            val d = linkDraft ?: return null
            return nodeOrder.firstOrNull { it != d.sourceId && nodes[it]?.let { n -> rectContains(mapNodeRect(n.x, n.y), Pt(d.wx, d.wy)) } == true }
        }

    // Camera

    fun zoom(factor: Double) {
        takeCamera()
        camera = zoomAt(camera, viewportW / 2, viewportH / 2, factor)
    }

    /** 顯示全部 (👁): everything framed, and kept framed as the map changes size, until the reader moves it again. */
    fun fit() {
        framing = true
        frameIfFraming()
    }

    /**
     * The map's width settled beside the workspace's pane (opened with it or shown again, another
     * card opened in it, the divider let go). Still [framing]: everything framed in that width, and
     * nothing to glide to (null). Once the reader has moved the camera: the camera that brings the
     * pane's card [cardId] to the middle of the map, at the zoom it is at (null: none, or not on the map).
     */
    fun settledBesidePane(cardId: String?): MapCamera? {
        if (framing) {
            frameIfFraming()
            return null
        }
        return cardId?.let(::centring)
    }

    /** The camera that shows card [id] in the middle of the map as it is laid out now, at the zoom it is at; null when the card isn't on the map. */
    fun centring(id: String): MapCamera? {
        val r = nodeRect(id) ?: return null
        if (viewportW <= 0 || viewportH <= 0) return null
        return centredOn(camera, r, viewportW, viewportH)
    }

    /** A finger is on the map: a glide toward a card gives way to it. */
    val touching: Boolean get() = touches.isNotEmpty()

    // Geometry the layers share

    private val regionPaths = LruCache<String, Path>(96)

    /** A region's wobbly box, in world units at its own origin (cached by size, since it regenerates with it). */
    fun regionPath(g: MapGroup): Path {
        val w = g.w
        val h = g.h
        return regionPaths.get("${g.id}|$w|$h") ?: run {
            val options = WobRectOptions(
                curve = 0.6, cornerOffset = 5.0,
                segmentsH = SegValue.Count(autoSegments(w).toDouble()), segmentsV = SegValue.Count(autoSegments(h).toDouble()),
            )
            val cmds = GeometryCache.get("region|${g.id}|$w|$h") {
                wobRect(w, h, min(34.0, min(w, h) / 2), seedFromString(g.id).toDouble(), autoMag(w, h), options)
            }
            cmds.toPath(1f).also { regionPaths.put("${g.id}|$w|$h", it) }
        }
    }

    private class EdgeCacheEntry(val sx: Double, val sy: Double, val tx: Double, val ty: Double, val geo: EdgeGeo)

    private val edgeCache = HashMap<String, EdgeCacheEntry>()

    /** The arrow's curve between its two cards, redrawn only when one of them has moved. */
    fun edgeGeometry(edge: MapEdge): EdgeGeo? {
        val s = nodes[edge.sourceCardId] ?: return null
        val t = nodes[edge.targetCardId] ?: return null
        val sx = s.x
        val sy = s.y
        val tx = t.x
        val ty = t.y
        edgeCache[edge.id]?.let { if (it.sx == sx && it.sy == sy && it.tx == tx && it.ty == ty) return it.geo }
        val seed = seedFromString(edge.id).toDouble()
        val geo = organicEdgePath(mapNodeRect(sx, sy), mapNodeRect(tx, ty), seed)
        val head = arrowHeadPath(Pt(geo.end.x, geo.end.y), geo.endAngle, 13.0, seed + 7)
        val built = EdgeGeo(geo, geo.path.toPath(1f), head.toPath(1f))
        edgeCache[edge.id] = EdgeCacheEntry(sx, sy, tx, ty, built)
        return built
    }

    fun labelText(edge: MapEdge): String = edge.label.ifEmpty { L10n.Me.ThoughtMap.edgeLabelPlaceholder }

    fun showsLabel(edge: MapEdge): Boolean =
        edge.label.isNotEmpty() || selection == Selection.Edge(edge.id) || editingEdgeId == edge.id

    // Hit-testing (the web's paint order, top first)

    sealed interface Hit {
        data class EdgeLabel(val id: String) : Hit
        /** The selected card's tab: 開啟, the whole of it. */
        data class TabOpen(val id: String) : Hit
        /** 移除: the trash inside the selected card's bottom-right corner (it was the tab's second button). */
        data class NodeRemove(val id: String) : Hit
        data class LinkHandle(val id: String, val side: LinkSide) : Hit
        data class Node(val id: String) : Hit
        data class GroupTitle(val id: String) : Hit
        data class GroupDelete(val id: String) : Hit
        data class GroupResize(val id: String) : Hit
        data class Edge(val id: String) : Hit
        data class Group(val id: String) : Hit
        data object Empty : Hit
    }

    fun hitTest(px: Double, py: Double): Hit {
        val w = screenToWorld(camera, px, py)
        val s = camera.s
        // A finger is wider than the web's pointer: small targets get at least ~22dp of reach.
        val reach = max(0.0, 22 / s)
        for (id in edgeOrder.asReversed()) {
            val e = edges[id] ?: continue
            if (!showsLabel(e) || editingEdgeId == id) continue
            val g = edgeGeometry(e) ?: continue
            val (pw, ph) = pillSize(labelText(e))
            if (abs(w.x - g.geo.mid.x) <= pw / 2 + 4 / s && abs(w.y - g.geo.mid.y) <= ph / 2 + 6 / s) return Hit.EdgeLabel(id)
        }
        val sel = selection
        if (sel is Selection.Node && dragNodeId == null) {
            nodes[sel.id]?.takeIf { insideClip(it, w) }?.let { n ->
                val lx = w.x - n.x
                val ly = w.y - n.y
                val r = max(14.0, reach)
                // 開啟 top-left on its tab, 移除 bottom-right inside the card: diagonally apart (~200), never mistaken for each other.
                if (ly >= -tabH && ly < 2 && lx >= tabX && lx <= tabX + tabW) return Hit.TabOpen(sel.id)
                val rr = min(r, removeReach)
                if (abs(lx - removeX) <= rr && abs(ly - removeY) <= rr) return Hit.NodeRemove(sel.id)
                if (linkDraft == null) linkSideAt(lx, ly, r)?.let { return Hit.LinkHandle(sel.id, it) }
            }
        }
        for (id in (filedOrder + freeOrder).asReversed()) {
            val n = nodes[id] ?: continue
            if (rectContains(clippedRect(n), w)) return Hit.Node(id)
        }
        for (id in groupOrder.asReversed()) {
            val g = groups[id] ?: continue
            val corner = resizeCorner(g)
            if (hypot(w.x - corner.x, w.y - corner.y) <= max(11.0, reach)) return Hit.GroupResize(id)
            // The trash's 28 box 20 in from the top and right (its icon's middle 34 from each), the title's row
            // beside it, 60 short of the right edge (the web's `.groupDelete`, `.groupTitle`).
            val dx = g.x + g.w - 34
            val dy = g.y + 34
            if (abs(w.x - dx) <= max(14.0, reach) && abs(w.y - dy) <= max(14.0, reach)) return Hit.GroupDelete(id)
            if (w.x >= g.x && w.x <= g.x + g.w - 60 && w.y >= g.y && w.y <= g.y + 56) return Hit.GroupTitle(id)
        }
        val slop = max(8.0, 12 / s)
        for (id in edgeOrder.asReversed()) {
            val e = edges[id] ?: continue
            val g = edgeGeometry(e) ?: continue
            if (distance(w, g.geo.path) <= slop) return Hit.Edge(id)
        }
        for (id in groupOrder.asReversed()) {
            val g = groups[id] ?: continue
            if (rectContains(g.rect, w)) return Hit.Group(id)
        }
        return Hit.Empty
    }

    /**
     * The link handle a press on the selected card ([lx], [ly] card-local) starts an arrow from, if any: the
     * nearest within [r] of its centre and no deeper than [handleDepth] inside the card on its side — the reach
     * grows outward and along the edge, never into the card's body (a drag there still moves the card).
     */
    private fun linkSideAt(lx: Double, ly: Double, r: Double): LinkSide? =
        LinkSide.entries
            .filter { hypot(lx - it.cx, ly - it.cy) <= r && it.depth(lx, ly) <= handleDepth }
            .minByOrNull { hypot(lx - it.cx, ly - it.cy) }

    /**
     * Whether world point [w] is inside the clip [n] is drawn in: a filed card's tab, trash and handles are cut
     * by its region's box as the card is (`overflow: hidden` on the web, where what is cut takes no press).
     */
    private fun insideClip(n: MapNode, w: Pt): Boolean = n.groupId?.let { groups[it] }?.let { rectContains(it.rect, w) } ?: true

    /** A filed card only shows (and takes touches) inside its region's rounded clip. */
    private fun clippedRect(n: MapNode): Rect {
        val r = mapNodeRect(n.x, n.y)
        val g = n.groupId?.let { groups[it] } ?: return r
        val x0 = max(r.x, g.x)
        val y0 = max(r.y, g.y)
        val x1 = min(r.x + r.w, g.x + g.w)
        val y1 = min(r.y + r.h, g.y + g.h)
        return if (x1 > x0 && y1 > y0) Rect(x0, y0, x1 - x0, y1 - y0) else Rect(0.0, 0.0, -1.0, -1.0)
    }

    /**
     * What a drag starting at the screen's edge would take hold of, for the system-gesture exclusion
     * ([MapGestureExclusion]): the selected card's link handles as drawn (not dragged, no arrow being drawn, inside
     * its region's clip), the regions' resize corners (the selected one apart), and every region's and card's box.
     * Reads the map's snapshot state, so a derived state over it follows the camera and the map.
     */
    fun exclusionScene(): MapGestureExclusion.Scene {
        val sel = selection
        val handles = (sel as? Selection.Node)?.takeIf { dragNodeId == null && linkDraft == null }?.let { nodes[it.id] }?.let { n ->
            LinkSide.entries.map { Pt(n.x + it.cx, n.y + it.cy) }.filter { insideClip(n, it) }
        }.orEmpty()
        val regions = groupOrder.mapNotNull { groups[it] }
        val selectedRegion = (sel as? Selection.Group)?.let { groups[it.id] }
        val focus = when (sel) {
            is Selection.Node -> nodes[sel.id]?.let { Pt(it.x + mapNodeW / 2, it.y + mapNodeH / 2) }
            is Selection.Group -> selectedRegion?.let { Pt(it.x + it.w / 2, it.y + it.h / 2) }
            else -> null
        }
        return MapGestureExclusion.Scene(
            camera = camera,
            handles = handles,
            selectedCorner = selectedRegion?.let(::resizeCorner),
            corners = regions.filter { it !== selectedRegion }.map(::resizeCorner),
            boxes = regions.map { it.rect } + nodeOrder.mapNotNull { id -> nodes[id]?.let(::clippedRect)?.takeIf { it.w > 0 } },
            focus = focus,
        )
    }

    /** A region's resize grip's middle (its bottom-right corner, as [hitTest] reads it). */
    private fun resizeCorner(g: MapGroup) = Pt(g.x + g.w + 6 - 11, g.y + g.h + 6 - 11)

    /** Distance from a point to the arrow's cubic, sampled. */
    private fun distance(p: Pt, path: List<PathCommand>): Double {
        var best = Double.POSITIVE_INFINITY
        var cx = 0.0
        var cy = 0.0
        for (cmd in path) {
            when (cmd) {
                is PathCommand.Move -> { cx = cmd.x; cy = cmd.y }
                is PathCommand.Cubic -> {
                    for (i in 0..32) {
                        val t = i / 32.0
                        val u = 1 - t
                        val bx = u * u * u * cx + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t * t * t * cmd.x
                        val by = u * u * u * cy + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t * t * t * cmd.y
                        best = min(best, hypot(p.x - bx, p.y - by))
                    }
                    cx = cmd.x
                    cy = cmd.y
                }
                else -> {}
            }
        }
        return best
    }

    // Touches (the web's pointer handlers)

    private class Member(val id: String, val dx: Double, val dy: Double)

    private sealed interface Drag {
        class Pan(val px: Double, val py: Double, val camX: Double, val camY: Double) : Drag
        class NodeDrag(val id: String, val dx: Double, val dy: Double) : Drag
        class GroupDrag(val id: String, val dx: Double, val dy: Double, val members: List<Member>, val fromTitle: Boolean) : Drag
        class Resize(val id: String) : Drag
        class Link(val sourceId: String) : Drag
        /** Buttons and labels act when the finger lifts without moving. */
        class Tap(val hit: Hit) : Drag
    }

    private class PinchFrame(val dist: Double, val cx: Double, val cy: Double)
    private class Touch(val id: Long, var x: Double, var y: Double)

    private val touches = ArrayList<Touch>()
    private var drag: Drag? = null
    private var pinch: PinchFrame? = null
    private var moved = false
    private var startX = 0.0
    private var startY = 0.0
    private var lastX = 0.0
    private var lastY = 0.0

    private fun pinchFrame(): PinchFrame? {
        if (touches.size < 2) return null
        val a = touches[0]
        val b = touches[1]
        return PinchFrame(max(1.0, hypot(a.x - b.x, a.y - b.y)), (a.x + b.x) / 2, (a.y + b.y) / 2)
    }

    fun touchDown(id: Long, x: Double, y: Double) {
        touches.add(Touch(id, x, y))
        if (touches.size == 2) {
            // A second finger turns whatever the first was doing into a pinch (finishing a move it had made).
            if (moved) finishDrag(lastX, lastY)
            drag = null
            panning = false
            dragNodeId = null
            linkDraft = null
            pinch = pinchFrame()
            return
        }
        if (touches.size != 1 || pinch != null) return
        commitEditors()
        moved = false
        startX = x
        startY = y
        lastX = x
        lastY = y
        val w = screenToWorld(camera, x, y)
        when (val hit = hitTest(x, y)) {
            is Hit.LinkHandle -> {
                drag = Drag.Link(hit.id)
                linkDraft = LinkDraft(hit.id, w.x, w.y)
            }
            is Hit.Node -> {
                val n = nodes[hit.id] ?: return
                drag = Drag.NodeDrag(hit.id, w.x - n.x, w.y - n.y)
                dragNodeId = hit.id
            }
            is Hit.GroupTitle -> drag = groupDrag(hit.id, w, fromTitle = true)
            is Hit.Group -> drag = groupDrag(hit.id, w, fromTitle = false)
            is Hit.GroupResize -> drag = Drag.Resize(hit.id)
            is Hit.Edge -> {
                // Selected as the finger lands; nothing to drag.
                selection = Selection.Edge(hit.id)
                drag = Drag.Tap(hit)
            }
            Hit.Empty -> {
                drag = Drag.Pan(x, y, camera.x, camera.y)
                panning = true
            }
            else -> drag = Drag.Tap(hit)
        }
    }

    private fun groupDrag(id: String, w: Pt, fromTitle: Boolean): Drag {
        val g = groups[id]!!
        val members = nodeOrder.mapNotNull { nodes[it] }.filter { it.groupId == id }.map { Member(it.cardId, w.x - it.x, w.y - it.y) }
        return Drag.GroupDrag(id, w.x - g.x, w.y - g.y, members, fromTitle)
    }

    fun touchMove(id: Long, x: Double, y: Double) {
        val i = touches.indexOfFirst { it.id == id }
        if (i < 0) return
        touches[i].x = x
        touches[i].y = y
        val prev = pinch
        if (prev != null) {
            val frame = pinchFrame() ?: return
            takeCamera()
            val cam = zoomAt(camera, frame.cx, frame.cy, frame.dist / prev.dist)
            camera = cam.copy(x = cam.x + frame.cx - prev.cx, y = cam.y + frame.cy - prev.cy)
            pinch = frame
            return
        }
        val current = drag
        if (i != 0 || current == null) return
        lastX = x
        lastY = y
        if (!moved && hypot(x - startX, y - startY) > 4) moved = true
        val w = screenToWorld(camera, x, y)
        when (current) {
            is Drag.Pan -> {
                // Past the 4px rule the finger is moving the map: the camera is the reader's.
                if (moved) takeCamera()
                camera = camera.copy(x = current.camX + (x - current.px), y = current.camY + (y - current.py))
            }
            is Drag.NodeDrag -> {
                if (!moved) return
                val n = nodes[current.id] ?: return
                n.x = w.x - current.dx
                n.y = w.y - current.dy
                n.groupId = majorityGroupId(mapNodeRect(n.x, n.y), groupRects)
            }
            is Drag.GroupDrag -> {
                if (!moved) return
                val g = groups[current.id] ?: return
                g.x = w.x - current.dx
                g.y = w.y - current.dy
                for (m in current.members) nodes[m.id]?.let { it.x = w.x - m.dx; it.y = w.y - m.dy }
            }
            is Drag.Resize -> {
                val g = groups[current.id] ?: return
                g.w = max(minGroupW, w.x - g.x)
                g.h = max(minGroupH, w.y - g.y)
            }
            is Drag.Link -> linkDraft = linkDraft?.copy(wx = w.x, wy = w.y)
            is Drag.Tap -> {}
        }
    }

    fun touchUp(id: Long, x: Double, y: Double) {
        val i = touches.indexOfFirst { it.id == id }
        if (i < 0) return
        touches.removeAt(i)
        if (pinch != null) {
            // A pinch finger never taps; the one left behind does nothing until lifted.
            pinch = if (touches.size >= 2) pinchFrame() else null
            return
        }
        if (!(i == 0 || touches.isEmpty())) return
        finishDrag(x, y)
    }

    private fun finishDrag(x: Double, y: Double) {
        val current = drag ?: return
        drag = null
        val w = screenToWorld(camera, x, y)
        when (current) {
            is Drag.Pan -> {
                panning = false
                if (!moved) {
                    selection = null
                    trayOpen = false
                }
            }
            is Drag.NodeDrag -> {
                dragNodeId = null
                if (!moved) {
                    selection = Selection.Node(current.id)
                    return
                }
                val node = nodes[current.id] ?: return
                val others = nodeOrder.filter { it != current.id }.mapNotNull { nodeRect(it) }
                val pos = resolveOverlap(mapNodeRect(w.x - current.dx, w.y - current.dy), others)
                val groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
                node.x = pos.x
                node.y = pos.y
                node.groupId = groupId
                persist { it.moveNode(current.id, pos.x, pos.y, groupId) }
            }
            is Drag.GroupDrag -> {
                if (!moved) {
                    if (current.fromTitle && selection == Selection.Group(current.id)) startGroupRename(current.id) else selection = Selection.Group(current.id)
                    return
                }
                val g = groups[current.id] ?: return
                val moves = current.members.mapNotNull { m -> nodes[m.id]?.let { Triple(m.id, it.x, it.y) } }
                val gx = g.x
                val gy = g.y
                persist { it.moveGroup(current.id, gx, gy, moves) }
            }
            is Drag.Resize -> {
                val g = groups[current.id] ?: return
                val gw = g.w
                val gh = g.h
                persist { it.updateGroup(current.id, mapOf("w" to gw, "h" to gh)) }
                reconcileMemberships()
            }
            is Drag.Link -> {
                val target = linkTarget
                linkDraft = null
                if (target == null) return
                val eid = ThoughtMapService.edgeId(current.sourceId, target)
                if (edges[eid] == null) {
                    edges[eid] = MapEdge(eid, current.sourceId, target, "")
                    edgeOrder.add(eid)
                    persist { it.createEdge(current.sourceId, target) }
                    selection = Selection.Edge(eid)
                    labelDraft = ""
                    editingEdgeId = eid
                } else {
                    selection = Selection.Edge(eid)
                }
            }
            is Drag.Tap -> {
                if (moved) return
                when (val hit = current.hit) {
                    is Hit.EdgeLabel -> startEdgeEdit(hit.id)
                    is Hit.TabOpen -> cards[hit.id]?.let { onOpen(it) }
                    is Hit.NodeRemove -> removeNode(hit.id)
                    is Hit.GroupDelete -> removeGroup(hit.id)
                    else -> {}
                }
            }
        }
    }

    fun touchesCancelled() {
        // A cancelled gesture ends like a lift (the web's onPointerCancel = onPointerUp).
        if (pinch == null && touches.isNotEmpty()) finishDrag(lastX, lastY)
        touches.clear()
        pinch = null
        drag = null
        panning = false
        dragNodeId = null
        linkDraft = null
    }

    // Edits

    private fun persist(work: suspend (ThoughtMapService) -> Unit) {
        val service = service ?: return
        scope.launch {
            try {
                work(service)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("ThoughtMap", "write failed", e)
            }
        }
    }

    /** The tray's pick: onto the middle of the view, nudged per card already there, clear of the others. */
    fun addCard(card: MapCard) {
        val center = screenToWorld(camera, viewportW / 2, viewportH / 2)
        val k = (nodes.size % 5).toDouble()
        val rect = Rect(center.x - mapNodeW / 2 + k * 28, center.y - mapNodeH / 2 + k * 22, mapNodeW, mapNodeH)
        val pos = resolveOverlap(rect, nodeOrder.mapNotNull { nodeRect(it) })
        val groupId = majorityGroupId(mapNodeRect(pos.x, pos.y), groupRects)
        nodes[card.id] = MapNode(card.id, pos.x, pos.y, groupId)
        nodeOrder.add(card.id)
        trayOpen = false
        persist { service ->
            service.addNode(card.id, pos.x, pos.y)
            if (groupId != null) service.setNodeGroups(listOf(card.id to groupId))
        }
    }

    suspend fun addGroup() {
        val service = service ?: return
        val center = screenToWorld(camera, viewportW / 2, viewportH / 2)
        val hue = groupHues[groups.size % groupHues.size]
        val title = L10n.Me.ThoughtMap.newGroup
        val x = center.x - 230
        val y = center.y - 170
        // The region appears once it's written (it needs its id), as on the web.
        val id = try {
            service.createGroup(title, hue, x, y, 460.0, 340.0)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("ThoughtMap", "add group failed", e)
            return
        }
        groups[id] = MapGroup(id, title, hue, x, y, 460.0, 340.0)
        groupOrder.add(id)
        selection = Selection.Group(id)
        startGroupRename(id)
    }

    fun removeNode(id: String) {
        nodes.remove(id)
        nodeOrder.remove(id)
        val gone = edgeOrder.filter { edges[it]?.sourceCardId == id || edges[it]?.targetCardId == id }
        for (e in gone) edges.remove(e)
        edgeOrder.removeAll(gone.toSet())
        if (selection == Selection.Node(id)) selection = null
        persist { it.removeNode(id) }
    }

    fun removeEdge(id: String) {
        edges.remove(id)
        edgeOrder.remove(id)
        if (selection == Selection.Edge(id)) selection = null
        if (editingEdgeId == id) editingEdgeId = null
        persist { it.removeEdge(id) }
    }

    fun removeGroup(id: String) {
        groups.remove(id)
        groupOrder.remove(id)
        for (nid in nodeOrder) if (nodes[nid]?.groupId == id) nodes[nid]?.groupId = null
        if (selection == Selection.Group(id)) selection = null
        persist { it.removeGroup(id) }
    }

    /** After a resize: re-file every card by majority, persisting only the changes. */
    private fun reconcileMemberships() {
        val changes = ArrayList<Pair<String, String?>>()
        val rects = groupRects
        for (id in nodeOrder) {
            val n = nodes[id] ?: continue
            val g = majorityGroupId(mapNodeRect(n.x, n.y), rects)
            if (g != n.groupId) {
                n.groupId = g
                changes.add(id to g)
            }
        }
        persist { it.setNodeGroups(changes) }
    }

    fun startGroupRename(id: String) {
        val g = groups[id] ?: return
        groupDraft = g.title
        editingGroupId = id
    }

    fun commitGroupTitle() {
        val id = editingGroupId ?: return
        editingGroupId = null
        val trimmed = groupDraft.trim()
        val title = trimmed.ifEmpty { L10n.Me.ThoughtMap.newGroup }
        val g = groups[id] ?: return
        if (g.title == title) return
        g.title = title
        persist { it.updateGroup(id, mapOf("title" to title)) }
    }

    fun startEdgeEdit(id: String) {
        val e = edges[id] ?: return
        selection = Selection.Edge(id)
        labelDraft = e.label
        editingEdgeId = id
    }

    fun commitEdgeLabel() {
        val id = editingEdgeId ?: return
        editingEdgeId = null
        val label = labelDraft.trim()
        val e = edges[id] ?: return
        e.label = label
        persist { it.updateEdgeLabel(id, label) }
    }

    /** Tapping the map ends any in-place editing (the web's blur). */
    fun commitEditors() {
        if (editingGroupId != null) commitGroupTitle()
        if (editingEdgeId != null) commitEdgeLabel()
    }
}

/** Text widths for hit targets, measured off screen in the same faces the map draws with. */
object MapText {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isLinearText = true }

    /** The width of `text` in dp (the size given in dp): measured at 10× so hinting can't round it. */
    fun width(text: String, family: AppFonts.Family, weight: Int, sizeDp: Float, letterSpacingEm: Float = 0f): Float {
        val k = 10f
        paint.typeface = AppFonts.typeface(family, weight)
        paint.textSize = sizeDp * k
        paint.letterSpacing = letterSpacingEm
        return paint.measureText(text) / k
    }
}
