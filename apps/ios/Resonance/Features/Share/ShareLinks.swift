import Foundation
import ResonanceKit

/// What a card or a profile is shared by — src/lib/share/links.ts, the twin: the link carries no
/// locale (the site gives whoever opens it their own language) and no tracking parameter.
enum ShareLinks {
    /// The key a card is shared under: its slug, else its id — and always its id when it is
    /// anonymous. A slug that collided carries its author's pen name (`-{handle}`), and a slug never
    /// changes: a card made anonymous after it was published would name its author in its link.
    static func cardKey(id: String, slug: String?, anonymous: Bool) -> String {
        if anonymous { return id }
        if let slug, !slug.isEmpty { return slug }
        return id
    }

    /// `{origin}/card/{key}`, the key percent-encoded as `encodeURIComponent` does.
    static func cardURL(id: String, slug: String?, anonymous: Bool, origin: URL) -> URL {
        url(origin, "card", cardKey(id: id, slug: slug, anonymous: anonymous))
    }

    /// The link of a card's page (its anonymity as the page reads it: the card's own, or the page's).
    static func cardURL(_ detail: CardDetail, origin: URL) -> URL {
        cardURL(id: detail.card.id, slug: detail.card.slug, anonymous: detail.anonymous || detail.card.anonymous, origin: origin)
    }

    /// `{origin}/u/{handle}`.
    static func profileURL(handle: String, origin: URL) -> URL { url(origin, "u", handle) }

    /// What `encodeURIComponent` leaves as it is.
    private static let component = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

    private static func url(_ origin: URL, _ segment: String, _ value: String) -> URL {
        let base = origin.absoluteString.hasSuffix("/") ? String(origin.absoluteString.dropLast()) : origin.absoluteString
        let encoded = value.addingPercentEncoding(withAllowedCharacters: component) ?? value
        return URL(string: "\(base)/\(segment)/\(encoded)") ?? origin
    }
}

/// Whether a card offers a share (share.spec §1): only a published, public card — anyone can open
/// its link — and never one in the trash. It turns on the card alone, never on the viewer, a
/// connection or a block: sharing must not tell anyone anything (blocks never hide anonymous cards).
/// Private, connections-only and draft cards show no share; their owner has 轉為公開 in the ⋯.
enum CardShareGate {
    static func offered(_ detail: CardDetail) -> Bool {
        detail.card.publishedAt != nil && detail.visibility == ._public && detail.card.visibility == ._public && !detail.card.isTrashed
    }

    /// The owner of an anonymous card is asked first: sharing it from their own account may tell
    /// people it is theirs (分享匿名卡片 · share.anonymousHint · 取消 | 分享).
    static func asksFirst(_ detail: CardDetail) -> Bool {
        detail.isOwner && (detail.anonymous || detail.card.anonymous)
    }
}
