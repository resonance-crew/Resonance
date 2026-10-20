import StoryFormat
import SwiftUI
import UIKit

/// A story card made into a picture — the 9:16 share image (1080 × 1920) the apps draw on the
/// device: the card recipe of src/lib/share/shareCard.ts `SHARE_CARD`, number for number, pinned by
/// native/fixtures/share-card.json (ShareCardRecipeTests reads it). Lengths are points on the
/// 360 × 640 canvas, before `scale`.
///
/// Type is the story's, never restated: a card shared from the reader quotes the story in the type
/// the reader sets it in, by its script (`titleType` / `wordsType`, from `StoryTypography`'s
/// tokens) — only the sizes and line budgets are the card's own. The words are ResonanceKit's
/// `SharePassages.opening`.
///
/// Never on the card: tags, read time, a region flag, counts, the URL path, a QR code, anything
/// shaped like a button, anything about the sharer. An anonymous card's byline is 匿名 / Anonymous
/// over the neutral "·" avatar — never a photo, pen name, initials, region or verified mark.
public nonisolated enum ShareCardRecipe {
    /// How one kind of text on the card is set.
    public struct TextType: Hashable, Sendable {
        public var family: AppFonts.Family
        public var weight: UIFont.Weight
        /// Letter spacing in em.
        public var tracking: CGFloat
        /// Line height × size.
        public var leading: CGFloat
        /// Lining figures (`lnum`).
        public var lining: Bool
        public var alignment: NSTextAlignment
    }

    // MARK: The canvas

    public static let canvasWidth: CGFloat = 360
    public static let canvasHeight: CGFloat = 640
    /// 360 × 640 drawn @3: 1080 × 1920 px, sRGB, opaque.
    public static let scale: CGFloat = 3
    public static let jpegQuality: CGFloat = 0.9
    /// Kept clear of Stories' own chrome: the card is centred between these (y, in points).
    public static let safeTop: CGFloat = 84
    public static let safeBottom: CGFloat = 527
    /// The backdrop: the card family's fill (`Tokens.cardFill{p}`) under the band grain.
    public static let backdropGrain: CGFloat = 0.045
    public static let backdropGrainTile = "grain-overlay"

    // MARK: The card

    public static let cardWidth: CGFloat = 300
    public static let cardMaxHeight: CGFloat = 443
    public static let padding: CGFloat = 22
    public static let paddingBottom: CGFloat = 22
    public static let radius: CGFloat = 22
    /// The desktop StoryCard's outline: wobRect(w, h, radius, seedFromId(card id), min(w, h) × magnitude, …).
    public static let outlineMagnitude: CGFloat = 0.025
    public static let outlineSegmentsH = [3, 4]
    public static let outlineSegmentsV = [5, 6]
    public static let outlineCurve: CGFloat = 0.55
    public static let outlineCornerJitter: CGFloat = 0.7
    public static let outlineCornerOffset: CGFloat = 4
    /// The paper: oklch(97.5% 0.012 hue) of the card's family, under the card grain.
    public static let paperLightness: CGFloat = 97.5
    public static let paperChroma: CGFloat = 0.012
    public static let paperGrain: CGFloat = 0.2
    public static let paperGrainTile = "grain-card"
    /// The pen: the family's `cardBorder{p}` at the one pen's width.
    public static let penWidth: CGFloat = Tokens.ink

    // MARK: The cover

    /// Height × the content's width (256 × 128), clipped in OrganicImageShape (card seed + 5).
    public static let coverRatio: CGFloat = 0.5
    public static let coverSeedOffset = 5
    public static let coverGrain: CGFloat = 0.03
    public static let coverGapBelow: CGFloat = 16

    // MARK: The title (the card's own, untranslated)

    public static let titleSizeWithCover: CGFloat = 22
    public static let titleLinesWithCover = 2
    public static let titleSizeWithoutCover: CGFloat = 26
    public static let titleLinesWithoutCover = 3
    public static let titleGapBelow: CGFloat = 12

    /// The title's type by the story's script: the story's title face, weight, tracking and leading, lining figures.
    public static func titleType(_ script: StoryScript) -> TextType {
        let story = StoryTypography(script: script, compact: false)
        return TextType(family: story.titleFamily, weight: story.titleWeight, tracking: story.titleTracking,
                        leading: story.titleLeading, lining: true, alignment: .natural)
    }

    // MARK: The words (the story's opening)

    public static let wordsSize: CGFloat = 14
    public static let wordsLinesWithCover = 4
    public static let wordsLinesWithoutCover = 8
    /// Omitted, with its gap, when the story has nothing to quote.
    public static let wordsGapBelow: CGFloat = 16

    /// The words' type by the story's script: the story body's face, tracking, leading and justification.
    public static func wordsType(_ script: StoryScript) -> TextType {
        let story = StoryTypography(script: script, compact: false)
        return TextType(family: story.bodyFamily, weight: .regular, tracking: story.bodyTracking,
                        leading: story.bodyLeading, lining: false, alignment: story.alignment(.body))
    }

    // MARK: The rule

    /// StoryCardSeparator: wavyLine(width, seed + seedOffset, amplitude, steps), oklch(55% 0.04 hue / 0.4).
    public static let ruleHeight: CGFloat = 6
    public static let ruleLightness: CGFloat = 55
    public static let ruleChroma: CGFloat = 0.04
    public static let ruleAlpha: CGFloat = 0.4
    public static let ruleWidth: CGFloat = Tokens.inkLight
    public static let ruleSeedOffset = 91
    public static let ruleAmplitude: CGFloat = 1.2
    public static let ruleSteps = 6
    public static let ruleGapBelow: CGFloat = 14

    // MARK: The byline

    public static let bylineHeight: CGFloat = 32
    /// HandDrawnAvatar on the family's fill, outlined oklch(36% 0.06 60 / 0.55) at the pen's width.
    public static let avatarSize: CGFloat = 30
    public static let avatarOutline = "oklch(36% 0.06 60 / 0.55)"
    public static let avatarOutlineWidth: CGFloat = Tokens.ink
    public static let bylineGap: CGFloat = 10
    /// The pen name: DM Sans 600 13/1.3, one line.
    public static let nameSize: CGFloat = 13
    public static let nameWeight: UIFont.Weight = .semibold
    public static let nameLeading: CGFloat = 1.3
    /// After the pen name when the author is verified; never on an anonymous card.
    public static let verifiedSize: CGFloat = 12
    public static let verifiedGap: CGFloat = 4
    /// The date in the app's language (2026年10月10日 / Oct 10, 2026): DM Sans 11.5, muted.
    public static let dateSize: CGFloat = 11.5
    /// The least room between the byline and the lockup.
    public static let bylineMinSpace: CGFloat = 8
    /// An anonymous card: "·" on cream-dark (seed 97), 「匿名」 (`card.anonymousAuthor`) in muted ink.
    public static let anonymousInitials = "·"
    public static let anonymousSeed = 97

    // MARK: The lockup (right-aligned, where a feed card has its →)

    /// The wave glyph in terracotta at the pen's width.
    public static let waveSize: CGFloat = 16
    public static let waveWidth: CGFloat = Tokens.ink
    public static let lockupGap: CGFloat = 4
    /// 「Resonance」: Playfair 700 13, −0.02em.
    public static let wordmark = "Resonance"
    public static let wordmarkSize: CGFloat = 13
    public static let wordmarkWeight: UIFont.Weight = .bold
    public static let wordmarkTracking: CGFloat = -0.02
    /// 「resonance.channel」: DM Sans 10.5, +0.01em, muted.
    public static let domain = "resonance.channel"
    public static let domainSize: CGFloat = 10.5
    public static let domainTracking: CGFloat = 0.01

    // MARK: Instagram

    /// The movable layer: the card alone with a transparent margin (so the wobble isn't cut), @2, PNG.
    public static let stickerMargin: CGFloat = 6
    public static let stickerScale: CGFloat = 2
    /// The background: the backdrop alone, 1080 × 1920 JPEG.
    public static let storiesBackgroundWidth: CGFloat = 1080
    public static let storiesBackgroundHeight: CGFloat = 1920
}
