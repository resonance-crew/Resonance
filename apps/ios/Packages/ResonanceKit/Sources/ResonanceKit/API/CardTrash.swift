import Foundation
import ResonanceAPI

/// The trash's clock — src/lib/cards/trash.ts. A card moved to the trash keeps `trashedAt` (the
/// server's time when it went in) and is deleted for good `days` later. The server says when
/// (`purgeAt`, on the owner's own trashed card only), and a card past it is gone to its owner too:
/// off the trash shelf, refused to restore, not found in the writer and on its page.
public nonisolated enum CardTrash {
    /// How long a card waits in the trash (the copy's `{days}`).
    public static let days = 30
    public static let day: TimeInterval = 86_400

    /// When a card moved to the trash at `trashedAt` is deleted for good.
    public static func purgeAt(trashedAt: Date) -> Date {
        trashedAt.addingTimeInterval(TimeInterval(days) * day)
    }

    /// What the trash says of a card's time left: `lastDay` within its last day (「一天內永久刪除」),
    /// else whole days, rounded up, never fewer than one (「{count} 天後永久刪除」).
    public static func daysLeft(purgeAt: Date, now: Date = .now) -> (lastDay: Bool, days: Int) {
        let left = purgeAt.timeIntervalSince(now)
        return (left <= day, max(1, Int((left / day).rounded(.up))))
    }
}

extension FeedCard {
    /// When the card went to the trash; nil for a card that isn't there (and for anyone but its owner).
    public var trashedDate: Date? { trashedAt.flatMap(ISO8601.date) }

    /// Whether the card is in the trash (only its owner is ever told).
    public var isTrashed: Bool { trashedAt != nil }

    /// When the card in the trash is deleted for good: the server's word, else 30 days after it went in.
    public var purgeDate: Date? {
        purgeAt.flatMap(ISO8601.date) ?? trashedDate.map { CardTrash.purgeAt(trashedAt: $0) }
    }
}
