import ResonanceGeometry
import StoryFormat
import SwiftUI
import UIKit

/// What a share card shows, already decided (the app maps a card into it): never a URL, a tag, a
/// count or anything about the sharer. An anonymous card's byline is ``Byline/anonymous`` — it has
/// no room for a pen name, photo, initials, region or verified mark, so none can be drawn.
public struct ShareCardContent {
    public enum Byline {
        /// The author: their pen name, their photo (already loaded) or initials on the card's fill,
        /// their avatar's seed, and whether they are verified.
        case named(name: String, initials: String, photo: UIImage?, verified: Bool, avatarSeed: Double)
        /// 匿名 / Anonymous over the neutral 「·」.
        case anonymous(label: String)
    }

    /// The card's own title, untranslated.
    public var title: String
    /// The story's opening (`SharePassages.opening`); empty when it holds nothing to quote.
    public var words: String
    public var script: StoryScript
    /// The cover, already loaded; nil draws the layout without one.
    public var cover: UIImage?
    public var byline: Byline
    /// The published date in the app's language (2026年10月10日 / Oct 10, 2026).
    public var date: String?
    /// The card's family (``ShareCardContent/palette(accentHue:cardId:)``) and its wobble's seed.
    public var palette: Int
    public var seed: Double

    public init(title: String, words: String, script: StoryScript, cover: UIImage?, byline: Byline, date: String?, palette: Int,
                seed: Double) {
        self.title = title
        self.words = words
        self.script = script
        self.cover = cover
        self.byline = byline
        self.date = date
        self.palette = palette
        self.seed = seed
    }

    /// A card's family on a share card: its cover's, else one fixed by its id (shareCard.ts `sharePalette`).
    public static func palette(accentHue: Double?, cardId: String) -> Int {
        CardPalette.preferred(accentHue: accentHue, position: Int(seedFromId(cardId)))
    }

    /// A card's wobble seed on a share card (`shareSeed`).
    public static func seed(cardId: String) -> Double { seedFromId(cardId) }

    /// Every word the card draws (for checks that nothing about an anonymous author is in it).
    public var drawnText: [String] {
        var out = [title, words, ShareCardRecipe.wordmark, ShareCardRecipe.domain]
        if let date { out.append(date) }
        switch byline {
        case let .named(name, initials, photo, _, _): out += [name] + (photo == nil ? [initials] : [])
        case let .anonymous(label): out += [label, ShareCardRecipe.anonymousInitials]
        }
        return out
    }
}

/// The 9:16 share picture (ShareCardRecipe, share-card.json): the backdrop in the card family's fill
/// and grain, the card centred in Stories' safe zone. Pure SwiftUI, so `ImageRenderer` draws all of
/// it (no UIKit-backed view, no image still loading).
public struct ShareCardCanvas: View {
    let content: ShareCardContent

    public init(_ content: ShareCardContent) { self.content = content }

    public var body: some View {
        let R = ShareCardRecipe.self
        ZStack(alignment: .top) {
            ShareCardBackdrop(palette: content.palette)
            ShareCardView(content)
                .frame(width: R.canvasWidth, height: R.safeBottom - R.safeTop, alignment: .center)
                .padding(.top, R.safeTop)
        }
        .frame(width: R.canvasWidth, height: R.canvasHeight, alignment: .top)
    }
}

/// Instagram's movable layer: the card alone, with a transparent margin so its wobble isn't cut.
public struct ShareCardSticker: View {
    let content: ShareCardContent

    public init(_ content: ShareCardContent) { self.content = content }

    public var body: some View {
        ShareCardView(content).padding(ShareCardRecipe.stickerMargin)
    }
}

/// The backdrop alone: the family's fill under the band grain (Instagram's background, and the picture's).
public struct ShareCardBackdrop: View {
    let palette: Int

    public init(palette: Int) { self.palette = palette }

    public var body: some View {
        let family = CardPalette(index: palette)
        family.fill
            // GrainOverlay at the band's mean darkening: ink at 2×, as the bands draw it.
            .overlay { GrainLayer(shape: Rectangle(), mode: .tile, opacity: ShareCardRecipe.backdropGrain * 2, tile: ShareCardRecipe.backdropGrainTile) }
            .frame(width: ShareCardRecipe.canvasWidth, height: ShareCardRecipe.canvasHeight)
    }
}

/// The card itself: the desktop story card's outline, paper and pen, then the cover, the title, the
/// story's opening, the wavy rule and the byline with the wave · Resonance · resonance.channel lockup.
public struct ShareCardView: View {
    let content: ShareCardContent

    public init(_ content: ShareCardContent) { self.content = content }

    public var body: some View {
        let R = ShareCardRecipe.self
        let family = CardPalette(index: content.palette)
        let inner = R.cardWidth - 2 * R.padding
        let covered = content.cover != nil
        VStack(alignment: .leading, spacing: 0) {
            if let cover = content.cover {
                ShareCover(image: cover, width: inner, height: inner * R.coverRatio, seed: content.seed + Double(R.coverSeedOffset))
                    .padding(.bottom, R.coverGapBelow)
            }
            ShareText(content.title, type: R.titleType(content.script),
                      size: covered ? R.titleSizeWithCover : R.titleSizeWithoutCover,
                      maxLines: covered ? R.titleLinesWithCover : R.titleLinesWithoutCover, width: inner, script: content.script)
                .padding(.bottom, R.titleGapBelow)
            if !content.words.isEmpty {
                ShareText(content.words, type: R.wordsType(content.script), size: R.wordsSize,
                          maxLines: covered ? R.wordsLinesWithCover : R.wordsLinesWithoutCover, width: inner, script: content.script)
                    .padding(.bottom, R.wordsGapBelow)
            }
            WavyRuleShape(seed: content.seed + Double(R.ruleSeedOffset), amp: Double(R.ruleAmplitude), steps: R.ruleSteps)
                .stroke(family.separator, style: StrokeStyle(lineWidth: R.ruleWidth, lineCap: .round))
                .frame(width: inner, height: R.ruleHeight)
                .padding(.bottom, R.ruleGapBelow)
            ShareByline(byline: content.byline, date: content.date, fill: family.fill)
                .frame(width: inner, height: R.bylineHeight)
        }
        .padding(.top, R.padding)
        .padding(.horizontal, R.padding)
        .padding(.bottom, R.paddingBottom)
        .frame(width: R.cardWidth)
        .background {
            let shape = CardOutlineShape(seed: content.seed)
            ZStack {
                shape.fill(family.interior)
                GrainLayer(shape: shape, mode: .tile, opacity: R.paperGrain, tile: R.paperGrainTile)
                shape.stroke(family.border, style: StrokeStyle(lineWidth: R.penWidth, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

/// The cover in its organic clip (OrganicImage's, card seed + 5), the cover grain over it.
struct ShareCover: View {
    let image: UIImage
    let width: CGFloat
    let height: CGFloat
    let seed: Double

    var body: some View {
        let bleed = (min(width, height) * 0.05 + 6 + 4).rounded(.up)
        ZStack {
            Image(uiImage: image).resizable().scaledToFill()
            GrainLayer(shape: Rectangle(), mode: .tile, opacity: ShareCardRecipe.coverGrain * 2, tile: "grain-overlay")
        }
        .frame(width: width + bleed * 2, height: height + bleed * 2)
        .clipShape(OrganicImageShape(seed: seed, radius: 18, bleed: bleed))
        .frame(width: width, height: height)
    }
}

/// The byline row: the avatar, the pen name (or 匿名) over the date, and the lockup at its end.
struct ShareByline: View {
    let byline: ShareCardContent.Byline
    let date: String?
    let fill: Color

    var body: some View {
        let R = ShareCardRecipe.self
        HStack(spacing: 0) {
            avatar.padding(.trailing, R.bylineGap)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: R.verifiedGap) {
                    switch byline {
                    case let .named(name, _, _, verified, _):
                        Text(name).font(Self.font(.body, R.nameSize, R.nameWeight)).foregroundStyle(Tokens.text).lineLimit(1)
                        if verified { OrganicIcon(.verified, size: R.verifiedSize, color: Tokens.sage, strokeWidth: Tokens.ink) }
                    case let .anonymous(label):
                        Text(label).font(Self.font(.body, R.nameSize, R.nameWeight)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                    }
                }
                if let date {
                    Text(date).font(Self.font(.body, R.dateSize, .regular)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
            }
            .layoutPriority(-1)
            Spacer(minLength: R.bylineMinSpace)
            lockup
        }
    }

    @ViewBuilder private var avatar: some View {
        let R = ShareCardRecipe.self
        switch byline {
        case let .named(_, initials, photo, _, seed):
            ShareAvatar(initials: initials, photo: photo, fill: fill, size: R.avatarSize, seed: seed)
        case .anonymous:
            ShareAvatar(initials: R.anonymousInitials, photo: nil, fill: Tokens.creamDark, size: R.avatarSize, seed: Double(R.anonymousSeed))
        }
    }

    private var lockup: some View {
        let R = ShareCardRecipe.self
        return VStack(alignment: .trailing, spacing: 1) {
            HStack(spacing: R.lockupGap) {
                OrganicIcon(.wave, size: R.waveSize, color: Tokens.terracotta, strokeWidth: R.waveWidth)
                Text(R.wordmark).font(Self.font(.heading, R.wordmarkSize, R.wordmarkWeight))
                    .tracking(R.wordmarkTracking * R.wordmarkSize).foregroundStyle(Tokens.text)
            }
            Text(R.domain).font(Self.font(.body, R.domainSize, .regular))
                .tracking(R.domainTracking * R.domainSize).foregroundStyle(Tokens.textMuted)
        }
        .fixedSize()
    }

    /// The picture is for other people: its type is the drawn size, whatever this phone's text size.
    static func font(_ family: AppFonts.Family, _ size: CGFloat, _ weight: UIFont.Weight) -> Font {
        Font(AppFonts.uiFont(family, size: size, weight: weight))
    }
}

/// HandDrawnAvatar's shape and pen, holding a photo already loaded (or the initials on the fill).
struct ShareAvatar: View {
    let initials: String
    let photo: UIImage?
    let fill: Color
    let size: CGFloat
    let seed: Double

    var body: some View {
        let shape = WobRectShape(radius: size * 0.4, seed: seed, mag: size * 0.022, options: WobRectOptions(
            curve: 1.3, cornerJitter: 3.2, cornerOffset: size * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
        ZStack {
            shape.fill(fill)
            if let photo {
                Image(uiImage: photo).resizable().scaledToFill().frame(width: size, height: size).clipShape(shape)
            } else {
                Text(initials)
                    .font(Font(AppFonts.uiFont(.body, size: size * HandDrawnAvatar.initialsScale(initials), weight: .bold)))
                    .foregroundStyle(Tokens.text)
            }
        }
        .frame(width: size, height: size)
        .overlay { shape.stroke(Tokens.avatarStroke, style: StrokeStyle(lineWidth: ShareCardRecipe.avatarOutlineWidth, lineJoin: .round)) }
    }
}

/// Text on the card, set as the story sets it (its face, tracking, CSS line box, justified CJK spread
/// between characters) within a line budget, the last line cut with an ellipsis — laid out by TextKit
/// and drawn into a Canvas, so `ImageRenderer` draws it (a UIKit text view it would leave blank).
struct ShareText: View {
    let layout: ShareTextLayout

    init(_ text: String, type: ShareCardRecipe.TextType, size: CGFloat, maxLines: Int, width: CGFloat, script: StoryScript) {
        layout = ShareTextLayout(text, type: type, size: size, maxLines: maxLines, width: width, script: script)
    }

    var body: some View {
        let layout = layout
        Canvas { context, _ in
            context.withCGContext { cg in layout.draw(in: cg) }
        }
        .frame(width: layout.width, height: layout.height)
        .accessibilityElement()
        .accessibilityLabel(layout.text)
    }
}

/// One block of the card's text laid out: how many lines it takes, how tall it is, and its drawing.
public final class ShareTextLayout {
    public let text: String
    public let width: CGFloat
    let storage: NSTextStorage
    let manager = NSLayoutManager()
    let container: NSTextContainer
    let boxes: CSSLineBoxes

    public init(_ text: String, type: ShareCardRecipe.TextType, size: CGFloat, maxLines: Int, width: CGFloat, script: StoryScript) {
        self.text = text
        self.width = width
        let font = AppFonts.uiFont(type.family, size: size, weight: type.weight, lining: type.lining)
        let lineBox = size * type.leading
        let style = NSMutableParagraphStyle()
        style.alignment = type.alignment
        style.minimumLineHeight = lineBox
        style.maximumLineHeight = lineBox
        style.lineBreakStrategy = .pushOut
        let attributed = NSMutableAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: Palette.shared(.text), // the picture leaves the device: light terracotta
            .paragraphStyle: style,
            .kern: type.tracking * size,
        ])
        if script == .cjk, let latin = StoryTypography.latinMarkFamily(for: type.family) {
            let mark = AppFonts.uiFont(latin, size: size, weight: type.weight, lining: type.lining)
            for index in StoryScript.latinMarks(text) { attributed.addAttribute(.font, value: mark, range: NSRange(location: index, length: 1)) }
        }
        storage = NSTextStorage(attributedString: StoryJustification.prepared(attributed))
        container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        container.maximumNumberOfLines = maxLines
        container.lineBreakMode = .byTruncatingTail
        boxes = CSSLineBoxes(font: font, lineHeight: type.leading)
        manager.delegate = boxes
        manager.addTextContainer(container)
        storage.addLayoutManager(manager)
        StoryJustification.apply(storage: storage, layoutManager: manager, container: container)
        manager.ensureLayout(for: container)
    }

    /// The lines it takes (at most its budget).
    public var lineCount: Int { StoryJustification.lines(manager, container).count }

    /// Whether its words ran past the budget (the last line ends in an ellipsis).
    public var truncated: Bool {
        let glyphs = manager.glyphRange(for: container)
        let shown = manager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil)
        return NSMaxRange(shown) < storage.length || manager.truncatedGlyphRange(inLineFragmentForGlyphAt: max(0, glyphs.upperBound - 1)).location != NSNotFound
    }

    public var height: CGFloat { ceil(manager.usedRect(for: container).height) }

    func draw(in context: CGContext) {
        UIGraphicsPushContext(context)
        let glyphs = manager.glyphRange(for: container)
        manager.drawBackground(forGlyphRange: glyphs, at: .zero)
        manager.drawGlyphs(forGlyphRange: glyphs, at: .zero)
        UIGraphicsPopContext()
    }
}
