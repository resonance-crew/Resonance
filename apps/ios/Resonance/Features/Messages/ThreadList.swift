import DesignSystem
import ResonanceKit
import SwiftUI

// The thread's list: the messages newest at the bottom, stacked in runs the way Messenger stacks
// them — their face beside the last of each of their runs — with the day and time labels, the
// quotes replies lie over, links' previews and shared cards inside their bubbles, the lines under
// messages that are on their way or didn't go, and — at the top — older messages as they are read
// in. The list is drawn upside down (and each row the right way up again), as Android's reversed
// list is laid out: it starts at the newest, and what is read in above never moves what is on
// screen. The twin of Android's ThreadList.

/// Everything a row of the thread needs from the screen around it.
struct ThreadContext {
    let model: ThreadModel
    /// A bubble's widest: 72% of the row (their face's column not counted), as on the web and Android.
    let rowMax: CGFloat
    /// A sticker's side (round 22 §4.5): 128 on a phone, 144 wider.
    var stickerSide: CGFloat = 128
    /// The matches of the search being looked at, by message id; none when not looking.
    let highlights: [String: [NSRange]]
    /// The message id of the hit being looked at.
    let currentHit: String?
    let flash: ThreadFlash
    let frames: FrameBook
    /// The key of the message the long-press menu has lifted out of the thread: its place stays empty under the scrim.
    let lifted: String?
    let onMenu: (MessageMenu) -> Void
    let onReply: (ChatMessage) -> Void
    /// The quote of a reply was tapped: the id of the message it quotes.
    let onQuote: (String) -> Void
    /// A link in a message was tapped: a card of this site opens in the app, anything else by the link rules.
    let openLink: (URL) -> Void
    let openRoute: (Route) -> Void
    /// A picture was tapped: it opens full screen.
    let openPicture: (ChatImage) -> Void

    /// Whether a row drawing `message` draws it the same with this context as with `other`: the same
    /// thread, width, search marks, hit and lifted message for it. The callbacks don't count: the
    /// screen makes new ones each time it is drawn, and they do the same (they read the screen's state
    /// when called), so a row they alone would change is left as it is.
    func draws(_ message: ChatMessage, like other: ThreadContext) -> Bool {
        model === other.model && flash === other.flash && frames === other.frames && rowMax == other.rowMax
            && stickerSide == other.stickerSide && marks(on: message) == other.marks(on: message)
    }

    /// What the context marks on `message`'s row.
    func marks(on message: ChatMessage) -> RowMarks {
        RowMarks(id: message.id, key: message.key, highlights: highlights, currentHit: currentHit, lifted: lifted)
    }
}

/// What a thread's context marks on one message's row: its words found by the search, whether it is
/// the hit being looked at, whether the long-press menu has lifted it. Another message's marks are
/// none of its business.
nonisolated struct RowMarks: Equatable {
    let highlights: [NSRange]?
    let isCurrentHit: Bool
    let isLifted: Bool

    init(id: String, key: String, highlights: [String: [NSRange]], currentHit: String?, lifted: String?) {
        self.highlights = highlights[id]
        isCurrentHit = currentHit == id
        isLifted = lifted == key
    }
}

/// The message the thread just jumped to from a reply's quote pulses once.
@MainActor @Observable
final class ThreadFlash {
    private(set) var key: String?
    private(set) var level: Double = 0
    @ObservationIgnored private var token = 0

    func pulse(_ key: String) {
        token += 1
        let mine = token
        self.key = key
        level = 0
        withAnimation(.easeOut(duration: 0.14)) { level = 1 }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            guard token == mine else { return }
            withAnimation(.easeOut(duration: 0.76)) { level = 0 }
        }
    }

    func level(of key: String) -> Double { self.key == key ? level : 0 }
}

/// Where each message on screen is (by key), for a long-press to lift it from. Written as the list
/// moves, read only when a message is pressed: nothing draws from it.
@MainActor
final class FrameBook {
    var frames: [String: CGRect] = [:]
}

/// A message pressed and held: the row, where it is on the screen, and the link it offers — the one under
/// the finger (`onLink`: its rows then lead the list), else the one the message leads to.
struct MessageMenu {
    let row: ThreadRow
    let frame: CGRect
    let link: URL?
    var onLink = false
}

/// How far up the thread is scrolled (in screens) before "latest messages" offers the way back down.
private let farUpScreens: CGFloat = 1.5
/// How close to the oldest message held the list comes (in messages) before the next page is read.
private let olderAhead = 6
private let runGap: CGFloat = 2
private let betweenRuns: CGFloat = 12
/// Between runs when the new one leads with what it answers (a reply's quote, a note's card): a
/// little more air, where a caption once stood, so the quote never reads as the foot of the run above.
private let beforeQuotedRun: CGFloat = 18
/// Their face beside their messages: the column every one of their bubbles is indented by.
private let face: CGFloat = 28
private let faceGap: CGFloat = 8
/// A bubble carrying a link's preview is this wide (or the row's widest); one carrying a card, `cardWidth`.
private let previewWidth: CGFloat = 280
private let cardWidth: CGFloat = 300

struct MessageList: View {
    let rows: [ThreadRow]
    let ctx: ThreadContext
    /// Where the list is: it holds still on the row it was on while rows come and go around it (a
    /// message arriving while the thread is scrolled up doesn't move what is being read).
    @Binding var position: ScrollPosition
    /// The bar lies over the top of the list: what scrolls shows right up to its pen line.
    let topMargin: CGFloat
    /// What floats over the list's foot, and 12 of air (round 9 §4): the newest message rests clear of
    /// the composer, as does the pill.
    let bottomRoom: CGFloat
    /// A line about the conversation as its last item (answering their letter connects the two).
    var notice: String? = nil
    /// The floating pill (new messages, back to the latest) is for the list alone, not under search results.
    let pillVisible: Bool
    /// Whether messages are scrolled under the bar (its pen line darkens).
    @Binding var underBar: Bool
    @State private var atBottom = true
    @State private var farUp = false
    @State private var unseen = 0

    var body: some View {
        let model = ctx.model
        let newestFirst = Array(rows.reversed())
        let oldest = Set(rows.prefix(olderAhead).map(\.id))
        ZStack(alignment: .bottom) {
            ScrollView {
                LazyVStack(spacing: 0) {
                    // The conversation's notice: under the newest message, scrolling with the thread.
                    if let notice, model.threadReady {
                        ThreadFootNote(text: notice, size: 12.5)
                            .padding(.horizontal, 12)
                            .padding(.top, 16)
                            .upsideDown()
                    }
                    ForEach(Array(newestFirst.enumerated()), id: \.element.id) { i, row in
                        // A run still on its way says so once, under its newest message: the stack stays one stack.
                        let sendingBelow = row.position.joinsBelow && i > 0 && newestFirst[i - 1].message.delivery == .sending
                        ThreadRowView(row: row, ctx: ctx, deliveryLine: !sendingBelow)
                            // Drawn again only when what it shows changed (`==`), not each time the screen is.
                            .equatable()
                            .upsideDown()
                            .id(row.id)
                            // Scrolled up to within a few messages of the oldest held: the next page of older ones is read.
                            .onAppear { if oldest.contains(row.id) { model.loadOlder() } }
                    }
                    if model.threadReady && model.messages.isEmpty {
                        // Not "no messages yet" when they couldn't be read, nor "say hello" where nothing can be said.
                        if model.listenFailed {
                            QuietNote(L10n.Native.loadError).upsideDown()
                        } else if model.access.canWrite {
                            QuietNote(L10n.Messages.noMessagesYet).upsideDown()
                        }
                    } else if model.threadReady && !rows.isEmpty {
                        OlderRow(model: model).upsideDown()
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 16)
                // Exactly as wide as the list: a vertical list never has anything to move sideways to. (Not
                // containerRelativeFrame: in a pane beside the conversations it took the window's width.)
                .frame(maxWidth: .infinity)
                // …and if anything ever sets it aside all the same — the owner saw the whole thread 16 to the
                // left after replying by a swipe, and sending re-anchors the list in a way that can do it — it
                // is held at its own edge in UIKit, never through `position` (see SidewaysLock).
                .background(SidewaysLock())
                // A tap on the thread puts the keyboard away (round 10 §4).
                .background(KeyboardTapAway())
            }
            .scrollPosition($position, anchor: .center)
            .upsideDown()
            .scrollIndicators(.hidden)
            // The thread draws its own edge (the bar's paper): no system scroll edge effect — on a
            // Mac, under the pointer, the flipped list's spread over the whole thread and blurred it.
            .withoutScrollEdgeEffect()
            .scrollDismissesKeyboard(.interactively)
            // Upside down, the list's bottom margin is the room under the bar, its top what floats over its
            // foot (the composer, its slip, the safe area or keyboard under them) and 12 of air.
            .contentMargins(.bottom, topMargin + 4, for: .scrollContent)
            .contentMargins(.top, bottomRoom, for: .scrollContent)
            .onScrollGeometryChange(for: ListPlace.self) { geo in
                // The container is what lies between the insets: upside down, the air over the
                // composer below it and the bar (with the status bar) above it.
                let fromNewest = geo.contentOffset.y + geo.contentInsets.top
                let seenTo = fromNewest + geo.containerSize.height
                return ListPlace(atBottom: fromNewest <= 120, farUp: fromNewest > geo.containerSize.height * farUpScreens,
                                 underBar: geo.contentSize.height - seenTo > 1)
            } action: { _, place in
                if atBottom != place.atBottom { atBottom = place.atBottom }
                if farUp != place.farUp { farUp = place.farUp }
                if underBar != place.underBar { underBar = place.underBar }
                if place.atBottom { unseen = 0 }
            }
            .onChange(of: rows.last?.id) { before, now in
                // A newer message under the one that was newest (not the first read, nor a failed one taken away).
                guard let before, now != nil, let newest = rows.last?.message, rows.contains(where: { $0.id == before }) else { return }
                // What you send always brings you to the bottom; so does anything that arrives while you are there.
                if model.isMine(newest) || atBottom {
                    toLatest()
                } else {
                    unseen += 1
                }
            }
            if pillVisible && (unseen > 0 || farUp) && !atBottom {
                // The small pill 12 over the composer (or its slip): the way back to the latest message — an arrow
                // alone (the owner, 2026-10-28), or 新訊息 beside it when something came in below.
                Group {
                    if unseen > 0 {
                        OrganicPill(icon: .chevronDown, text: L10n.Messages.newMessages) {
                            unseen = 0
                            toLatest()
                        }
                    } else {
                        // The 44 target around the 36 face: its foot 4 lower, so the face rests where the pill's did.
                        OrganicPillGlyph(icon: .chevronDown, accessibilityLabel: L10n.Messages.jumpToLatest) { toLatest() }
                            .padding(.bottom, -(OrganicPillGlyph.target - OrganicPillGlyph.face) / 2)
                    }
                }
                .padding(.bottom, bottomRoom)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.easeOut(duration: 0.16), value: pillVisible && (unseen > 0 || farUp) && !atBottom)
    }
}

extension MessageList {
    /// Back to the newest message (upside down, the list's top edge is the newest end). From far up
    /// the way is over rows the list has only guessed the height of, and an animation along it
    /// lands short: it goes at once, then settles exactly.
    private func toLatest() {
        guard farUp else {
            withAnimation(.easeInOut(duration: 0.3)) { position.scrollTo(edge: .top) }
            return
        }
        position.scrollTo(edge: .top)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            position.scrollTo(edge: .top)
        }
    }
}

/// A thread whose messages are still on their way (opened from a bell or a push, before the first
/// read): a few bubbles in the shimmer, theirs on the left with a face under each run and yours on
/// the right, resting on the foot as the newest messages do — the newest theirs, since a thread is
/// mostly opened for what they just sent. It shows only after a moment, so a thread the cache
/// answers at once doesn't flash it. Android's ThreadSkeleton.
struct ThreadSkeleton: View {
    /// What floats over the thread's foot, as the list keeps clear of it.
    var bottomRoom: CGFloat = 0
    private struct Bubble { let mine: Bool; let width: CGFloat; let height: CGFloat }
    /// Oldest first; a change of side starts a new run.
    private static let bubbles = [
        Bubble(mine: false, width: 168, height: 40), Bubble(mine: false, width: 120, height: 40),
        Bubble(mine: true, width: 200, height: 58), Bubble(mine: true, width: 96, height: 40),
        Bubble(mine: false, width: 220, height: 58), Bubble(mine: false, width: 132, height: 40),
    ]
    @State private var shown = false

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(Self.bubbles.enumerated()), id: \.offset) { i, bubble in
                let runEnds = i == Self.bubbles.count - 1 || Self.bubbles[i + 1].mine != bubble.mine
                HStack(alignment: .bottom, spacing: faceGap) {
                    if bubble.mine {
                        Spacer(minLength: 0)
                    } else if runEnds {
                        SkeletonBlock(width: face, circle: true)
                    } else {
                        Color.clear.frame(width: face, height: 1)
                    }
                    SkeletonBlock(width: bubble.width, height: bubble.height, radius: 18)
                    if !bubble.mine { Spacer(minLength: 0) }
                }
                .padding(.top, i == 0 ? 0 : Self.bubbles[i - 1].mine == bubble.mine ? runGap + 2 : betweenRuns + 4)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, bottomRoom)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(shown ? 1 : 0)
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.Home.moreLoading)
        .task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { shown = true }
        }
        .skeletonTimeline()
    }
}

/// Where the list is: at the newest (or near it), far up, and whether messages are under the bar.
private struct ListPlace: Equatable {
    let atBottom: Bool
    let farUp: Bool
    let underBar: Bool
}

extension View {
    /// Drawn upside down: the thread's list, and each of its rows the right way up again.
    func upsideDown() -> some View {
        scaleEffect(x: 1, y: -1, anchor: .center)
    }

    /// iOS 26's scroll edge effect (the blur where content meets a bar), turned off where it is available.
    @ViewBuilder func withoutScrollEdgeEffect() -> some View {
        if #available(iOS 26.0, *) { scrollEdgeEffectHidden(true, for: .all) } else { self }
    }
}

/// One row: the day or time label that leads it, if any, and the message on its side. Equal to
/// another when it draws the same: its row, its delivery line and what the context gives it
/// (``ThreadContext/draws(_:like:)``). What it reads from the thread's model (the card a message
/// shares, their face) redraws it as that changes, equal or not.
struct ThreadRowView: View, Equatable {
    let row: ThreadRow
    let ctx: ThreadContext
    let deliveryLine: Bool

    static func == (a: ThreadRowView, b: ThreadRowView) -> Bool {
        a.row == b.row && a.deliveryLine == b.deliveryLine && a.row.messages.allSatisfy { a.ctx.draws($0, like: b.ctx) }
    }

    var body: some View {
        let gap = Self.gap(above: row)
        VStack(spacing: 0) {
            if row.dayLabel {
                DayLabel(text: ThreadScreen.day(row.message.sentAt))
            } else if row.timeLabel {
                DayLabel(text: ThreadScreen.time(row.message.sentAt))
            }
            MessageItem(row: row, ctx: ctx, deliveryLine: deliveryLine)
        }
        .padding(.top, gap)
    }

    /// The air over a row: between runs it is wide (wider still before one that leads with a quote or
    /// a note's card); inside one the bubbles nearly touch. A label brings its own.
    static func gap(above row: ThreadRow) -> CGFloat {
        if row.dayLabel || row.timeLabel { return 0 }
        if row.joinsAbove { return runGap }
        return row.message.replyTo != nil || row.message.isNote ? beforeQuotedRun : betweenRuns
    }
}

/// A day or time label between messages.
private struct DayLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity)
            .padding(.top, 14).padding(.bottom, 6)
    }
}

private struct QuietNote: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 14)
    }
}

/// Above the oldest message: the next page being read, a read that failed, or the start of the conversation.
private struct OlderRow: View {
    let model: ThreadModel

    var body: some View {
        VStack(spacing: 6) {
            if model.loadingOlder {
                SketchLoader(size: 22)
                note(L10n.Messages.loadingOlder)
            } else if model.olderError {
                note(L10n.Messages.loadOlderError)
                OrganicButton(L10n.Native.retry, variant: .tonal, size: .sm) { model.loadOlder() }
            } else if !model.hasOlder {
                note(L10n.Messages.beginning)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 22)
        .padding(.top, 18).padding(.bottom, 6)
        .onAppear { if !model.olderError { model.loadOlder() } }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).multilineTextAlignment(.center)
    }
}

// MARK: - One message

/// One message on its side of the thread: on theirs, their face beside the last bubble of each run
/// (and the column it stands in beside every one of theirs); the quote it answers over it, its
/// bubble — carrying a link's preview or a shared card — and a line if it is still on its way or
/// didn't go (`deliveryLine`: not when the next in its run is on its way too). Dragged toward the
/// middle it asks to be replied to.
private struct MessageItem: View {
    let row: ThreadRow
    let ctx: ThreadContext
    let deliveryLine: Bool

    var body: some View {
        let message = row.message
        let model = ctx.model
        let mine = model.isMine(message)
        Group {
            if message.isUnsent {
                // Unsent (round 16 §3): one quiet line on its sender's side, nothing to press, swipe or answer.
                HStack(alignment: .bottom, spacing: 0) {
                    if mine { Spacer(minLength: 0) } else { TheirFace(shown: !row.position.joinsBelow, ctx: ctx) }
                    UnsentBubble(text: mine ? L10n.Messages.unsentByYou : L10n.Messages.unsentByThem(handle: model.displayHandle),
                                 mine: mine, seed: seedFromId(message.key), tuckTop: row.position.joinsAbove, tuckBottom: row.position.joinsBelow)
                        .frame(maxWidth: ctx.rowMax, alignment: mine ? .trailing : .leading)
                    if !mine { Spacer(minLength: 0) }
                }
                .transition(.opacity)
            } else if let album = row.album {
                // An album's pictures (round 22): one grid; a drag replies to its first picture.
                SwipeToReply(enabled: model.canReply(message), mine: mine, onReply: { ctx.onReply(message) }) {
                    HStack(alignment: .bottom, spacing: 0) {
                        if mine {
                            Spacer(minLength: 0)
                        } else {
                            TheirFace(shown: !row.position.joinsBelow, lifted: album.contains { ctx.lifted == $0.key }, ctx: ctx)
                        }
                        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
                            AlbumGridView(row: row, album: album, ctx: ctx, mine: mine)
                            // One line for the grid: a picture that didn't go (its retry), else the one still on its way.
                            if deliveryLine, let shown = AlbumGridView.deliveryMessage(album) { DeliveryLine(message: shown, model: model) }
                        }
                        .frame(maxWidth: ctx.rowMax, alignment: mine ? .trailing : .leading)
                        if !mine { Spacer(minLength: 0) }
                    }
                }
            } else if message.sticker != nil || model.carried(message) != .nothing {
                // (A card the viewer can't see, sent alone: nothing to draw — not even a face beside it. A sticker on its
                // way has no words yet: it is drawn all the same.)
                SwipeToReply(enabled: model.canReply(message), mine: mine, onReply: { ctx.onReply(message) }) {
                    HStack(alignment: .bottom, spacing: 0) {
                        if mine {
                            Spacer(minLength: 0)
                        } else {
                            TheirFace(shown: !row.position.joinsBelow, lifted: ctx.lifted == message.key, ctx: ctx)
                        }
                        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
                            MessageCore(row: row, ctx: ctx, interactive: true)
                            if deliveryLine { DeliveryLine(message: message, model: model) }
                        }
                        .frame(maxWidth: ctx.rowMax, alignment: mine ? .trailing : .leading)
                        if !mine { Spacer(minLength: 0) }
                    }
                }
            }
        }
        // Unsent while on screen: its row shrinks to the line (an unsent picture shrinks the thread), 150 ms.
        .animation(.easeOut(duration: 0.15), value: message.isUnsent)
    }
}

/// Their face, bottom-aligned beside the last bubble of their run (`shown`); else the empty column. A tap goes to their page.
/// While its message is lifted into the press layer it fades out (120 ms, review F9): the message may glide
/// away from it, and a face left beside the actions' list would read as the list's.
private struct TheirFace: View {
    let shown: Bool
    var lifted = false
    let ctx: ThreadContext

    var body: some View {
        Group {
            if shown, let other = ctx.model.other {
                Button { ctx.openRoute(.author(other.handle)) } label: {
                    HandDrawnAvatar(initials: other.initials, imageURL: other.avatarUrl.flatMap(URL.init(string:)), color: other.accent,
                                    size: face, seed: other.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(L10n.Messages.viewProfile)
            } else {
                Color.clear
            }
        }
        .frame(width: face, height: face)
        .animation(.easeOut(duration: 0.12)) { $0.opacity(lifted ? 0 : 1) }
        .padding(.trailing, faceGap)
    }
}

/// A message's press-and-hold, for assistive tech: its menu as actions — Reply, only where
/// the thread can answer it (as the menu and the swipe offer it: never in a thread with no
/// composer, nor on a message still sending or failed); each link in its words (which a finger
/// finds by where it lies and VoiceOver can't); and the whole menu.
struct MessageActions: ViewModifier {
    let reply: (() -> Void)?
    let links: [(label: String, open: () -> Void)]
    var reactions: [(label: String, react: () -> Void)] = []
    var removeReaction: (() -> Void)? = nil
    let more: () -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityActions {
                if let reply { Button(L10n.Messages.reply, action: reply) }
            }
            .accessibilityActions {
                ForEach(Array(reactions.enumerated()), id: \.offset) { _, reaction in
                    Button(reaction.label, action: reaction.react)
                }
                if let removeReaction { Button(L10n.Messages.removeReaction, action: removeReaction) }
            }
            .accessibilityActions {
                ForEach(Array(links.enumerated()), id: \.offset) { _, link in
                    Button(link.label, action: link.open)
                }
            }
            .accessibilityAction(named: L10n.Messages.moreMenu, more)
    }
}

/// What each reaction is called (`messages.reactions.<id>`).
enum ReactionNames {
    static func name(_ id: ReactionId) -> String {
        switch id {
        case .heart: L10n.Messages.Reactions.heart
        case .moved: L10n.Messages.Reactions.moved
        case .laugh: L10n.Messages.Reactions.laugh
        case .hug: L10n.Messages.Reactions.hug
        case .thumbs: L10n.Messages.Reactions.thumbs
        }
    }
}

/// A message's reactions in its gutter (round 16 §3): the chip, its inner edge 6 over the bubble's outer
/// side edge (your own: its left; theirs: its right), level with the bubble's foot; a reaction this
/// build doesn't know is drawn as nothing. One label for VoiceOver: who reacted with what.
private struct MessageReactions: View {
    let message: ChatMessage
    let mine: Bool
    let model: ThreadModel
    let onTap: (() -> Void)?

    var body: some View {
        let drawn = ReactionSummary.of(message, me: model.me)
        if !drawn.entries.isEmpty {
            let chips = ReactionChips(drawn.entries, outward: mine ? .leading : .trailing, seed: seedFromId(message.key, start: 41))
            Group {
                if let onTap {
                    // A finger's 44 × 44 round the 24-tall chip, centred on it and unseen (review S7).
                    Button(action: onTap) { chips.contentShape(MinimumTarget()) }.buttonStyle(.plain)
                } else {
                    chips
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(drawn.label(handle: model.displayHandle))
            .fixedSize()
            // Out in the gutter: hung from the bubble's edge (a box of no width there), only its inner 6 over it.
            .frame(width: 0, alignment: mine ? .trailing : .leading)
            .offset(x: mine ? ReactionChipMetrics.overlap : -ReactionChipMetrics.overlap)
            .transition(.scale(scale: 0.6).combined(with: .opacity))
        }
    }
}

/// The reactions a message shows (round 16 §3), in the stickers' order: each reaction this build knows once,
/// with how many gave it, and what VoiceOver says of them.
nonisolated struct ReactionSummary: Equatable {
    var entries: [ReactionChips.Entry]
    /// Who gave which: the viewer's, then theirs (ids this build knows only).
    var mine: ReactionId?
    var theirs: ReactionId?

    static func of(_ message: ChatMessage, me: String?) -> ReactionSummary {
        let known = message.knownReactions(ReactionId.order.map(\.rawValue))
        let entries = known.compactMap { r in ReactionId(rawValue: r.id).map { ReactionChips.Entry(id: $0, count: r.by.count) } }
        let mine = me.flatMap { message.reaction(of: $0) }.flatMap(ReactionId.init(rawValue:))
        let theirs = message.reactions.first { $0.key != me }.flatMap { ReactionId(rawValue: $0.value) }
        return ReactionSummary(entries: entries, mine: mine, theirs: theirs)
    }

    @MainActor func label(handle: String) -> String {
        var said: [String] = []
        if let mine { said.append(L10n.Messages.reactedYou(reaction: ReactionNames.name(mine))) }
        if let theirs { said.append(L10n.Messages.reactedThem(handle: handle, reaction: ReactionNames.name(theirs))) }
        return said.joined(separator: ", ")
    }
}

/// The message itself — the quote it answers and its bubble with all it carries — which a
/// long-press lifts: drawn again, without gestures, by the menu.
struct MessageCore: View {
    let row: ThreadRow
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let message = row.message
        let model = ctx.model
        let mine = model.isMine(message)
        let carried = model.carried(message)
        let words = carried.words(of: message)
        let found = model.links(in: words)
        let links = found.map { MessageLinkRange(range: $0.range, url: $0.url) }
        let pulse = ctx.flash.level(of: message.key)
        // A search hit in words the bubble doesn't show (a card's link, standing for the card) washes the whole bubble.
        let wholeHit = words != message.text && message.id == ctx.currentHit
        // A note carries its card above its words, not inside its bubble.
        let note = message.isNote
        // A sticker stands on the page with no bubble (round 22); one this build can't draw is its words.
        let sticker = message.sticker.flatMap { StickerLibrary.shared.drawable($0) ? $0 : nil }
        let core = VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            if let sticker {
                if let quote = message.replyTo {
                    QuotedReply(quote: quote, mine: mine, ctx: ctx, interactive: interactive, underSticker: true)
                }
                ThreadStickerView(message: message, sticker: sticker, side: ctx.stickerSide, interactive: interactive)
                    .overlay(alignment: mine ? .bottomLeading : .bottomTrailing) {
                        MessageReactions(message: message, mine: mine, model: model, onTap: interactive ? { press(nil, carried: carried) } : nil)
                    }
                    // A sticker answering rises over the quote's lower edge, in front of it (round 22 v3: close to what
                    // it answers); the quote keeps its even padding.
                    .padding(.top, message.replyTo == nil ? 0 : -QuotedReply.stickerOverlap)
            } else {
            if note {
                NotedCard(message: message, carried: carried, mine: mine, ctx: ctx, interactive: interactive)
            } else if let quote = message.replyTo {
                QuotedReply(quote: quote, mine: mine, ctx: ctx, interactive: interactive)
            }
            MessageBubble(
                text: words, mine: mine, seed: seedFromId(message.key),
                quoteLabel: message.noteRef == nil ? nil : L10n.Messages.quotedNote,
                tuckTop: row.position.joinsAbove, tuckBottom: row.position.joinsBelow,
                links: links,
                highlights: words == message.text ? ctx.highlights[message.id] ?? [] : [],
                highlightStrong: message.id == ctx.currentHit,
                flash: wholeHit ? max(pulse, 0.5) : pulse,
                width: note ? nil : width(carried),
                plain: !note && carried.isCard && carried.card == nil,
                carries: !note && carried.carriesMore,
                // A picture leads its bubble, the words under it.
                attachmentFirst: carried.picture != nil,
                onLinkTap: interactive ? { ctx.openLink($0) } : nil
            ) {
                if !note {
                    CarriedPart(carried: carried, afterWords: !words.isEmpty || message.noteRef != nil, ctx: ctx, interactive: interactive)
                }
            }
            // Its reactions in the gutter beside the bubble's foot (round 16 §3): never under it, so the row
            // never grows; a tap opens the press layer for it.
            .overlay(alignment: mine ? .bottomLeading : .bottomTrailing) {
                MessageReactions(message: message, mine: mine, model: model, onTap: interactive ? { press(nil, carried: carried) } : nil)
            }
            // A reply lies over the foot of what it quotes, a note over the foot of its card.
            .padding(.top, message.replyTo == nil && !note ? 0 : -BubbleMetrics.replyOverlap)
            }
        }
        .opacity(message.delivery == .failed ? 0.6 : 1)
        if interactive {
            core
                // Lifted into the menu's layer, it isn't left behind under the scrim (a ghost a step off the copy).
                .opacity(ctx.lifted == message.key ? 0 : 1)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { ctx.frames.frames[message.key] = $0 }
                .gesture(MessagePress { link in press(link, carried: carried) })
                .modifier(MessageActions(
                    reply: ctx.model.canReply(message) ? { ctx.onReply(message) } : nil,
                    links: zip(found, Self.linkActionLabels(found)).map { link, label in (label, { ctx.openLink(link.url) }) },
                    // Reacting without a long-press (round 16 §3): one action per sticker, and taking one's back.
                    reactions: ctx.model.canReact(message) ? ReactionId.order.map { id in
                        (L10n.Messages.reactWith(reaction: ReactionNames.name(id)), { ctx.model.react(message, with: id) })
                    } : [],
                    removeReaction: ctx.model.canReact(message) && ctx.model.myReaction(to: message) != nil
                        ? { ctx.model.react(message, with: nil) } : nil,
                    more: { press(nil, carried: carried) }))
        } else {
            core
        }
    }

    /// What VoiceOver calls the action of each link in a message's words: "Open link: host" (without
    /// www., as a story's link card names it) — or, for links sharing a host, the link as written.
    static func linkActionLabels(_ links: [ChatLinks.Link]) -> [String] {
        let hosts = links.map { $0.host.replacingOccurrences(of: "www.", with: "", options: .anchored) }
        return zip(links, hosts).map { link, host in
            L10n.Card.LinkPreview.open(host: hosts.count(where: { $0 == host }) > 1 ? link.text : host)
        }
    }

    private func width(_ carried: Carried<FeedCard>) -> CGFloat? {
        switch carried {
        case let .picture(image): MessagePictureSize.of(width: image.width, height: image.height, maxWidth: ctx.rowMax).width
        case .preview: min(previewWidth, ctx.rowMax)
        case .card, .cardLoading: min(cardWidth, ctx.rowMax)
        case .words, .nothing: nil
        }
    }

    /// Held: the menu, offering the link under the finger — or, pressed elsewhere, the one the message leads to.
    private func press(_ link: URL?, carried: Carried<FeedCard>) {
        let message = row.message
        let frame = ctx.frames.frames[message.key] ?? .zero
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        ctx.onMenu(MessageMenu(row: row, frame: frame, link: link ?? carried.link(of: message), onLink: link != nil))
    }
}

extension Carried<FeedCard> {
    /// The card it carries, once read.
    var card: FeedCard? {
        if case let .card(card, _) = self { return card }
        return nil
    }

    /// The picture it carries.
    var picture: ChatImage? {
        if case let .picture(image) = self { return image }
        return nil
    }

    /// It carries a picture, a preview or a card (or the card's stand-in) beside its words.
    var carriesMore: Bool {
        switch self {
        case .picture, .preview, .card, .cardLoading: true
        case .words, .nothing: false
        }
    }

    /// The link a message leads to as a whole: its preview's, the card page it links to, else the first link in its words.
    func link(of message: ChatMessage) -> URL? {
        switch self {
        case let .preview(preview): preview.url
        case let .card(_, share), let .cardLoading(share): share.link?.url
        case .words, .picture, .nothing: ChatLinks.links(in: message.text).first?.url
        }
    }
}

/// What a bubble carries under its words: a link's page, a shared card, or the card's stand-in.
private struct CarriedPart: View {
    let carried: Carried<FeedCard>
    let afterWords: Bool
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        switch carried {
        case let .picture(image):
            // With no words under it (none, and no note header) the picture is the bubble's foot too.
            MessagePicture(image: image, endsBubble: !afterWords, ctx: ctx, interactive: interactive)
        case let .preview(preview):
            LinkPreviewSection(title: preview.title, description: preview.description,
                               host: preview.link.host.replacingOccurrences(of: "www.", with: "", options: .anchored),
                               imageURL: preview.imageURL, afterWords: afterWords,
                               onOpen: interactive ? { ctx.openLink(preview.url) } : nil)
        case let .card(card, _):
            SharedCard(card: card, ctx: ctx, interactive: interactive)
        case .cardLoading:
            SharedCardSkeleton()
        case .words, .nothing:
            EmptyView()
        }
    }
}

/// A message's picture across the top of its bubble (round 7 §4.3): its shape from its size before
/// it arrives (nothing moves), the paper-dark fill while it is read — one sent from here is at hand
/// at once — then the picture, cover-cropped. One that couldn't be read keeps the fill with the
/// picture glyph, and a tap tries again; a tap on the picture opens it full screen. A hold is the
/// message's menu.
private struct MessagePicture: View {
    let image: ChatImage
    let endsBubble: Bool
    let ctx: ThreadContext
    let interactive: Bool
    @State private var loaded: UIImage?
    @State private var failed = false
    /// Each tap on a picture that couldn't be read asks again.
    @State private var attempt = 0

    var body: some View {
        let store = ctx.model.pictures
        let shown = loaded ?? store.cached(image.id, .thumb)
        MessagePictureSection(size: MessagePictureSize.of(width: image.width, height: image.height, maxWidth: ctx.rowMax),
                              endsBubble: endsBubble, label: L10n.Messages.openImage, onOpen: interactive ? { open(shown) } : nil) {
            ZStack {
                Tokens.creamDark
                if let shown {
                    Image(uiImage: shown).resizable().scaledToFill()
                } else if failed {
                    OrganicIcon(.image, size: 22, color: Tokens.textMuted)
                }
            }
        }
        .task(id: "\(image.id)#\(attempt)") {
            // What the store has is this row's now (it may have come in for another row drawing this message).
            if let kept = store.cached(image.id, .thumb) {
                loaded = kept
                return
            }
            failed = false
            let picture = await store.image(image.id, .thumb)
            loaded = picture
            failed = picture == nil && !Task.isCancelled
        }
    }

    private func open(_ shown: UIImage?) {
        if shown != nil {
            ctx.openPicture(image)
        } else if failed {
            attempt += 1
        }
    }
}

/// A shared card as the thread draws it (Messenger's shared post): its author — or the anonymous
/// mark —, cover, title, excerpt and the source line; a tap opens it.
private struct SharedCard: View {
    let card: FeedCard
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        SharedCardSection(card: card, onOpen: interactive ? { ctx.openRoute(.card(card.routeKey)) } : nil)
    }
}

extension CardByline {
    /// Who wrote `card`, as a shared card says: its author — or, posted anonymously, the anonymous
    /// mark and name, never the author.
    static func of(_ card: FeedCard) -> CardByline {
        let author = card.anonymous ? nil : card.author?.value1
        return author.map {
            CardByline(name: $0.handle, initials: $0.initials, imageURL: $0.avatarUrl.flatMap(URL.init(string:)),
                       color: $0.accent, avatarSeed: $0.avatarSeedValue)
        } ?? .anonymous(L10n.Card.anonymousAuthor)
    }
}

extension SharedCardSection {
    /// A card as a chat (or a story embedding it) draws it: its byline (``CardByline/of(_:)``), read
    /// time, cover, title, excerpt, the source line — 「私人卡」 for a 私人卡 (shared in a message, the
    /// only way anyone else reads one) where 「共振」 would stand.
    init(card: FeedCard, onOpen: (() -> Void)?) {
        self.init(
            byline: .of(card),
            readTime: L10n.App.readMinutes(count: card.readMinutes),
            title: card.title, excerpt: card.excerpt, imageURL: card.imageUrl.flatMap(URL.init(string:)),
            accentHue: card.accentHue, source: Self.source(card), onOpen: onOpen)
    }

    /// The source line's word: 「私人卡」 for a card only its author (and whoever they sent it to) reads, else 「共振」.
    static func source(_ card: FeedCard) -> String {
        CardScreen.isPrivate(card) ? L10n.Messages.privateCard : L10n.Messages.cardSource
    }
}

/// Over a note's words: the card it was left on, in a quote the note's bubble lies over — its
/// skeleton while it is read, and, when the reader may not see it (any more), the plain quote of
/// "a card", which leads nowhere. That it is a note on the card ("{handle} left a note on your
/// card" / "You left a note on {handle}'s card") goes without saying one to one — the card over the
/// words says so — so it is only read out by VoiceOver, before the card.
private struct NotedCard: View {
    let message: ChatMessage
    let carried: Carried<FeedCard>
    let mine: Bool
    let ctx: ThreadContext
    let interactive: Bool

    var body: some View {
        let handle = ctx.model.displayHandle
        let width = min(cardWidth, ctx.rowMax)
        let seed = seedFromId(message.key, start: 19)
        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            SpokenCaption(ThreadCaptions.note(mine: mine, handle: handle))
            switch carried {
            case let .card(card, _):
                CardQuote(seed: seed, width: width) { SharedCard(card: card, ctx: ctx, interactive: interactive) }
            case .cardLoading:
                CardQuote(seed: seed, width: width, plain: true) { SharedCardSkeleton() }
            case .words, .picture, .preview, .nothing:
                QuoteBubble(text: L10n.Messages.replyCard, seed: seed)
            }
        }
    }
}

/// The message a reply quotes, which the reply's bubble lies over; tapping it goes to the original. A sticker is
/// quoted by its key pose alone (round 22 v2).
/// Who answered whom goes without saying in a one-to-one thread (the reply stands on its sender's
/// side), so it is only read out by VoiceOver, before the quote.
struct QuotedReply: View {
    let quote: ReplyQuote
    let mine: Bool
    let ctx: ThreadContext
    let interactive: Bool
    /// The reply is a sticker: nothing lies over the quote's foot, so it keeps no room for it.
    var underSticker = false

    /// A quoted sticker's side.
    static let stickerSide: CGFloat = 44
    /// A quoted sticker is drawn faded, as quoted words are muted (round 22 v3) — in the thread and the replying row.
    static let stickerFade: Double = 0.55
    /// How far a sticker answering a quote rises over the quote's lower edge.
    static let stickerOverlap: CGFloat = 18

    /// The sticker a quote shows (one this build can draw), or nil: then its words.
    static func quotedSticker(_ quote: ReplyQuote) -> StickerRef? {
        quote.sticker.flatMap { StickerLibrary.shared.drawable($0) ? $0 : nil }
    }

    /// What the quote says: nothing beside a sticker it shows; else its words, or what the message was.
    static func words(_ quote: ReplyQuote) -> String {
        if quotedSticker(quote) != nil { return "" }
        return quote.summary(picture: L10n.Messages.replyImage, card: L10n.Messages.replyCard, unsentQuote: L10n.Messages.unsentQuote,
                             stickerName: { StickerLibrary.shared.name($0) })
    }

    var body: some View {
        let model = ctx.model
        VStack(alignment: mine ? .trailing : .leading, spacing: 0) {
            SpokenCaption(ThreadCaptions.reply(mine: mine, quotedMine: quote.senderId == model.me, handle: model.displayHandle))
            QuoteBubble(text: Self.words(quote),
                        seed: seedFromId(quote.id, start: 19),
                        // A sticker's quote is its key pose alone, no name beside it (round 22 v2).
                        lead: Self.quotedSticker(quote).map {
                            AnyView(StickerStill(sticker: $0, side: QuotedReply.stickerSide).opacity(QuotedReply.stickerFade))
                        },
                        reservesFoot: !underSticker,
                        onTap: interactive ? { ctx.onQuote(quote.id) } : nil)
                // VoiceOver still hears which sticker it was.
                .accessibilityLabel(Self.quotedSticker(quote).map { L10n.Messages.stickerLabel(name: StickerLibrary.shared.label($0)) }
                    ?? Self.words(quote))
        }
    }
}

/// What a reply's quote or a note's card is, as VoiceOver reads it before them (the words the
/// thread once showed as a caption).
enum ThreadCaptions {
    static func reply(mine: Bool, quotedMine: Bool, handle: String) -> String {
        mine
            ? (quotedMine ? L10n.Messages.youRepliedToYourself : L10n.Messages.youRepliedTo(handle: handle))
            : (quotedMine ? L10n.Messages.repliedToYou(handle: handle) : L10n.Messages.repliedToThemselves(handle: handle))
    }

    static func note(mine: Bool, handle: String) -> String {
        mine ? L10n.Messages.youLeftNote(handle: handle) : L10n.Messages.noteOnYourCard(handle: handle)
    }
}

/// The line under a message on its way or one that didn't go (its bubble above is dimmed).
private struct DeliveryLine: View {
    let message: ChatMessage
    let model: ThreadModel
    /// Most sends are over before anyone looks; the line is for the ones that take a moment.
    @State private var slow = false

    var body: some View {
        switch message.delivery {
        case .failed:
            Button { model.retry(message.key) } label: {
                Text(L10n.Messages.sendFailed).font(AppFonts.body(11.5)).foregroundStyle(Tokens.terracotta)
            }
            .buttonStyle(.plain)
            .padding(.top, 4).padding(.horizontal, 4)
            .accessibilityHint(L10n.Messages.retry)
        case .sending:
            Text(L10n.Messages.sending).font(AppFonts.body(11.5)).foregroundStyle(Tokens.textMuted)
                .padding(.top, 4).padding(.horizontal, 4)
                .opacity(slow ? 1 : 0)
                .frame(height: slow ? nil : 0, alignment: .top)
                .task(id: message.key) {
                    try? await Task.sleep(for: .seconds(1))
                    withAnimation(.easeOut(duration: 0.2)) { slow = true }
                }
        case .delivered, .sent:
            EmptyView()
        }
    }
}

// MARK: - Swipe to reply

/// A reply's drag in numbers: how far it is pulled, how far the message is drawn, when it takes.
nonisolated enum ReplySwipeMath {
    /// How far a message is dragged before letting go replies.
    static let threshold: CGFloat = 56
    /// The furthest a drag counts (past it the finger goes on, the message doesn't).
    static let maxPull: CGFloat = threshold * 2.4

    /// The finger's distance toward the middle, held to 0…`maxPull`.
    static func pulled(_ distance: CGFloat) -> CGFloat { min(max(distance, 0), maxPull) }

    /// How far the message is drawn for a pull: with it up to the threshold, then giving with resistance.
    static func shown(_ pulled: CGFloat) -> CGFloat {
        pulled <= threshold ? pulled : threshold + (pulled - threshold) * 0.3
    }

    /// The reply glyph's growth (0…1).
    static func progress(_ pulled: CGFloat) -> CGFloat { min(1, pulled / threshold) }

    /// Letting go here replies.
    static func takes(_ pulled: CGFloat) -> Bool { pulled >= threshold }

    /// The list stands aside from its own edge (more than a rounding's worth).
    static func drifted(offsetX: CGFloat) -> Bool { abs(offsetX) > 0.5 }
}

/// Holds the thread's scroll view at its own leading edge (round 10 §5), in UIKit: it watches the
/// scroll view's offset and puts a sideways one straight back, before anything draws it.
///
/// The thread used to do this in SwiftUI — a scroll geometry change that set the list's
/// `ScrollPosition` to x 0 — and that was the app freezing after a picture was sent (the owner's
/// watchdog report: the main thread laying out the thread's rows inside one transaction that never
/// ended). Sending re-anchors the list (the foot shrinks, the newest row arrives, the list goes to the
/// latest) and on the way its offset can land a few points aside; setting the position replaced the
/// list's anchor with a point, which moved it and re-anchored the rows again, which could set it aside
/// again — a loop through the screen's own state, re-laying out every row each turn. Here nothing goes
/// through SwiftUI's state: the offset is corrected where it is kept, once, and the correction is no
/// change SwiftUI hears of.
struct SidewaysLock: UIViewRepresentable {
    func makeUIView(context: Context) -> SidewaysLockView { SidewaysLockView() }
    func updateUIView(_ view: SidewaysLockView, context: Context) {}
}

/// ``SidewaysLock``'s view: finds the scroll view it is drawn in and keeps it at its leading edge.
final class SidewaysLockView: UIView {
    private weak var scrollView: UIScrollView?
    private var watch: NSKeyValueObservation?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        let enclosing = sequence(first: superview, next: { $0?.superview }).lazy.compactMap { $0 as? UIScrollView }.first
        if let enclosing, enclosing !== scrollView { hold(enclosing) }
    }

    /// Keeps `scrollView` at its leading edge from now on.
    func hold(_ scrollView: UIScrollView) {
        self.scrollView = scrollView
        scrollView.alwaysBounceHorizontal = false
        watch = scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
            MainActor.assumeIsolated { Self.toEdge(scrollView) }
        }
        Self.toEdge(scrollView)
    }

    /// Puts a scroll view standing aside back at its leading edge (its offset there is minus its leading inset).
    static func toEdge(_ scrollView: UIScrollView) {
        let edge = -scrollView.adjustedContentInset.left
        guard ReplySwipeMath.drifted(offsetX: scrollView.contentOffset.x - edge) else { return }
        scrollView.contentOffset = CGPoint(x: edge, y: scrollView.contentOffset.y)
    }
}

/// Drag a message toward the middle of the screen (theirs to the right, yours to the left) and the
/// reply glyph grows in behind it; past the threshold a tick says it will take, and letting go
/// replies. It always springs back. A sideways drag only, so scrolling the thread is not fought.
///
/// The row — their face and the bubble together — is moved only where it is drawn (a visual
/// effect, not an offset): its frame never leaves its place, so nothing that reads where rows are
/// (the list keeping its place as the composer grows a reply bar or loses it, the press's lift)
/// ever sees it moved and sets the list aside to follow it.
private struct SwipeToReply<Content: View>: View {
    let enabled: Bool
    let mine: Bool
    let onReply: () -> Void
    @ViewBuilder let content: Content
    @State private var pulled: CGFloat = 0
    @State private var ticked = false

    var body: some View {
        let shown = ReplySwipeMath.shown(pulled)
        let progress = ReplySwipeMath.progress(pulled)
        let dx = mine ? -shown : shown
        let row = content
            .visualEffect { view, _ in view.offset(x: dx) }
            .frame(maxWidth: .infinity)
            .background(alignment: mine ? .trailing : .leading) {
                if pulled > 0 {
                    OrganicIcon(.reply, size: 20, color: progress >= 1 ? Tokens.terracotta : Tokens.textMuted)
                        .opacity(progress)
                        .scaleEffect(0.6 + 0.4 * progress)
                        .padding(.horizontal, 6)
                        .accessibilityHidden(true)
                }
            }
        if enabled {
            row.gesture(ReplySwipe(direction: mine ? -1 : 1, onDrag: drag, onEnd: end))
        } else {
            row
        }
    }

    private func drag(_ distance: CGFloat) {
        pulled = ReplySwipeMath.pulled(distance)
        let past = ReplySwipeMath.takes(pulled)
        if past != ticked {
            ticked = past
            if past { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
        }
    }

    private func end() {
        let takes = ReplySwipeMath.takes(pulled)
        ticked = false
        withAnimation(.spring(response: 0.35, dampingFraction: 0.62)) { pulled = 0 }
        if takes { onReply() }
    }
}
