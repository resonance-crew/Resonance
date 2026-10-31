import DesignSystem
import ResonanceKit
import SwiftUI

/// Notifications, live (web: NotificationBell, round 21). In parts by time — 今天, 這週, 更早 — the
/// rows apart by air alone, no rules between them: who did it (their face) on the left, their pen name
/// and what they did — a note's own words quoted under it in its card's colour — and when, and the
/// card it is about on the right. Tapping opens where it happened and marks it read.
struct NotificationsScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        let store = session.notifications
        TabScreen(L10n.App.Nav.notifications, titleInBar: true) {
            if store.loaded && store.items.isEmpty {
                OrganicEmptyState(title: L10n.App.Notifications.emptyTitle, message: L10n.App.Notifications.empty,
                                  icon: .bell, seed: 37, fills: true)
            } else if !store.loaded, store.failed {
                // Nothing read, and the listener failed: not a loader forever, a retry.
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    store.resume()
                }
            } else if !store.loaded {
                // Still reading: the rows' own shapes, not a loader.
                NotificationsSkeleton().readableColumn()
            } else {
                let extras = store.extras(reading: session.reading)
                // The times move on by themselves (剛剛 → 1 分鐘前), and a row passes from 今天 to 這週 at midnight.
                TimelineView(.everyMinute) { timeline in
                    list(store.items, extras: extras, now: timeline.date)
                }
                .readableColumn()
                // Who they are and the cards they are about: asked for once each time the screen shows, for
                // the ones not read yet; what was read is kept.
                .task(id: BellExtras.key(store.items)) {
                    await extras.load(store.items) { session.conversations.person($0) }
                }
            }
        }
    }

    private func list(_ items: [NotificationsStore.Item], extras: BellExtras, now: Date) -> some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(Array(BellTime.parts(items, now: now).enumerated()), id: \.element.id) { i, part in
                Text(part.group.title)
                    .font(AppFonts.body(13, weight: .semibold))
                    .foregroundStyle(Tokens.textMuted)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, i == 0 ? 0 : 14)
                    .padding(.bottom, 4)
                    // Its words start where the rows' faces do.
                    .padding(.horizontal, Self.gutter + Self.rowPad)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(part.items) { item in row(item, extras: extras, now: now) }
                }
            }
        }
    }

    /// The column's own room either side of a row, whose press wash spans it; and the row's inside it,
    /// so its content keeps the screen's usual 20.
    static let gutter: CGFloat = 6
    static let rowPad: CGFloat = 14

    private func row(_ item: NotificationsStore.Item, extras: BellExtras, now: Date) -> some View {
        Button {
            session.notifications.markRead(item)
            if let route = Self.route(for: item) { openRoute(route) }
        } label: {
            NotificationRowLabel(sentence: BellSentence.of(item),
                                 preview: Self.preview(of: item),
                                 unread: item.isUnread,
                                 face: Self.face(of: item, extras: extras),
                                 card: Self.card(of: item, extras: extras),
                                 when: item.createdAt.map { BellTime.when($0, now: now) } ?? "")
                .padding(.horizontal, Self.rowPad)
        }
        .buttonStyle(RowWashStyle(seed: Double(seedFromString(item.id) % 97)))
        .padding(.horizontal, Self.gutter)
    }

    /// A note's own words (a note IS what it says), nothing for any other row.
    static func preview(of item: NotificationsStore.Item) -> String? {
        guard item.type == "note", let preview = item.preview, !preview.isEmpty else { return nil }
        return preview
    }

    /// The row's left: its sender's face (as read), or the glyph of a row with nobody behind it.
    static func face(of item: NotificationsStore.Item, extras: BellExtras) -> BellFace {
        guard BellSentence.namesSomeone(item.type) else { return .glyph(BellSentence.glyph(item.type)) }
        let handle = item.fromHandle ?? ""
        switch extras.person(item.fromUserId) {
        case let .found(person): return .person(person)
        case .pending: return .pending
        case .settled: return .initials(BellFace.initials(handle), seed: BellFace.seed(uid: item.fromUserId, handle: handle))
        }
    }

    /// The row's right: the card it is about, as read (nothing for a row about no card, or a card the
    /// viewer can't read any more).
    static func card(of item: NotificationsStore.Item, extras: BellExtras) -> BellCard {
        guard let id = item.cardId, !id.isEmpty else { return .none }
        switch extras.cards.lookup(id) {
        case let .found(card): return .card(card)
        case .loading: return .pending
        case .hidden, .failed: return .none
        }
    }

    /// The row's sentence as one string (what the bell says in words: the name and what they did).
    static func text(for item: NotificationsStore.Item) -> String {
        BellSentence.of(item).whole
    }

    /// Where a notification leads (the web's hrefs).
    ///
    /// A note or resonance on one of your anonymous cards opens that card and nothing else: opening
    /// the writer's thread would read it (zeroing an unread count they can watch) and set up a reply
    /// that answers the anonymous card under your name. No card to open is nowhere to go — never the
    /// thread instead.
    static func route(for item: NotificationsStore.Item) -> Route? {
        if item.anonymous, ["note", "resonance"].contains(item.type) { return item.cardId.map(Route.card) }
        switch item.type {
        case "translation_done", "card_link": return item.cardId.map(Route.card)
        // NotificationBell: these open the conversation with that person; a note arrives quoted, ready to answer.
        case "note":
            let note = item.cardId.flatMap { card in item.noteId.map { MessagingAPI.NoteRef(cardId: card, noteId: $0) } }
            return item.fromHandle.map { Route.thread(handle: $0, uid: item.fromUserId, note: note) }
        case "invite_accepted", "message", "resonance": return item.fromHandle.map { Route.thread(handle: $0, uid: item.fromUserId, note: nil) }
        default: return nil
        }
    }
}

// MARK: - Parts and times

/// The bell's parts and its rows' times (the web's bellTime.ts): newest first, the viewer's today, the
/// six calendar days before it, and everything older — by the viewer's own calendar days, so yesterday
/// 23:59 is a day before today 00:01.
nonisolated enum BellTime {
    enum Group: Equatable, Hashable {
        case today, thisWeek, earlier

        var title: String {
            switch self {
            case .today: L10n.App.Notifications.today
            case .thisWeek: L10n.App.Notifications.thisWeek
            case .earlier: L10n.App.Notifications.earlier
            }
        }
    }

    /// Whole calendar days from `at` to `now` in `calendar`'s time zone (negative: `at` is on a later day).
    static func calendarDays(_ at: Date, now: Date, calendar: Calendar = .current) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: at), to: calendar.startOfDay(for: now)).day ?? 0
    }

    /// Which part a row stands in (`bellGroup`): the same calendar day → today; 1–6 days before → this
    /// week; else earlier. A clock behind the server's (a row from "later today") is today's.
    static func group(_ at: Date, now: Date, calendar: Calendar = .current) -> Group {
        let days = calendarDays(at, now: now, calendar: calendar)
        if days <= 0 { return .today }
        return days < 7 ? .thisWeek : .earlier
    }

    /// One part of the bell: its heading's group and its rows.
    struct Part: Identifiable {
        let group: Group
        var items: [NotificationsStore.Item]
        var id: Group { group }
    }

    /// The rows in their parts, in the list's order (newest first); a row without a time is today's.
    static func parts(_ items: [NotificationsStore.Item], now: Date, calendar: Calendar = .current) -> [Part] {
        var out: [Part] = []
        for item in items {
            let group = item.createdAt.map { Self.group($0, now: now, calendar: calendar) } ?? .today
            if let i = out.firstIndex(where: { $0.group == group }) {
                // Out of order (a clock that moved) joins its own part all the same.
                out[i].items.append(item)
            } else {
                out.append(Part(group: group, items: [item]))
            }
        }
        return out
    }

    /// When it happened, as its row says it (`bellWhen`) — in step with its part: today the minutes or
    /// hours (under a minute, 剛剛 / Just now), this week the calendar days (昨天, 3 天前), earlier the
    /// date (with the year when it isn't this year's). Never "in 1 minute" from a clock behind the server's.
    static func when(_ at: Date, now: Date, locale: Locale = Strings.shared.locale, justNow: String = L10n.App.Notifications.justNow,
                     calendar: Calendar = .current) -> String {
        let days = calendarDays(at, now: now, calendar: calendar)
        let relative = RelativeDateTimeFormatter()
        relative.locale = locale
        relative.calendar = calendar
        relative.unitsStyle = .short
        relative.dateTimeStyle = .named
        if days <= 0 {
            let minutes = max(0, Int(now.timeIntervalSince(at) / 60))
            if minutes < 1 { return justNow }
            return minutes < 60 ? relative.localizedString(from: DateComponents(minute: -minutes))
                : relative.localizedString(from: DateComponents(hour: -(minutes / 60)))
        }
        if days < 7 { return relative.localizedString(from: DateComponents(day: -days)) }
        let sameYear = calendar.component(.year, from: at) == calendar.component(.year, from: now)
        let format = DateFormatter()
        format.locale = locale
        format.calendar = calendar
        format.timeZone = calendar.timeZone
        format.setLocalizedDateFormatFromTemplate(sameYear ? "Md" : "yMd")
        return format.string(from: at)
    }
}

// MARK: - The sentence

/// A row's sentence, its pen name apart (the web's `bellSentence`): `before`, `handle`, `after` — the
/// name set in semibold wherever the language puts it (「{handle} 寄來一張小紙條」, "{handle} sent you a
/// little note"). A row with nobody behind it (a summary, a translation, an expired invite) is all `before`.
nonisolated struct BellSentence: Equatable {
    let before: String
    let handle: String?
    let after: String

    var whole: String { before + (handle ?? "") + after }

    /// Stands in for the pen name while the sentence is formatted, so the name can be set apart wherever it falls.
    static let mark = "\u{2063}"

    /// The rows that name who did it.
    static func namesSomeone(_ type: String) -> Bool {
        ["invite", "invite_accepted", "message", "resonance", "note", "card_link"].contains(type)
    }

    /// The glyph a row with nobody behind it wears instead of a face.
    static func glyph(_ type: String) -> IconName {
        switch type {
        case "resonance_summary": .sparkle
        case "translation_done": .globe
        case "invite_expired": .users
        default: .bell
        }
    }

    static func of(_ item: NotificationsStore.Item) -> BellSentence {
        of(type: item.type, handle: item.fromHandle ?? "", count: item.count ?? 0)
    }

    static func of(type: String, handle: String, count: Int) -> BellSentence {
        let formatted: String? = switch type {
        case "invite": L10n.App.Notifications.invite(handle: mark)
        case "invite_accepted": L10n.App.Notifications.inviteAccepted(handle: mark)
        case "message": L10n.App.Notifications.message(handle: mark)
        case "resonance": L10n.App.Notifications.resonance(handle: mark)
        case "note": L10n.App.Notifications.note(handle: mark)
        case "card_link": L10n.App.Notifications.cardLink(handle: mark)
        default: nil
        }
        if let formatted {
            let parts = formatted.components(separatedBy: mark)
            return BellSentence(before: parts.first ?? "", handle: handle, after: parts.dropFirst().joined())
        }
        let whole = switch type {
        case "resonance_summary": L10n.App.Notifications.resonanceSummary(count: count)
        case "translation_done": L10n.App.Notifications.translationDone
        case "invite_expired": L10n.App.Notifications.inviteExpired
        default: type
        }
        return BellSentence(before: whole, handle: nil, after: "")
    }
}

// MARK: - The row

/// A row's left: their face (the photo, else initials on their colour), a quiet tile while they are
/// read, or the glyph of a row with nobody behind it.
enum BellFace: Equatable {
    case pending
    case person(Person)
    /// A profile that is gone (or couldn't be read): the initials of the pen name the row kept.
    case initials(String, seed: Double)
    case glyph(IconName)

    /// The first two characters of the pen name, upper-cased (`?` for none).
    static func initials(_ handle: String) -> String {
        let two = String(handle.prefix(2)).uppercased()
        return two.isEmpty ? "?" : two
    }

    /// The web's fallback seed: from the sender's id (else their pen name), 1–50.
    static func seed(uid: String?, handle: String) -> Double {
        Double(seedFromString(uid.flatMap { $0.isEmpty ? nil : $0 } ?? handle) % 50 + 1)
    }
}

/// A row's right: the card it is about — a quiet tile while it is read, nothing for none.
enum BellCard: Equatable {
    case none
    case pending
    case card(FeedCard)
}

/// One bell row (round 21, the web's BellRow): [face 40] [words] [card 46], top-aligned, 12 apart. The
/// words: the sentence — the pen name in semibold, always in the text's ink; the rest in the text's
/// ink while unread, muted once read (weight never changes) — with the unread dot ending its first
/// line; a note's words quoted under it in the story's serif after a wavy rule in its card's pen; then
/// when. VoiceOver hears "Unread" as the row's value, never the dot.
struct NotificationRowLabel: View {
    let sentence: BellSentence
    let preview: String?
    let unread: Bool
    var face: BellFace = .pending
    var card: BellCard = .none
    var when: String = ""

    static let faceSize: CGFloat = 40
    static let thumbSize: CGFloat = 46

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            BellFaceView(face: face)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(Self.attributed(sentence, unread: unread))
                        .lineSpacing(Self.lineSpacing(.body, size: 14, lineHeight: 1.45))
                        .fixedSize(horizontal: false, vertical: true)
                    if unread {
                        // The web's 6 dot, 8 after the words, on their middle — ending the first line, beside who
                        // it is from, never after a note's words.
                        Circle().fill(Tokens.terracotta).frame(width: 6, height: 6)
                            .alignmentGuide(.firstTextBaseline) { $0.height + 2.5 }
                            .accessibilityHidden(true)
                    }
                }
                if let preview { BellNoteQuote(text: preview, card: card.found) }
                if !when.isEmpty {
                    Text(verbatim: when).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            BellThumbView(card: card)
        }
        .multilineTextAlignment(.leading)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(unread ? L10n.App.Notifications.unread : "")
    }

    /// The sentence's runs: the name in semibold and the text's ink; the rest in the text's ink while
    /// unread, muted once read. Drawn as written — never a localized interpolation, which set their
    /// 「，」「。」 the zh-TW way, centred.
    static func attributed(_ sentence: BellSentence, unread: Bool) -> AttributedString {
        let rest = unread ? Tokens.text : Tokens.textMuted
        func run(_ text: String, _ font: Font, _ color: Color) -> AttributedString {
            var run = AttributedString(text)
            run.font = font
            run.foregroundColor = color
            return run
        }
        var out = run(sentence.before, AppFonts.body(14), rest)
        if let handle = sentence.handle { out += run(handle, AppFonts.body(14, weight: .semibold), Tokens.text) }
        out += run(sentence.after, AppFonts.body(14), rest)
        return out
    }

    /// SwiftUI's extra room between lines for a CSS `line-height` (a multiple of the size).
    static func lineSpacing(_ family: AppFonts.Family, size: CGFloat, lineHeight: CGFloat) -> CGFloat {
        let font = AppFonts.scaledUIFont(family, size: size)
        return max(0, font.pointSize * lineHeight - font.lineHeight)
    }
}

extension BellCard {
    var found: FeedCard? {
        if case let .card(card) = self { return card }
        return nil
    }
}

/// The row's face: the sender's (the conversation list's avatar), a quiet tile while read, or a glyph's tile.
private struct BellFaceView: View {
    let face: BellFace
    private let size = NotificationRowLabel.faceSize

    var body: some View {
        switch face {
        case .pending:
            UnevenRoundedRectangle(cornerRadii: Self.radii, style: .continuous)
                .fill(Tokens.skeletonBase)
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        case let .person(person):
            HandDrawnAvatar(initials: person.initials, imageURL: person.avatarURL,
                            color: OKLCHColor.avatar(person.accentColor) ?? Tokens.avatarWait, size: size,
                            seed: person.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 5)
        case let .initials(initials, seed):
            HandDrawnAvatar(initials: initials, color: Tokens.avatarWait, size: size, seed: seed)
        case let .glyph(icon):
            // Terracotta-light at 40 % over the page, the glyph in terracotta.
            UnevenRoundedRectangle(cornerRadii: Self.radii, style: .continuous)
                .fill(Tokens.terracottaLight.opacity(0.4))
                .frame(width: size, height: size)
                .overlay { OrganicIcon(icon, size: 18, color: Tokens.terracotta) }
                .accessibilityHidden(true)
        }
    }

    /// 13 15 13 15: a tile a little lopsided, as the web's.
    static let radii = RectangleCornerRadii(topLeading: 13, bottomLeading: 15, bottomTrailing: 13, topTrailing: 15)
}

/// The card a row is about, at 46: its cover clipped to a small hand-drawn tile with no pen line (a feed
/// card's picture has none either), else its own colours with the first character of its title; a quiet
/// tile in the same outline while it is read; nothing when the viewer can't read it any more. The face
/// reaches past the box by ``BellThumb/bleed``, so the outline's outward swells land on the picture.
private struct BellThumbView: View {
    let card: BellCard
    private let size = NotificationRowLabel.thumbSize

    var body: some View {
        switch card {
        case .none:
            EmptyView()
        case .pending:
            Tokens.skeletonBase
                .frame(width: size + BellThumb.bleed * 2, height: size + BellThumb.bleed * 2)
                .clipShape(BellThumb.Outline(seed: 1))
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        case let .card(card):
            let family = PublishStep.previewPalette(accentHue: card.accentHue, cardId: card.id)
            let cover = card.imageUrl.flatMap { $0.isEmpty ? nil : URL(string: $0) }
            let face = size + BellThumb.bleed * 2
            ZStack {
                (cover == nil ? family.fill : family.skeleton)
                if let cover {
                    RemoteImage(url: cover, pixelSize: CGSize(width: face * 3, height: face * 3))
                        .frame(width: face, height: face)
                } else {
                    Text(verbatim: card.title.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? "")
                        .font(AppFonts.font(.headingCJK, size: 19, weight: .semibold))
                        .foregroundStyle(family.deep)
                }
            }
            .frame(width: face, height: face)
            .clipShape(BellThumb.Outline(seed: Double(seedFromString(card.id) % 97)))
            // Takes the row's 46; the face reaches past it on every side.
            .frame(width: size, height: size)
            .accessibilityHidden(true)
        }
    }
}

/// The thumb's outline: a small hand-drawn tile, one gentle swell along each side and its corners
/// unevenly round and set off a little — the web's `bellThumbPath`
/// (`wobRect(46, 46, 46 × 0.26, seed, 46 × 0.05, two turns a side, curve 1.4, jitter 2.6, offset 46 × 0.07)`).
nonisolated enum BellThumb {
    /// How far the face reaches past the 46 box: the swells go out by up to 2.1.
    static let bleed: CGFloat = 4

    /// Drawn in the bled frame's coordinates: the 46 tile, set in by ``bleed``.
    nonisolated struct Outline: Shape {
        let seed: Double

        func path(in rect: CGRect) -> Path {
            let size = rect.width - BellThumb.bleed * 2
            return WobRectShape(radius: size * 0.26, seed: seed, mag: size * 0.05,
                                options: WobRectOptions(curve: 1.4, cornerJitter: 2.6, cornerOffset: size * 0.07,
                                                        segmentsH: .count(2), segmentsV: .count(2)))
                .path(in: rect.insetBy(dx: BellThumb.bleed, dy: BellThumb.bleed))
        }
    }
}

/// A note's words as the bell quotes them: the story's serif, 14 on 1.65, the text's ink, three lines at
/// most, 14 in after a wavy rule at the house pen in its card's colour family's pen (the quiet grey
/// sheet pen until the card is known).
private struct BellNoteQuote: View {
    let text: String
    let card: FeedCard?

    var body: some View {
        let pen = card.map { PublishStep.previewPalette(accentHue: $0.accentHue, cardId: $0.id).border } ?? Tokens.fieldBorderHover
        let spacing = NotificationRowLabel.lineSpacing(.headingCJK, size: 14, lineHeight: 1.65)
        Text(verbatim: text)
            .font(AppFonts.font(.headingCJK, size: 14))
            .foregroundStyle(Tokens.text)
            .lineSpacing(spacing)
            .lineLimit(3)
            .truncationMode(.tail)
            .fixedSize(horizontal: false, vertical: true)
            // The CSS line box's half-leading above the first line and under the last.
            .padding(.vertical, spacing / 2)
            .padding(.leading, 14)
            .overlay(alignment: .leading) {
                BellQuoteRule()
                    .stroke(pen, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
                    .frame(width: 6)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 1)
    }
}

/// The quote's rule: the web's `wavyVertical(h, 7, 1.4, max(2, round(h / 20)))`, down the middle of its 6.
private nonisolated struct BellQuoteRule: Shape {
    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        guard h > 0 else { return Path() }
        return wavyVertical(h, seed: 7, amp: 1.4, steps: max(2, Int((h / 20).rounded())))
            .path(offsetX: Double(rect.midX), offsetY: Double(rect.minY))
    }
}

/// The bell's rows still on their way: six of the new row's measures — a 40 face tile, two lines of
/// words, and on two of them a 46 card tile — apart by air, no rules. Android's NotificationsSkeleton.
private struct NotificationsSkeleton: View {
    private static let lines: [CGFloat] = [0.82, 0.64, 0.9, 0.58, 0.76, 0.7]

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(0..<6, id: \.self) { i in
                HStack(alignment: .top, spacing: 12) {
                    SkeletonBlock(width: NotificationRowLabel.faceSize, height: NotificationRowLabel.faceSize, radius: 13)
                    VStack(alignment: .leading, spacing: 9) {
                        SkeletonBlock(fraction: Self.lines[i], height: 14)
                        SkeletonBlock(fraction: 0.32, height: 11)
                    }
                    .padding(.top, 3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    if i == 0 || i == 2 {
                        SkeletonBlock(width: NotificationRowLabel.thumbSize, height: NotificationRowLabel.thumbSize, radius: 12)
                    }
                }
                .padding(.horizontal, NotificationsScreen.gutter + NotificationsScreen.rowPad)
                .padding(.vertical, 10)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.Home.moreLoading)
        .skeletonTimeline()
    }
}
