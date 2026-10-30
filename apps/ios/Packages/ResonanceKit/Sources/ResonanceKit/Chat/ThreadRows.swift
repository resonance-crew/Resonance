import Foundation

/// Where a message sits in a run of messages from one person: it picks the corners the bubble tucks.
public enum RunPosition: Equatable, Sendable {
    /// Alone: all four corners round.
    case single
    /// The first of a run: the corner facing the next message is tucked.
    case first
    /// In the middle: both corners facing a neighbour are tucked.
    case middle
    /// The last of a run: the corner facing the one before is tucked.
    case last

    /// A neighbour above it in the run: the corner on the sender's side, top, is tucked.
    public var joinsAbove: Bool { self == .middle || self == .last }
    /// A neighbour below it in the run: the corner on the sender's side, bottom, is tucked.
    public var joinsBelow: Bool { self == .first || self == .middle }
    /// The last bubble of a run (or a lone one): the other person's avatar sits beside it.
    public var endsRun: Bool { self == .single || self == .last }
}

/// One message of the thread with what the list needs around it: its place in a run
/// (Messenger's stacking), and the labels that lead it.
///
/// `dayLabel` leads the first message of a day. `timeLabel` leads a message that comes
/// `ThreadRows.timeLabelGap` or more after the one before it on the same day. A label is a break:
/// nothing stacks across one.
public struct ThreadRow: Identifiable, Equatable, Sendable {
    public let message: ChatMessage
    public let position: RunPosition
    public let dayLabel: Bool
    public let timeLabel: Bool
    /// Round 22: the pictures of an album this row draws as one grid, in the album's order — `message`
    /// (the first of them in the thread) among them; nil for a row of one message.
    public let album: [ChatMessage]?

    public init(message: ChatMessage, position: RunPosition, dayLabel: Bool, timeLabel: Bool, album: [ChatMessage]? = nil) {
        self.message = message
        self.position = position
        self.dayLabel = dayLabel
        self.timeLabel = timeLabel
        self.album = album
    }

    /// The messages the row draws: its album's, or its own.
    public var messages: [ChatMessage] { album ?? [message] }

    /// Whether the row draws the message with this id or key.
    public func holds(_ idOrKey: String) -> Bool {
        messages.contains { $0.id == idOrKey || $0.key == idOrKey }
    }

    /// The row's identity in a list: the message's key (a message sent from here keeps its row when the document replaces it).
    public var id: String { message.key }
    /// It stacks under the message before it (a tight gap instead of the one between runs).
    public var joinsAbove: Bool { position.joinsAbove }
}

/// Lays the thread out in runs, the way Messenger stacks messages sent close together:
/// consecutive messages from the same sender, less than `runGap` apart on the same day, with no
/// label between them, are one run; a reply opens a run (it leads with the quote it answers), so
/// does a note (it leads with the card it was left on), and a message that failed to send ends the
/// run it is in (its "not sent" line sits under it). Pure; the twin of Android's `ThreadRows`.
public enum ThreadRows {
    /// Messages further apart than this don't stack.
    public static let runGap: TimeInterval = 3 * 60
    /// A message this long after the one before it (on the same day) gets a time label.
    public static let timeLabelGap: TimeInterval = 15 * 60

    /// `messages` oldest first, as `ThreadMessages.build` returns them; days as `calendar` counts them.
    /// One sender's consecutive pictures of one album are one row (round 22, ``albums(_:)``).
    public static func build(_ messages: [ChatMessage], calendar: Calendar = .current) -> [ThreadRow] {
        let groups = albums(messages)
        guard groups.contains(where: { $0.count > 1 }) else { return rows(messages, calendar: calendar) }
        // Laid out as if each album were its first picture alone, which then carries the rest.
        let heads = groups.map { $0[0] }
        let laid = rows(heads, calendar: calendar)
        return zip(laid, groups).map { row, group in
            guard group.count > 1 else { return row }
            let ordered = group.sorted { ($0.album?.index ?? 0, $0.sentAt) < ($1.album?.index ?? 0, $1.sentAt) }
            return ThreadRow(message: row.message, position: row.position, dayLabel: row.dayLabel, timeLabel: row.timeLabel,
                             album: ordered)
        }
    }

    /// `messages` cut into the rows they draw as: each alone, except that consecutive pictures of one album
    /// from one sender go together — delivered or on their way, still standing; one that failed to send
    /// stands alone with its retry, and a member missing (not arrived, unsent) leaves the grid smaller.
    public static func albums(_ messages: [ChatMessage]) -> [[ChatMessage]] {
        var groups: [[ChatMessage]] = []
        for m in messages {
            if let album = m.album, m.image != nil, !m.isUnsent, m.delivery != .failed,
               let last = groups.last?.last, let lastAlbum = last.album, lastAlbum.id == album.id,
               last.senderId == m.senderId, last.image != nil, !last.isUnsent, last.delivery != .failed {
                groups[groups.count - 1].append(m)
            } else {
                groups.append([m])
            }
        }
        return groups
    }

    private static func rows(_ messages: [ChatMessage], calendar: Calendar) -> [ThreadRow] {
        guard !messages.isEmpty else { return [] }
        let days = messages.map { calendar.startOfDay(for: $0.sentAt) }
        let day = messages.indices.map { $0 == 0 || days[$0] != days[$0 - 1] }
        let time = messages.indices.map { i in
            i > 0 && !day[i] && messages[i].sentAt.timeIntervalSince(messages[i - 1].sentAt) >= timeLabelGap
        }
        let joins = messages.indices.map { i -> Bool in
            guard i > 0, !day[i], !time[i] else { return false }
            let m = messages[i], before = messages[i - 1]
            // A reply opens with the quote it answers, a note with its card: each starts a run of its own.
            return m.replyTo == nil && !m.isNote && before.senderId == m.senderId && before.delivery != .failed
                // A message still on its way carries this phone's clock: a few seconds off the server's doesn't unstack it.
                && abs(m.sentAt.timeIntervalSince(before.sentAt)) < runGap
        }
        return messages.indices.map { i in
            let above = joins[i]
            let below = i + 1 < messages.count && joins[i + 1]
            let position: RunPosition = above && below ? .middle : above ? .last : below ? .first : .single
            return ThreadRow(message: messages[i], position: position, dayLabel: day[i], timeLabel: time[i])
        }
    }
}
