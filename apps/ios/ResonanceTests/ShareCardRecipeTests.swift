import DesignSystem
import Foundation
import Testing
import UIKit

/// The share image's recipe is the web's, number for number (native/fixtures/share-card.json, which
/// src/lib/share/shareCard.test.ts writes from SHARE_CARD and Android reads too), and its type is
/// the story's own — named by the story tokens there, resolved here through `StoryTypography`.
@MainActor @Suite struct ShareCardRecipeTests {
    static let fixture: [String: Any] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/share-card.json").standardized
        return try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    }()

    /// The value at a dotted path of the fixture.
    private func at(_ path: String) -> Any? {
        path.split(separator: ".").reduce(Self.fixture as Any?) { node, key in (node as? [String: Any])?[String(key)] }
    }

    private func number(_ path: String) -> CGFloat? { (at(path) as? NSNumber).map { CGFloat($0.doubleValue) } }

    /// The story tokens and faces the fixture names, as the app has them (Tokens.story*, AppFonts).
    private let tokens: [String: CGFloat] = [
        "--story-heading-weight": Tokens.storyHeadingWeight, "--story-heading-weight-latin": Tokens.storyHeadingWeightLatin,
        "--story-heading-tracking": Tokens.storyHeadingTracking, "--story-tracking": Tokens.storyTracking,
        "--story-title-leading": Tokens.storyTitleLeading, "--story-title-leading-latin": Tokens.storyTitleLeadingLatin,
        "--story-leading": Tokens.storyLeading, "--story-leading-latin": Tokens.storyLeadingLatin,
    ]
    private let faces: [String: AppFonts.Family] = [
        "--font-story-serif": .headingCJK, "--font-story-sans": .bodyCJK, "--font-heading": .heading, "--font-body": .body,
    ]

    /// A number of the recipe, written as one or as a story token's name.
    private func value(_ path: String) -> CGFloat? {
        if let name = at(path) as? String { return tokens[name] }
        return number(path)
    }

    @Test func everyLengthAndBudgetIsTheWebs() {
        typealias R = ShareCardRecipe
        let pairs: [(String, CGFloat)] = [
            ("canvas.width", R.canvasWidth), ("canvas.height", R.canvasHeight), ("canvas.scale", R.scale),
            ("canvas.jpegQuality", R.jpegQuality), ("safeZone.top", R.safeTop), ("safeZone.bottom", R.safeBottom),
            ("backdrop.grain", R.backdropGrain),
            ("card.width", R.cardWidth), ("card.maxHeight", R.cardMaxHeight), ("card.padding", R.padding),
            ("card.paddingBottom", R.paddingBottom), ("card.radius", R.radius),
            ("card.outline.magnitude", R.outlineMagnitude), ("card.outline.curve", R.outlineCurve),
            ("card.outline.cornerJitter", R.outlineCornerJitter), ("card.outline.cornerOffset", R.outlineCornerOffset),
            ("card.paper.lightness", R.paperLightness), ("card.paper.chroma", R.paperChroma), ("card.paper.grain", R.paperGrain),
            ("card.pen.width", R.penWidth),
            ("cover.ratio", R.coverRatio), ("cover.seedOffset", CGFloat(R.coverSeedOffset)), ("cover.grain", R.coverGrain),
            ("cover.gapBelow", R.coverGapBelow),
            ("title.withCover.size", R.titleSizeWithCover), ("title.withCover.maxLines", CGFloat(R.titleLinesWithCover)),
            ("title.withoutCover.size", R.titleSizeWithoutCover), ("title.withoutCover.maxLines", CGFloat(R.titleLinesWithoutCover)),
            ("title.gapBelow", R.titleGapBelow),
            ("words.size", R.wordsSize), ("words.withCover.maxLines", CGFloat(R.wordsLinesWithCover)),
            ("words.withoutCover.maxLines", CGFloat(R.wordsLinesWithoutCover)), ("words.gapBelow", R.wordsGapBelow),
            ("rule.height", R.ruleHeight), ("rule.colour.lightness", R.ruleLightness), ("rule.colour.chroma", R.ruleChroma),
            ("rule.colour.alpha", R.ruleAlpha), ("rule.width", R.ruleWidth), ("rule.seedOffset", CGFloat(R.ruleSeedOffset)),
            ("rule.amplitude", R.ruleAmplitude), ("rule.steps", CGFloat(R.ruleSteps)), ("rule.gapBelow", R.ruleGapBelow),
            ("byline.height", R.bylineHeight), ("byline.avatar.size", R.avatarSize), ("byline.avatar.width", R.avatarOutlineWidth),
            ("byline.gap", R.bylineGap), ("byline.name.size", R.nameSize), ("byline.name.leading", R.nameLeading),
            ("byline.verifiedMark.size", R.verifiedSize), ("byline.verifiedMark.gap", R.verifiedGap),
            ("byline.date.size", R.dateSize), ("byline.minSpace", R.bylineMinSpace),
            ("anonymous.avatar.seed", CGFloat(R.anonymousSeed)),
            ("lockup.wave.size", R.waveSize), ("lockup.wave.width", R.waveWidth), ("lockup.gap", R.lockupGap),
            ("lockup.wordmark.size", R.wordmarkSize), ("lockup.wordmark.tracking", R.wordmarkTracking),
            ("lockup.domain.size", R.domainSize), ("lockup.domain.tracking", R.domainTracking),
            ("sticker.margin", R.stickerMargin), ("sticker.scale", R.stickerScale),
            ("storiesBackground.width", R.storiesBackgroundWidth), ("storiesBackground.height", R.storiesBackgroundHeight),
        ]
        for (path, swift) in pairs {
            let web = number(path)
            #expect(web != nil, "\(path) is in the fixture")
            if let web { #expect(abs(web - swift) < 0.0001, "\(path): web \(web), app \(swift)") }
        }
        #expect(at("card.outline.segmentsH") as? [Int] == R.outlineSegmentsH)
        #expect(at("card.outline.segmentsV") as? [Int] == R.outlineSegmentsV)
        #expect(at("card.paper.grainTile") as? String == R.paperGrainTile)
        #expect(at("backdrop.grainTile") as? String == R.backdropGrainTile)
        #expect(at("byline.avatar.outline") as? String == R.avatarOutline)
        #expect(at("anonymous.avatar.initials") as? String == R.anonymousInitials)
        #expect(at("anonymous.name.message") as? String == "card.anonymousAuthor")
        #expect(at("lockup.wordmark.text") as? String == R.wordmark)
        #expect(at("lockup.domain.text") as? String == R.domain)
        #expect(at("words.text") as? String == "opening")
        // The weights the card names as numbers.
        #expect(AppFonts.weight(css: number("byline.name.weight") ?? 0) == R.nameWeight)
        #expect(AppFonts.weight(css: number("lockup.wordmark.weight") ?? 0) == R.wordmarkWeight)
    }

    /// The title and the words are set as the story is, by its script.
    @Test(arguments: StoryScript.allCases)
    func theTypeIsTheStorysOwn(_ script: StoryScript) throws {
        for (kind, type) in [("title", ShareCardRecipe.titleType(script)), ("words", ShareCardRecipe.wordsType(script))] {
            let path = "\(kind).type.\(script.rawValue)"
            let face = try #require(at("\(path).face") as? String)
            #expect(faces[face] == type.family, "\(path).face")
            #expect(value("\(path).weight").map(AppFonts.weight(css:)) == type.weight, "\(path).weight")
            #expect(value("\(path).tracking") == type.tracking, "\(path).tracking")
            #expect(value("\(path).leading") == type.leading, "\(path).leading")
            #expect((at("\(path).figures") as? String == "lining") == type.lining, "\(path).figures")
            let align = at("\(path).align") as? String
            #expect(type.alignment == (align == "justify" ? .justified : .natural), "\(path).align")
        }
        // And they are the reader's, so a card shared from the page quotes it in the page's type.
        let story = StoryTypography(script: script, compact: false)
        #expect(ShareCardRecipe.titleType(script).family == story.titleFamily)
        #expect(ShareCardRecipe.wordsType(script).family == story.bodyFamily)
        #expect(ShareCardRecipe.wordsType(script).tracking == story.bodyTracking)
    }
}
