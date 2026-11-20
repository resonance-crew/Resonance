import DesignSystem
import ResonanceKit
import SwiftUI

extension FeedCard {
    /// StoryCard's fields (lib/adapters/story.ts cardToStory). Anonymous cards
    /// get the placeholder byline: a dot, seeded from the card id.
    var story: StoryCardContent { story(author: self.author?.value1) }

    /// The card as everyone sees it: an anonymous card of the viewer's own (the server names its
    /// author to its owner) keeps the anonymous byline too — the owner's shelf marks it that way.
    var publicStory: StoryCardContent { story(author: anonymous ? nil : self.author?.value1) }

    /// The cover a list draws (B2): the smaller one (≤ 960 px, `imageThumbUrl`) when the server has it,
    /// else the cover itself. A card's page, the cover editor and the share picture keep `imageUrl`.
    nonisolated var listCoverURL: URL? {
        (imageThumbUrl.flatMap { $0.isEmpty ? nil : $0 } ?? imageUrl).flatMap(URL.init(string:))
    }

    /// The cover itself, when a list draws the smaller one: asked for if that one fails.
    nonisolated var listCoverFallbackURL: URL? {
        guard let thumb = imageThumbUrl, !thumb.isEmpty else { return nil }
        return imageUrl.flatMap(URL.init(string:))
    }

    private func story(author: Author?) -> StoryCardContent {
        var content = StoryCardContent(
            id: id,
            title: title,
            excerpt: excerpt,
            authorName: author?.handle ?? L10n.Card.anonymousAuthor,
            authorInitials: author?.initials ?? "·",
            authorImageURL: author?.avatarUrl.flatMap(URL.init(string:)),
            avatarSeed: author.map { $0.avatarSeedValue } ?? anonymousSeed,
            readTime: L10n.App.readMinutes(count: readMinutes),
            tags: tags,
            imageURL: listCoverURL,
            imageLabel: imageLabel ?? String(title.prefix(24)),
            accentHue: accentHue,
            // The web leaves a pick unexplained on purpose (home/page.tsx):
            // the surprise of opening the card is the point.
            reason: nil
        )
        content.imageFallbackURL = listCoverFallbackURL
        return content
    }

    /// MiniStoryCard's fields (MiniCardGrid): cover, title, byline — the
    /// card's own family tints the avatar and an empty cover.
    var mini: MiniStoryCardContent {
        let author = self.author?.value1
        var content = MiniStoryCardContent(
            id: id,
            title: title,
            authorName: author?.handle ?? L10n.Card.anonymousAuthor,
            authorInitials: author?.initials ?? "·",
            authorImageURL: author?.avatarUrl.flatMap(URL.init(string:)),
            avatarSeed: author.map { $0.avatarSeedValue } ?? anonymousSeed,
            imageURL: listCoverURL,
            accentHue: accentHue
        )
        content.imageFallbackURL = listCoverFallbackURL
        return content
    }

    private var anonymousSeed: Double { Double((id.unicodeScalars.first?.value ?? 7) * 31) }

    /// Where the card lives on the site (its slug, or its id before it had one).
    var routeKey: String { slug ?? id }
}

extension Author {
    /// HandDrawnAvatar's seed: the stored avatarSeed, else the web's fallback.
    var avatarSeedValue: Double {
        if let seed = avatarSeed, let n = Double(seed) { return n }
        return Double((initials.unicodeScalars.first?.value ?? 7) * 13)
    }

    var accent: Color { OKLCHColor.avatar(accentColor) ?? Tokens.avatarWait }
}
