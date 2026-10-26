import Nuke
import NukeUI
import StoryFormat
import SwiftUI

/// A story, laid out as the web reader sets it (src/styles/story.css `.story-prose`) in the story's
/// own type (``StoryTypography``: by its script and the window, its words growing with the person's
/// text size up to 2×): a CJK story in Noto Sans TC, justified, under Noto Serif TC headings; a Latin
/// one in DM Sans, ragged, under Playfair. The pen's quote rail, photos in organic clips, card links
/// as embedded cards, links standing alone as their page's card (when the story has one), tables as
/// rules and words (``StoryTableView``), and blank-line markers as air. Vertical rhythm follows CSS
/// margins, collapsing between blocks (``ProseMetrics``).
///
/// `embed` draws a card link's card — nil (a card the reader can't see: private, gone, by someone
/// they blocked) draws the link the story wrote, a link of the prose's own (its face and size on the
/// reading curve, the link's ink and wave), as the web's CardEmbedLink falls back to; `linkCard` a
/// standalone link's page card (`StoryBlock.soleLink`'s address and words) — nil leaves the
/// paragraph as it is written.
public struct StoryMarkdownView<Embed: View, LinkCard: View>: View {
    let blocks: [StoryBlock]
    let typography: StoryTypography
    let language: String?
    let onOpenURL: (URL) -> Void
    let embed: (_ href: String, _ title: String) -> Embed?
    let linkCard: (_ href: String?, _ text: String) -> LinkCard?
    var anchorsHeadings = false
    var headingSpace: String?

    /// `language`: the story's own (`ScriptRule.storyLang`), for VoiceOver.
    public init(blocks: [StoryBlock], typography: StoryTypography, language: String? = nil, onOpenURL: @escaping (URL) -> Void,
                embed: @escaping (_ href: String, _ title: String) -> Embed?,
                linkCard: @escaping (_ href: String?, _ text: String) -> LinkCard?) {
        self.blocks = blocks
        self.typography = typography
        self.language = language
        self.onOpenURL = onOpenURL
        self.embed = embed
        self.linkCard = linkCard
    }

    public var body: some View {
        BlockStack(blocks: blocks, style: .body(typography, language: language), rhythm: typography.rhythm(), onOpenURL: onOpenURL, embed: embed,
                   linkCard: linkCard, anchors: anchorsHeadings, headingSpace: headingSpace)
    }

    /// Each heading among the story's own blocks (not inside a quote or a list) carries a
    /// ``StoryHeadingAnchor`` for a `ScrollViewReader` to scroll to (the card page's table of
    /// contents), set ``StoryHeadingAnchor/margin`` above the heading. With `space` (a named
    /// coordinate space around the story), each heading's top in it goes up as ``StoryHeadingTops``
    /// — where the headings are, for marking the one being read.
    public func anchoringHeadings(in space: String? = nil) -> Self {
        var view = self
        view.anchorsHeadings = true
        view.headingSpace = space
        return view
    }
}

/// The tops of a story's own headings in the coordinate space ``StoryMarkdownView/anchoringHeadings(in:)``
/// names, by their place among the story's blocks.
public nonisolated struct StoryHeadingTops: PreferenceKey {
    public static let defaultValue: [Int: CGFloat] = [:]

    public static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        value.merge(nextValue()) { $1 }
    }
}

/// Where a heading of a story is, for `ScrollViewProxy.scrollTo(_:anchor:)`: its place among the
/// story's blocks. Scrolled to with the `.top` anchor, the heading lands ``margin`` under the top of
/// what shows (the web's `scroll-margin-top`: the header and 16).
public struct StoryHeadingAnchor: Hashable, Sendable {
    public let index: Int
    public static let margin: CGFloat = 16

    public init(index: Int) {
        self.index = index
    }
}

extension StoryMarkdownView where LinkCard == EmptyView {
    /// A story whose standalone links stay the paragraphs they are.
    public init(blocks: [StoryBlock], typography: StoryTypography, language: String? = nil, onOpenURL: @escaping (URL) -> Void,
                embed: @escaping (_ href: String, _ title: String) -> Embed?) {
        self.init(blocks: blocks, typography: typography, language: language, onOpenURL: onOpenURL, embed: embed) { _, _ in nil }
    }
}

struct BlockStack<Embed: View, LinkCard: View>: View {
    let blocks: [StoryBlock]
    let style: ProseStyle
    let rhythm: ProseRhythm
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed?
    let linkCard: (String?, String) -> LinkCard?
    var anchors = false
    var headingSpace: String?

    var body: some View {
        // A standalone link with its page's card is a block (the block gap round it), else the paragraph it is.
        let cards = blocks.map { block -> Bool in
            if case let .soleLink(href, words, _) = block { return linkCard(href, words) != nil }
            return false
        }
        let gaps = ProseMetrics.gaps(blocks, rhythm) { cards[$0] }
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { i, block in
                let view = BlockView(block: block, style: style, rhythm: rhythm, onOpenURL: onOpenURL, embed: embed, linkCard: linkCard)
                if anchors, case .heading = block {
                    // The anchor is a child of its own, laid out `margin` above the heading — a scroll
                    // lands on the identified view's frame, and one in a background takes its host's —
                    // with the heading's gap shortened by as much, so nothing moves.
                    let margin = StoryHeadingAnchor.margin
                    ZStack(alignment: .topLeading) {
                        view
                            .background {
                                if let headingSpace {
                                    GeometryReader { geo in
                                        Color.clear.preference(key: StoryHeadingTops.self,
                                                               value: [i: geo.frame(in: .named(headingSpace)).minY])
                                    }
                                }
                            }
                            .padding(.top, margin)
                        Color.clear.frame(width: 1, height: 1)
                            .id(StoryHeadingAnchor(index: i))
                            .accessibilityHidden(true)
                    }
                    .padding(.top, gaps[i] - margin)
                } else {
                    view.padding(.top, gaps[i])
                }
            }
        }
    }
}

struct BlockView<Embed: View, LinkCard: View>: View {
    let block: StoryBlock
    let style: ProseStyle
    let rhythm: ProseRhythm
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed?
    let linkCard: (String?, String) -> LinkCard?

    /// A picture or a card narrower than the column: centred in it, at the quote's edge inside a quote.
    private var blockAlignment: Alignment { style.inQuote ? .leading : .center }

    var body: some View {
        let em = rhythm.body
        switch block {
        case let .paragraph(runs):
            text(runs, style)
        case let .heading(level, runs):
            text(runs, style.heading(level: level))
                .accessibilityAddTraits(.isHeader)
        case .blank:
            Color.clear.frame(height: rhythm.blankLine * em).accessibilityHidden(true)
        case let .image(url, alt):
            StoryImageView(url: URL(string: url), alt: alt, seed: Double(seedFromString(url)), alignment: blockAlignment)
                .frame(maxWidth: .infinity, alignment: blockAlignment)
        // A card (≤ 520 wide) centred in the column, as a picture is (the web's embedBlock); one the
        // reader can't see is the link the story wrote, in the prose's own type (in the block's place).
        case let .cardEmbed(href, title):
            if let card = embed(href, title) {
                card.frame(maxWidth: .infinity, alignment: blockAlignment)
            } else {
                text([InlineRun(title, link: href)], style)
            }
        case let .soleLink(href, words, runs):
            if let card = linkCard(href, words) { card.frame(maxWidth: .infinity, alignment: blockAlignment) } else { text(runs, style) }
        case let .quote(children):
            // The pen's rail, a 1em gap, the quoted words muted and upright at the body's size.
            HStack(alignment: .top, spacing: em) {
                WavyRailShape(seed: 5)
                    .stroke(Tokens.terracottaLight, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
                    .frame(width: StoryTypography.quoteRail)
                    .frame(maxHeight: .infinity)
                    .accessibilityHidden(true)
                BlockStack(blocks: children, style: style.quoted, rhythm: rhythm, onOpenURL: onOpenURL, embed: embed, linkCard: linkCard)
            }
            .fixedSize(horizontal: false, vertical: true)
        case let .list(ordered, start, items):
            // `li { margin: 0.3em 0 }`: 0.3em between items, collapsing into the list's own margins at its ends.
            VStack(alignment: .leading, spacing: style.typography.itemGap * em) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    ListItemView(marker: ordered ? "\(start + i)." : "•", blocks: item, style: style, rhythm: rhythm, onOpenURL: onOpenURL,
                                 embed: embed, linkCard: linkCard)
                }
            }
        case .rule:
            WavyDivider(seed: 23)
        case let .code(code):
            CodeBlockView(code: code, typography: style.typography, size: em)
        case let .table(head, rows, alignments):
            StoryTableView(head: head, rows: rows, alignments: alignments, style: style, onOpenURL: onOpenURL)
        }
    }

    private func text(_ runs: [InlineRun], _ s: ProseStyle) -> some View {
        CSSTextView(s.attributed(runs), font: s.font, lineHeight: s.lineHeight, language: s.language, onOpenURL: onOpenURL)
    }
}

/// A list item: the marker in the muted ink, hanging in the list's 1.6em gutter and set against the
/// words as a CSS outside marker is; the content keeps its own blocks (tight lists hold a single
/// paragraph).
struct ListItemView<Embed: View, LinkCard: View>: View {
    let marker: String
    let blocks: [StoryBlock]
    let style: ProseStyle
    let rhythm: ProseRhythm
    let onOpenURL: (URL) -> Void
    let embed: (String, String) -> Embed?
    let linkCard: (String?, String) -> LinkCard?

    var body: some View {
        let em = rhythm.body
        let gutter = style.typography.listIndent * em
        // Blocks inside an item keep their spacing but not a trailing margin.
        ZStack(alignment: .topLeading) {
            // The marker sits on the first line's box, like a CSS list marker, a space before the words.
            CSSText(marker, font: style.font, lineHeight: style.lineHeight, color: Tokens.UI.textMuted, alignment: .right)
                .frame(width: gutter - Self.markerSpace * em)
                .accessibilityHidden(true)
            BlockStack(blocks: blocks, style: style, rhythm: rhythm, onOpenURL: onOpenURL, embed: embed, linkCard: linkCard)
                .padding(.leading, gutter)
        }
    }

    /// The space a CSS outside marker keeps before the words (its trailing space), in em.
    static var markerSpace: CGFloat { 0.3 }
}

/// A code block (`pre`): the story's code size in the system's monospace on the faint tint, on 1.6
/// lines of the body, never wrapped — it scrolls sideways (`overflow-x: auto`), start-aligned.
struct CodeBlockView: View {
    let code: String
    let typography: StoryTypography
    /// The body's size, grown with the text.
    let size: CGFloat

    var body: some View {
        let font = UIFont.monospacedSystemFont(ofSize: size * typography.codeScale, weight: .regular)
        let line = size * StoryTypography.codeBlockLeading
        ScrollView(.horizontal, showsIndicators: false) {
            Text(code)
                .font(Font(font))
                .lineSpacing(max(0, line - font.lineHeight))
                .padding(.vertical, max(0, line - font.lineHeight) / 2)
                .foregroundStyle(Tokens.text)
                .fixedSize()
                .padding(StoryTypography.codeBlockPadding)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.text.opacity(0.06), in: RoundedRectangle(cornerRadius: StoryTypography.codeBlockRadius))
    }
}

/// The blockquote's hand-drawn vertical rail (the web's vertical Divider):
/// trimmed 6pt at each end, one turn per 34pt of what is left.
nonisolated struct WavyRailShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        guard h > 0 else { return Path() }
        let inset = min(0.18 * h, 6)
        let length = h - inset * 2
        return wavyVertical(length, seed: seed, amp: 1.4, steps: max(2, Int((length / 34).rounded())))
            .path(offsetX: Double(rect.midX), offsetY: Double(rect.minY) + inset)
    }
}

/// OrganicStoryImage: a photo at its natural proportions (never taller than
/// 520pt or 62% of the window), centred (at a quote's edge inside one), in a hand-drawn clip. The photo is
/// zoomed past its box by the wobble's reach so the clip's outward swings
/// land on real pixels, as on the web.
struct StoryImageView: View {
    let url: URL?
    let alt: String
    let seed: Double
    var alignment: Alignment = .center
    @State private var aspect: CGFloat?
    /// The column it is laid out in, measured (an iPad window is neither the screen nor a phone).
    @State private var column: CGFloat?
    @Environment(\.window) private var window

    var body: some View {
        GeometryReader { geo in
            let maxH = min(520, window.height * 0.62)
            let a = aspect ?? 1.5
            let w = min(geo.size.width, maxH * a)
            let h = w / a
            let bleed = (min(w, h) * 0.025 + 6 + 4).rounded(.up)
            let setAspect = $aspect
            LazyImage(request: Self.request(url)) { state in
                if let image = state.image {
                    // A picture with transparency (a logo's black words) stands on a light paper in dark
                    // (--picture-backing; nothing in light).
                    image.resizable().scaledToFill().background(Tokens.pictureBacking)
                } else {
                    Tokens.creamDark
                }
            }
            .onCompletion { result in
                if case let .success(response) = result, response.image.size.height > 0 {
                    setAspect.wrappedValue = response.image.size.width / response.image.size.height
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipShape(StoryImageClip(seed: seed, bleed: bleed))
            .frame(width: w, height: h)
            .frame(maxWidth: .infinity, alignment: alignment)
            .accessibilityLabel(alt)
            .accessibilityAddTraits(.isImage)
        }
        .frame(height: height)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { column = $0 }
    }

    /// The longest side a story picture is decoded at, in pixels: wider than any column drawn at 3×.
    static let maxPixelSize: Float = 2400

    /// A story picture may come from any host and declare any size: decoded as a thumbnail (ImageIO,
    /// never the whole bitmap first), so a small file claiming tens of thousands of pixels a side
    /// can't take the reader's memory.
    static func request(_ url: URL?) -> ImageRequest? {
        guard let url else { return nil }
        var request = ImageRequest(url: url)
        request.thumbnail = ImageRequest.ThumbnailOptions(maxPixelSize: maxPixelSize)
        return request
    }

    /// The laid-out height for the reader's column (until measured, the window's minus the gutters).
    private var height: CGFloat {
        let maxH = min(520, window.height * 0.62)
        let a = aspect ?? 1.5
        let width = column ?? min(window.contentWidth - 40, Tokens.measure)
        return min(width, maxH * a) / a
    }
}

/// The story photo's clip: R 12, a gentler wobble than covers (mag 2.5%),
/// drawn for the photo's box inside the bled frame.
nonisolated struct StoryImageClip: Shape {
    let seed: Double
    let bleed: Double

    func path(in rect: CGRect) -> Path {
        let w = Double(rect.width) - bleed * 2, h = Double(rect.height) - bleed * 2
        guard w > 0, h > 0 else { return Path() }
        return wobRect(w, h, 12, seed: seed, mag: min(w, h) * 0.025, options: WobRectOptions(
            curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3)
        )).path(offsetX: Double(rect.minX) + bleed, offsetY: Double(rect.minY) + bleed)
    }
}
