import DesignSystem
import ResonanceKit
import SwiftUI

/// Messages (MessagesPage.tsx, phone): your conversations, newest first, then
/// the people you're connected with but haven't talked to yet. Live: the rows
/// and the tab's badge follow Firestore as messages arrive.
///
/// On a phone (round 23 §5, the owner: 「手機上私訊頁面左右 margin 減少…僅限於手機」) the rows are bands as the
/// notifications' are (``ListBands``): the screen's width, their content 20 from each edge, the first row 4
/// under the bar's foot so its face stands 16 down, level with the notifications' first title. An iPad's,
/// the Mac's and the two panes' keep the page's 16 / 18, the row's 14, the 16 under the bar and the blob
/// (``ConversationsFrame``).
struct ConversationsScreen: View {
    @Environment(SessionStore.self) private var session
    /// Beside the conversation in two panes: the empty state is the detail pane's to show.
    @Environment(\.chosenThread) private var chosen
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.window) private var window

    var body: some View {
        let store = session.conversations
        let frame = ConversationsFrame.of(window.layoutClass)
        // The curve under each row: the next row's key, the starters' label under the last conversation, the list's
        // end under the last row.
        let conversationKeys = store.conversations.map { ConversationsFrame.key(conversation: $0.id) }
        let starterKeys = store.starters.map { ConversationsFrame.key(starter: $0.id) }
        let conversationsBelow = ListBands.below(conversationKeys, after: starterKeys.isEmpty ? ListBands.endKey : ConversationsFrame.startersKey)
        let startersBelow = ListBands.below(starterKeys, after: ListBands.endKey)
        ScrollViewReader { proxy in
        // Its panes are fixed: the list keeps its place under the bar on a tablet too (round 5 E2).
        // The invite, come in above the rows once its switches are read, is the list's head: at the top, the top stays in view.
        TabScreen(L10n.App.Nav.messages, titleInBar: true, phoneTop: frame.top, tabletGap: false,
                  head: session.notifyAsks.shows(.connectionCards, connected: connected) ? "notifyInvite" : nil) {
            VStack(alignment: .leading, spacing: 0) {
                if store.loaded {
                    // A connection's new cards offered (notification-asks §4): atop the list, once there is someone —
                    // in the rows' column, 16 above the first row; on a phone its pen line 16 under the bar's foot,
                    // where a first row's face would stand, and 20 from the edges, where the rows' content is.
                    NotificationInvite(invite: .connectionCards, connected: connected)
                        .padding(.horizontal, frame.inviteInset)
                        .padding(.top, frame.inviteTop)
                        .padding(.bottom, 16)
                }
                if chosen == nil, store.loaded, store.conversations.isEmpty, store.starters.isEmpty {
                    OrganicEmptyState(title: L10n.Messages.emptyTitle, message: L10n.Messages.empty, icon: .chat, seed: 23, fills: true)
                        // Centred on the page, not on the list's inset column.
                        .padding(.leading, -frame.leading)
                        .padding(.trailing, -frame.trailing)
                } else if !store.loaded, store.failed {
                    // Nothing read, and a listener failed: a retry rather than an empty page.
                    OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                        store.resume()
                    }
                } else if !store.loaded {
                    // Still reading: the rows' own shapes, so nothing jumps when they arrive.
                    ConversationsSkeleton(inset: frame.rowInset)
                }
                ForEach(Array(store.conversations.enumerated()), id: \.element.id) { i, convo in
                    ConversationRow(person: convo.other, preview: preview(convo), time: convo.sentAt.map { Self.time($0) },
                                    unread: convo.unread, draft: draft(convo.id), inset: frame.rowInset,
                                    band: frame.bands ? (top: conversationKeys[i], bottom: conversationsBelow[i]) : nil)
                        .id(convo.other.id)
                }
                if !store.starters.isEmpty {
                    Text(L10n.Messages.startSection.uppercased())
                        .font(AppFonts.body(11))
                        .tracking(11 * 0.08)
                        .foregroundStyle(Tokens.textMuted)
                        .padding(.top, 16)
                        // On a phone, on bare paper clear of the bands' curves under it.
                        .padding(.bottom, frame.bands ? ListBands.titleToBand : 4)
                        .padding(.horizontal, frame.rowInset)
                    ForEach(Array(store.starters.enumerated()), id: \.element.id) { i, person in
                        ConversationRow(person: person, preview: L10n.Messages.noMessagesYet, time: nil, unread: 0,
                                        draft: session.uid.flatMap { draft(ThreadModel.pairId($0, person.id)) }, inset: frame.rowInset,
                                        band: frame.bands ? (top: starterKeys[i], bottom: startersBelow[i]) : nil)
                            .id(person.id)
                    }
                }
            }
            // A tablet's: the page's 14 plus the list pane's own 2 / 4. A phone's bands run edge to edge.
            .padding(.leading, frame.leading)
            .padding(.trailing, frame.trailing)
            .readableColumn()
        }
        // Two panes: a conversation chosen from elsewhere (a bell, a profile) has its row brought into
        // view, once the list has it (round 5 E3).
        // The invite's reasons: the system's word on each visit and back from Settings, the switches once a session.
        .task(id: connected) { await session.notifyAsks.refresh(connected: connected) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await session.notifyAsks.refresh(connected: connected) } }
        }
        .animation(.easeOut(duration: 0.2), value: session.notifyAsks.shows(.connectionCards, connected: connected))
        .onChange(of: chosenRow, initial: true) { _, id in
            guard let id else { return }
            withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(id) }
        }
        }
    }

    /// Connected with someone (not blocked): a letter waiting is no connection.
    private var connected: Bool {
        let store = session.conversations
        guard let ids = store.connectedIds else { return false }
        return !ids.subtracting(store.blockedIds ?? []).isEmpty
    }

    /// The row of the conversation in the detail pane, when the list holds it.
    private var chosenRow: String? {
        guard let chosen else { return nil }
        let store = session.conversations
        return (store.conversations.map(\.other) + store.starters).first(where: chosen.isChosen)?.id
    }

    private func preview(_ convo: ConversationsStore.Conversation) -> String {
        Self.preview(text: convo.lastText, image: convo.lastImage, fromMe: convo.lastFromMe, unsent: convo.lastUnsent,
                     handle: convo.other.handle, sticker: convo.lastSticker, album: convo.lastAlbum)
    }

    /// The words left unsent in a conversation, for its row (round 22 §4.4).
    private func draft(_ pair: String) -> String? {
        guard let uid = session.uid else { return nil }
        return session.chatDrafts.preview(uid: uid, pair: pair)
    }

    /// A row's line: the last message's words — 傳送了一張圖片 for a picture sent without any, 傳送了 N 張圖片 for an
    /// album's, 傳送了一張貼圖 for a sticker (round 22: its words are the fallback for older builds) — after 你： when
    /// it was the viewer's;
    /// 還沒有訊息 before the first. An unsent last message reads as its line in the thread does (round 16 §3):
    /// 你收回了一則訊息 / {handle} 收回了一則訊息.
    static func preview(text: String?, image: Bool, fromMe: Bool, unsent: Bool = false, handle: String = "", sticker: Bool = false,
                        album: Int? = nil) -> String {
        if unsent { return fromMe ? L10n.Messages.unsentByYou : L10n.Messages.unsentByThem(handle: handle) }
        guard let text else { return L10n.Messages.noMessagesYet }
        let shown = sticker ? L10n.Messages.stickerShared
            : (album ?? 0) > 1 ? L10n.Messages.albumShared(count: album ?? 0)
            : text.isEmpty && image ? L10n.Messages.imageShared : text
        return (fromMe ? L10n.Messages.youPrefix : "") + shown
    }

    /// Today: the time as the thread says it (下午3:04, ``ThreadScreen/time(_:language:)``); earlier: the date (9/29).
    static func time(_ date: Date, now: Date = .now, language: Strings.Language = Strings.shared.language) -> String {
        guard Calendar.current.isDate(date, inSameDayAs: now) else {
            let locale = Locale(identifier: language == .zhTW ? "zh-Hant-TW" : "en")
            return date.formatted(Date.FormatStyle(locale: locale).month(.defaultDigits).day(.defaultDigits))
        }
        return ThreadScreen.time(date, language: language)
    }
}

/// One row: the avatar, the pen name over the last line, the time and the
/// unread badge on the right. On a phone the row is a band — the screen's
/// width between its curve and the one under it (`band`: its key and the
/// next's), washed while pressed (round 23 §5, as the notifications are); on
/// a tablet, the Mac and beside the thread pane, a faint hand-drawn wash while
/// pressed or under a pointer — and beside the thread pane, the chosen row's
/// terracotta wash.
private struct ConversationRow: View {
    let person: Person
    let preview: String
    let time: String?
    let unread: Int
    /// The words left unsent here (round 22 §4.4): shown in the line's place after a pen, in terracotta, until sent.
    var draft: String?
    /// The row's own sides inside its column (``ConversationsFrame/rowInset``).
    var inset: CGFloat = 14
    /// A phone's band: the row's key and the key of the curve under it.
    var band: (top: String, bottom: String)?
    @Environment(\.chosenThread) private var chosen

    var body: some View {
        let route = Route.thread(handle: person.handle, uid: person.id, note: nil)
        if let chosen {
            // Two panes: the row puts its conversation beside the list, wearing the active wash while it is there.
            Button { chosen.choose(route) } label: { label }
                .buttonStyle(RowWashStyle(seed: Double(seedFromString(person.id)), chosen: chosen.isChosen(person)))
                .accessibilityAddTraits(chosen.isChosen(person) ? .isSelected : [])
        } else if let band {
            NavigationLink(value: route) { label }
                .buttonStyle(BandWashStyle(top: band.top, bottom: band.bottom))
        } else {
            NavigationLink(value: route) { label }
                .buttonStyle(RowWashStyle(seed: Double(seedFromString(person.id))))
        }
    }

    private var label: some View {
            HStack(spacing: 12) {
                HandDrawnAvatar(initials: person.initials, imageURL: person.avatarURL,
                                color: OKLCHColor.avatar(person.accentColor) ?? Tokens.avatarWait,
                                size: 40, seed: person.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 5)
                VStack(alignment: .leading, spacing: 3) {
                    Text(person.handle).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                    if let draft {
                        HStack(spacing: 4) {
                            // The deep accent, as the web (--terracotta-deep) and Android write a draft.
                            OrganicIcon(.pen, size: 13, color: Tokens.terracottaDeep)
                            Text(draft).font(AppFonts.body(13)).foregroundStyle(Tokens.terracottaDeep).lineLimit(1)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(L10n.Messages.draftLabel(text: draft))
                    } else {
                        Text(preview).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 5) {
                    if let time { Text(time).font(AppFonts.body(11)).foregroundStyle(Tokens.textMuted) }
                    if unread > 0 { UnreadBadge(count: unread) }
                }
                .fixedSize()
            }
            .padding(.vertical, ListBands.rowPad)
            .padding(.horizontal, inset)
            .contentShape(Rectangle())
    }
}

/// How the conversations list is laid out (round 23 §5): a phone's rows are bands with their content 20 from each
/// edge, the first row 4 under the bar's foot (its face 16 down, level with the notifications' first title); an
/// iPad's, the Mac's and the two panes' keep the page's 16 / 18 and the pane's own 14, the 16 under the bar and the
/// rows' blob. Android's ConversationsFrame.
nonisolated struct ConversationsFrame: Equatable {
    /// The rows' column inset from the list's edges (the band's, or the blob's box).
    let leading: CGFloat
    let trailing: CGFloat
    /// Inside it, to the row's content.
    let rowInset: CGFloat
    /// Under the bar's foot to the first row (TabScreen's `phoneTop`, which a tablet's fixed panes use too).
    let top: CGFloat
    /// Bands (a phone) or the hand-drawn blob (a tablet, the Mac, two panes).
    let bands: Bool

    static func of(_ layout: LayoutClass) -> ConversationsFrame {
        layout == .compact
            ? ConversationsFrame(leading: 0, trailing: 0, rowInset: ListBands.contentInset, top: 4, bands: true)
            : ConversationsFrame(leading: 16, trailing: 18, rowInset: 14, top: 16, bands: false)
    }

    /// The invite atop the list: on a phone 20 from the edges with its pen line where the first row's face would
    /// stand (16 under the bar's foot); a tablet's in the rows' column, 4 under its top.
    var inviteInset: CGFloat { bands ? ListBands.contentInset : 0 }
    var inviteTop: CGFloat { bands ? ListBands.rowPad : 4 }

    /// The rows' keys (a curve's seed is its lower row's), and the starters' label's (the band above it ends on it).
    static func key(conversation id: String) -> String { "c:\(id)" }
    static func key(starter id: String) -> String { "s:\(id)" }
    static let startersKey = "starters"
}

/// The conversations still on their way: six rows in a row's measures — the 40 face, the pen name
/// over the last line, the time at the end — in the warm shimmer. Android's ConversationsSkeleton.
private struct ConversationsSkeleton: View {
    /// The rows' own sides (``ConversationsFrame/rowInset``).
    var inset: CGFloat = 14
    private static let names: [CGFloat] = [96, 128, 80, 112, 88, 120]
    private static let lines: [CGFloat] = [0.78, 0.56, 0.7, 0.48, 0.64, 0.52]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<6, id: \.self) { i in
                HStack(spacing: 12) {
                    SkeletonBlock(width: 40, circle: true)
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonBlock(width: Self.names[i], height: 13)
                        SkeletonBlock(fraction: Self.lines[i], height: 12)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    SkeletonBlock(width: 30, height: 10)
                }
                .padding(.vertical, ListBands.rowPad)
                .padding(.horizontal, inset)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.Home.moreLoading)
        .skeletonTimeline()
    }
}

/// RowWash: the row's hand-drawn wash (R h·0.28, three turns across), shown while pressed or under
/// a pointer; the chosen row of a two-pane list wears it in terracotta. The bell's rows wear it too.
struct RowWashStyle: ButtonStyle {
    let seed: Double
    var chosen = false

    func makeBody(configuration: Configuration) -> some View {
        RowWash(label: configuration.label, seed: seed, pressed: configuration.isPressed, chosen: chosen)
    }
}

struct RowWash<Label: View>: View {
    let label: Label
    let seed: Double
    let pressed: Bool
    let chosen: Bool
    @State private var hovered = false

    var body: some View {
        label
            .background {
                GeometryReader { geo in
                    let h = Double(geo.size.height)
                    let shape = WobRectShape(radius: h * 0.28, seed: seed, mag: 2.4, options: WobRectOptions(
                        curve: 1.3, cornerJitter: 2.4, cornerOffset: h * 0.05, segmentsH: .count(3), segmentsV: .count(1)))
                    ZStack {
                        shape.fill(Tokens.terracottaLight.opacity(chosen ? 0.55 : 0))
                        shape.fill(Tokens.towardInk.opacity(pressed || hovered ? 0.045 : 0))
                    }
                }
            }
            .onHover { hovered = $0 }
            .animation(.easeOut(duration: 0.16), value: chosen)
    }
}
