import NukeUI
import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// MessageBubble's seedFromId: a Java-style string hash over UTF-16 units
/// (Int32 wrapping), folded into 1…9973. Bubbles start from 7; a shared
/// card's embed starts from 11. ("m1" → 183, "card-77" from 11 → 6326.)
public nonisolated func seedFromId(_ id: String, start: Int32 = 7) -> Double {
    var h = start
    for unit in id.utf16 { h = h &* 31 &+ Int32(unit) }
    return Double(abs(Int(h) % 9973) + 1)
}

/// A bubble's measures, the same on the web and Android: 15/1.4 words, 9 × 14 of air round them,
/// a full corner radius of 18 (a one-line bubble takes h·0.42 of it: nearly a pill) and 4 for a
/// corner tucked against its neighbour in a run.
public nonisolated enum BubbleMetrics {
    public static let textSize: CGFloat = 15
    public static let lineHeight: CGFloat = 1.4
    public static let padX: CGFloat = 14
    public static let padY: CGFloat = 9
    static let radius: Double = 18
    static let tucked: Double = 4
    /// The quoted message over a reply: one shape on its own, a little rounder-cornered than a bubble is tall.
    static let quoteRadius: Double = 16
    /// How far a reply's bubble lies over the foot of the message it quotes.
    public static let replyOverlap: CGFloat = 14
    /// How long a message is held before its menu comes (a part of it that leads somewhere gives
    /// the tap up a moment sooner, so the hold is the menu's and never also an open).
    public static let menuHold: TimeInterval = 0.4
}

/// MessageBubble's outline — the same recipe on the web and Android: its wobble follows its own
/// size — radius min(18, h·0.42), swing min(2.6, h·0.05), a turn per 80 across (2–6) and per 52
/// down (1–8), bow 1.3, corner jitter 1.6, corners pulled in 4%.
///
/// A bubble in a run of messages from one person (Messenger's stacking) tucks the corners that
/// face its neighbours to a radius of 4, on the sender's side — the right for your own, the left
/// for theirs: the first of a run tucks its bottom one (`tuckBottom`), a middle one both, the last
/// its top one (`tuckTop`). A bubble that carries a preview or a card is still one shape, and
/// tucks the same.
public nonisolated struct MessageBubbleShape: Shape {
    public let seed: Double
    public var mine: Bool
    public var tuckTop: Bool
    public var tuckBottom: Bool
    public var maxRadius: Double

    public init(seed: Double, mine: Bool = true, tuckTop: Bool = false, tuckBottom: Bool = false, maxRadius: Double = 18) {
        self.seed = seed
        self.mine = mine
        self.tuckTop = tuckTop
        self.tuckBottom = tuckBottom
        self.maxRadius = maxRadius
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        let across = min(6, max(2, jsRound(w / 80)))
        let down = min(8, max(1, jsRound(h / 52)))
        let radius = min(maxRadius, h * 0.42)
        let tucked = min(BubbleMetrics.tucked, radius)
        let top = tuckTop ? tucked : radius
        let bottom = tuckBottom ? tucked : radius
        let radii = mine
            ? CornerRadii(topLeft: radius, topRight: top, bottomRight: bottom, bottomLeft: radius)
            : CornerRadii(topLeft: top, topRight: radius, bottomRight: radius, bottomLeft: bottom)
        return WobRectShape(radius: radius, seed: seed, mag: min(2.6, h * 0.05), options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: min(w, h) * 0.04, segmentsH: .count(across), segmentsV: .count(down),
            cornerRadii: tuckTop || tuckBottom ? radii : nil
        )).path(in: rect)
    }
}

/// The bubble's stand-in while what it carries is read (a shared card): a plain rounded box of the
/// same footprint and corners — never a wobble drawn before its content is there.
private func plainBubbleShape(mine: Bool, tuckTop: Bool, tuckBottom: Bool) -> UnevenRoundedRectangle {
    let r = BubbleMetrics.radius, t = BubbleMetrics.tucked
    let top = tuckTop ? t : r, bottom = tuckBottom ? t : r
    return mine
        ? UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: r, bottomTrailingRadius: bottom, topTrailingRadius: top)
        : UnevenRoundedRectangle(topLeadingRadius: top, bottomLeadingRadius: bottom, bottomTrailingRadius: r, topTrailingRadius: r)
}

/// A bubble's paper: your own a warm terracotta wash, theirs a deeper paper than the page — both opaque.
public func bubbleFill(mine: Bool) -> Color { mine ? Tokens.bubbleMine : Tokens.bubbleTheirs }

/// The wash behind a search match: the hit being looked at stronger than the others in view.
public func highlightWash(strong: Bool) -> Color { Tokens.terracotta.opacity(strong ? 0.5 : 0.24) }

/// Where a link sits in a message's text (UTF-16 units) and where it goes.
public struct MessageLinkRange: Equatable, Sendable {
    public let range: NSRange
    public let url: URL

    public init(range: NSRange, url: URL) {
        self.range = range
        self.url = url
    }
}

// MARK: - Bubble

/// A message's bubble (MessageBubble.tsx): 15/1.4 words, padding 9 × 14, your own on
/// `bubbleMine`, theirs on `bubbleTheirs`, no outline (Messenger's flat bubbles, in the paper's own
/// colours). It hugs its words, unless it carries more (`attachment`: a link's preview, a shared
/// card, a picture), which makes it one bubble of a fixed `width` — the words, then what it carries
/// edge to edge (a picture leads instead, `attachmentFirst`, the words under it), clipped by the
/// bubble's own wobbly outline. A reply to a note wears a small italic header (`quoteLabel`).
///
/// The words are drawn by ``ChatText``: `links` are underlined, terracotta-deep in your own bubble
/// and terracotta in theirs, and a tap on one goes to `onLinkTap`; `highlights` are the matches of
/// a search, washed (stronger when `highlightStrong`: the hit being looked at); `flash` (0…1)
/// washes the whole bubble terracotta — the message a reply's quote jumped to. `plain` draws the
/// bubble's stand-in (a plain rounded box) while what it carries is still being read.
public struct MessageBubble<Attachment: View>: View {
    let text: String
    let mine: Bool
    let seed: Double
    let quoteLabel: String?
    let tuckTop: Bool
    let tuckBottom: Bool
    let links: [MessageLinkRange]
    let highlights: [NSRange]
    let highlightStrong: Bool
    let flash: Double
    let width: CGFloat?
    let plain: Bool
    let carries: Bool
    let attachmentFirst: Bool
    let onLinkTap: ((URL) -> Void)?
    let attachment: Attachment

    /// `carries` says whether `attachment` draws anything (it is decided while drawing, so the type can't tell).
    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil, tuckTop: Bool = false, tuckBottom: Bool = false,
                links: [MessageLinkRange] = [], highlights: [NSRange] = [], highlightStrong: Bool = false, flash: Double = 0,
                width: CGFloat? = nil, plain: Bool = false, carries: Bool = true, attachmentFirst: Bool = false,
                onLinkTap: ((URL) -> Void)? = nil, @ViewBuilder attachment: () -> Attachment) {
        self.text = text
        self.mine = mine
        self.seed = seed
        self.quoteLabel = quoteLabel
        self.tuckTop = tuckTop
        self.tuckBottom = tuckBottom
        self.links = links
        self.highlights = highlights
        self.highlightStrong = highlightStrong
        self.flash = flash
        self.width = width
        self.plain = plain
        self.carries = carries && Attachment.self != EmptyView.self
        self.attachmentFirst = attachmentFirst
        self.onLinkTap = onLinkTap
        self.attachment = attachment()
    }

    public var body: some View {
        let shape = plain
            ? AnyShape(plainBubbleShape(mine: mine, tuckTop: tuckTop, tuckBottom: tuckBottom))
            : AnyShape(MessageBubbleShape(seed: seed, mine: mine, tuckTop: tuckTop, tuckBottom: tuckBottom))
        VStack(alignment: .leading, spacing: 0) {
            if attachmentFirst { attachment }
            if !text.isEmpty || quoteLabel != nil {
                VStack(alignment: .leading, spacing: 4) {
                    if let quoteLabel {
                        HStack(spacing: 5) {
                            OrganicIcon(.note, size: 13, color: Tokens.textMuted)
                            // Slanted in a Latin script only: Chinese has no italic (review S6).
                            Text(quoteLabel).font(AppFonts.body(12, oblique: Slant.takes(quoteLabel))).foregroundStyle(Tokens.textMuted)
                        }
                    }
                    if !text.isEmpty {
                        ChatText(text, links: links,
                                 // The tonal ink clears 4.5:1 on both bubbles (plain terracotta is 3.45:1); the
                                 // story's pen wave under it says it is a link (design §5).
                                 linkColor: Tokens.buttonOnTonal,
                                 highlights: highlights, highlightColor: highlightWash(strong: highlightStrong),
                                 onLinkTap: onLinkTap)
                    }
                }
                .padding(.horizontal, BubbleMetrics.padX)
                .padding(.top, BubbleMetrics.padY)
                // What it carries under the words brings its own air above it.
                .padding(.bottom, carries && !attachmentFirst ? 0 : BubbleMetrics.padY)
                .frame(maxWidth: width == nil ? nil : .infinity, alignment: .leading)
            }
            if !attachmentFirst { attachment }
        }
        .frame(width: width, alignment: .leading)
        .background {
            shape.fill(bubbleFill(mine: mine))
            shape.fill(Tokens.terracotta.opacity(0.3)).opacity(flash)
        }
        .clipShape(shape)
        .contentShape(shape)
    }
}

extension MessageBubble where Attachment == EmptyView {
    public init(text: String, mine: Bool, seed: Double, quoteLabel: String? = nil, tuckTop: Bool = false, tuckBottom: Bool = false,
                links: [MessageLinkRange] = [], highlights: [NSRange] = [], highlightStrong: Bool = false, flash: Double = 0,
                onLinkTap: ((URL) -> Void)? = nil) {
        self.init(text: text, mine: mine, seed: seed, quoteLabel: quoteLabel, tuckTop: tuckTop, tuckBottom: tuckBottom, links: links,
                  highlights: highlights, highlightStrong: highlightStrong, flash: flash, onLinkTap: onLinkTap) { EmptyView() }
    }
}

// MARK: - Replies

/// The message a reply answers, quoted over the reply (Messenger's): a muted bubble of its own on
/// `bubbleQuote`, no outline, 13.5 words in two lines at most, hugging them. Its foot is
/// `BubbleMetrics.replyOverlap` deeper than its words need: the reply's bubble lies over it there.
public struct QuoteBubble: View {
    let text: String
    let seed: Double
    /// Before the words: a quoted sticker's key pose (round 22).
    let lead: AnyView?
    /// Room at its foot for the reply's bubble to lie over; none when the reply is a sticker (round 22 v2: nothing
    /// lies over it, so its content sits centred, as much paper under it as over it).
    let reservesFoot: Bool
    let onTap: (() -> Void)?

    public init(text: String, seed: Double, lead: AnyView? = nil, reservesFoot: Bool = true, onTap: (() -> Void)? = nil) {
        self.text = text
        self.seed = seed
        self.lead = lead
        self.reservesFoot = reservesFoot
        self.onTap = onTap
    }

    public var body: some View {
        let shape = MessageBubbleShape(seed: seed, maxRadius: BubbleMetrics.quoteRadius)
        HStack(spacing: 6) {
            if let lead { lead }
            // A quoted sticker is its key pose alone (round 22 v2): no words beside it.
            if !text.isEmpty { ChatText(text, size: 13.5, color: Tokens.textMuted, maxLines: 2) }
        }
            .padding(.horizontal, 13)
            .padding(.top, 8)
            .padding(.bottom, 8 + (reservesFoot ? BubbleMetrics.replyOverlap : 0))
            .background { shape.fill(Tokens.bubbleQuote) }
            .contentShape(shape)
            .modifier(BubblePartAction(action: onTap, trait: .isButton))
            // The press's wash keeps to the quote's own outline.
            .clipShape(shape)
    }
}

/// Who answered whom over a reply's quote — or, over a note, that it answers the card: plain in a
/// one-to-one thread, so never shown, only read out by VoiceOver before the quote (the web's
/// `.quoteSpoken`). It takes no room: a point of clear text, laid over the line's top.
public struct SpokenCaption: View {
    let text: String

    public init(_ text: String) {
        self.text = text
    }

    public var body: some View {
        Text(text)
            .font(AppFonts.body(1))
            .foregroundStyle(.clear)
            .frame(width: 1, height: 1)
            .clipped()
            .padding(.bottom, -1)
            .accessibilityLabel(text)
            .accessibilityAddTraits(.isStaticText)
    }
}

/// The card a note was left on, over the note's words: Messenger's quote holding a shared card —
/// ``SharedCardSection`` (or its skeleton, `plain`, while the card is read) on `bubbleQuote` at
/// `width`, no outline, its foot `BubbleMetrics.replyOverlap` deeper than the card: the note's
/// bubble lies over it there, as a reply lies over what it quotes. The card inside is what a tap
/// opens; a hold is the message's menu.
public struct CardQuote<Card: View>: View {
    let seed: Double
    let width: CGFloat
    let plain: Bool
    let card: Card

    public init(seed: Double, width: CGFloat, plain: Bool = false, @ViewBuilder card: () -> Card) {
        self.seed = seed
        self.width = width
        self.plain = plain
        self.card = card()
    }

    public var body: some View {
        // A stand-in is never a wobble drawn before its content is there.
        let shape = plain
            ? AnyShape(RoundedRectangle(cornerRadius: BubbleMetrics.quoteRadius, style: .continuous))
            : AnyShape(MessageBubbleShape(seed: seed, maxRadius: BubbleMetrics.quoteRadius))
        VStack(spacing: 0) {
            card
            Color.clear.frame(height: BubbleMetrics.replyOverlap)
        }
        .frame(width: width)
        .background { shape.fill(Tokens.bubbleQuote) }
        .clipShape(shape)
        .contentShape(shape)
    }
}

// MARK: - What a bubble carries

/// How much wider than the bubble a picture inside it is drawn on each side: past its wobbly
/// edge's widest swing, so the clip, not the picture, ends it.
private let pictureBleed: CGFloat = 4

/// A picture sent in a message, edge to edge across the top of its bubble (round 7 §4.3): at its
/// shown `size` (its shape fixed before the picture arrives), reaching past the bubble's sides and
/// top — and its foot, when no words follow it (`endsBubble`) — so the bubble's wobbly outline ends
/// it, never the picture's own edge. `content` is what lies in it — the picture cover-cropped, or its
/// stand-in while it is read. A tap opens it (`onOpen`); a hold is the message's menu.
public struct MessagePictureSection<Content: View>: View {
    let size: CGSize
    let endsBubble: Bool
    let label: String
    let onOpen: (() -> Void)?
    let content: Content

    public init(size: CGSize, endsBubble: Bool, label: String, onOpen: (() -> Void)?, @ViewBuilder content: () -> Content) {
        self.size = size
        self.endsBubble = endsBubble
        self.label = label
        self.onOpen = onOpen
        self.content = content()
    }

    public var body: some View {
        let below = endsBubble ? pictureBleed : 0
        content
            .frame(width: size.width + 2 * pictureBleed, height: size.height + pictureBleed + below)
            .clipped()
            .padding(.horizontal, -pictureBleed)
            .padding(.top, -pictureBleed)
            .padding(.bottom, -below)
            .contentShape(Rectangle())
            .modifier(BubblePartAction(action: onOpen, trait: .isButton))
            .accessibilityLabel(label)
    }
}

/// A picture edge to edge across a bubble at 1.91:1 (the share-image ratio); `onError` when it won't load.
private struct BubblePicture: View {
    let url: URL
    let onError: () -> Void

    var body: some View {
        Color.clear
            .aspectRatio(1.91, contentMode: .fit)
            .background(Tokens.text.opacity(0.06))
            .overlay {
                LazyImage(url: url) { state in
                    if let image = state.image {
                        image.resizable().scaledToFill()
                    } else if state.error != nil {
                        Color.clear.onAppear(perform: onError)
                    }
                }
            }
            .clipped()
            // Wider than the bubble: its wobbly outline cuts it, not the picture's own edge.
            .padding(.horizontal, -pictureBleed)
            .accessibilityHidden(true)
    }
}

/// A part of a bubble that leads somewhere — a link's page, a shared card, the quote over a reply.
/// A tap opens it; a press held is the whole message's (its menu), and a finger that moves is the
/// thread's (its scroll, a swipe to reply). A SwiftUI Button here would keep the message's own
/// press from ever starting, so the tap is a UIKit recognizer like that press, and gives up just
/// before the hold would bring the menu. Under the finger, a light wash over the part, which the
/// bubble's own outline cuts. Assistive tech activates it like a link (or a button: `trait`).
private struct BubblePartAction: ViewModifier {
    let action: (() -> Void)?
    var trait: AccessibilityTraits = .isLink
    /// The light wash under the finger (a sticker, which has no bubble to cut it, takes none).
    var washes = true
    @State private var pressed = false

    func body(content: Content) -> some View {
        if let action {
            content
                .overlay { Tokens.terracotta.opacity(pressed && washes ? 0.1 : 0).allowsHitTesting(false) }
                .animation(.easeOut(duration: pressed ? 0.08 : 0.22), value: pressed)
                .gesture(PartTap(onPress: { pressed = $0 }, onTap: action))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(trait)
                .accessibilityAction(.default, action)
        } else {
            content
        }
    }
}

extension View {
    /// A part of a message a tap opens without taking the message's own hold or the thread's scroll (round 22:
    /// an album's picture, a sticker's replay) — ``BubblePartAction``.
    public func messagePartTap(_ action: (() -> Void)?, trait: AccessibilityTraits = .isButton, washes: Bool = true) -> some View {
        modifier(BubblePartAction(action: action, trait: trait, washes: washes))
    }
}

private struct PartTap: UIGestureRecognizerRepresentable {
    let onPress: (Bool) -> Void
    let onTap: () -> Void

    func makeUIGestureRecognizer(context: Context) -> PartTapRecognizer {
        PartTapRecognizer()
    }

    func updateUIGestureRecognizer(_ recognizer: PartTapRecognizer, context: Context) {
        recognizer.onPress = onPress
    }

    func handleUIGestureRecognizerAction(_ recognizer: PartTapRecognizer, context: Context) {
        if recognizer.state == .ended { onTap() }
    }
}

/// One finger down and up again where it went down, sooner than a hold. The wash shows only once
/// the finger has stayed a moment (one that is starting a scroll never flashes it).
public final class PartTapRecognizer: UIGestureRecognizer {
    var onPress: ((Bool) -> Void)?
    private var start: CGPoint = .zero
    /// Each touch's timers know whether they are still the current touch's.
    private var touch = 0
    private var down = false {
        didSet { if down != oldValue { onPress?(down) } }
    }
    private let slop: CGFloat = 10

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard touches.count == 1, (event.allTouches?.count ?? 1) == 1, let first = touches.first else { return fail() }
        start = first.location(in: nil)
        touch += 1
        let current = touch
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(90))
            guard let self, self.touch == current, self.state == .possible else { return }
            self.down = true
            try? await Task.sleep(for: .seconds(BubbleMetrics.menuHold - 0.05 - 0.09))
            // Held: the message's menu is coming, not this.
            if self.touch == current { self.fail() }
        }
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard let first = touches.first else { return }
        let p = first.location(in: nil)
        if hypot(p.x - start.x, p.y - start.y) > slop { fail() }
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        down = false
        state = state == .possible ? .ended : .failed
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        fail()
    }

    public override func reset() {
        super.reset()
        touch += 1
        down = false
    }

    private func fail() {
        down = false
        if state == .possible { state = .failed }
    }
}

/// A link's unfurled page inside its message's bubble (Messenger's): after the words, the page's
/// picture edge to edge at 1.91:1 — when it has one and it loads; one that won't takes its section
/// with it — then the title (14.5 semibold, two lines), a description (12.5, two) and the host
/// with the link glyph. `host` is the ASCII host the tap leads to, as the confirm would name it.
/// `afterWords`: the message's words are above it (the picture keeps a step from them; without
/// them it starts at the bubble's top edge). A tap opens the link; a hold is the message's menu.
public struct LinkPreviewSection: View {
    let title: String
    let description: String?
    let host: String
    let imageURL: URL?
    let afterWords: Bool
    let onOpen: (() -> Void)?
    @State private var pictureFailed = false

    public init(title: String, description: String?, host: String, imageURL: URL?, afterWords: Bool, onOpen: (() -> Void)?) {
        self.title = title
        self.description = description
        self.host = host
        self.imageURL = imageURL
        self.afterWords = afterWords
        self.onOpen = onOpen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let imageURL, !pictureFailed {
                if afterWords { Color.clear.frame(height: BubbleMetrics.padY) }
                BubblePicture(url: imageURL) { pictureFailed = true }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(AppFonts.body(14.5, weight: .semibold)).foregroundStyle(Tokens.text)
                    .lineLimit(2).multilineTextAlignment(.leading)
                if let description, !description.isEmpty {
                    Text(description)
                        .font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted)
                        .lineLimit(2).multilineTextAlignment(.leading)
                }
                HStack(spacing: 5) {
                    OrganicIcon(.link, size: 12, color: Tokens.textMuted)
                    Text(host).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                .padding(.top, 3)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        .modifier(BubblePartAction(action: onOpen))
    }
}

/// Who wrote a shared card: their face and pen name — or, for a card posted anonymously, the mark
/// the card page shows (a dot on paper) beside the anonymous name, never the author.
public struct CardByline: Equatable {
    public let name: String
    public let initials: String
    public let imageURL: URL?
    public let color: Color
    public let avatarSeed: Double
    public let isAnonymous: Bool

    public init(name: String, initials: String, imageURL: URL?, color: Color, avatarSeed: Double, isAnonymous: Bool = false) {
        self.name = name
        self.initials = initials
        self.imageURL = imageURL
        self.color = color
        self.avatarSeed = avatarSeed
        self.isAnonymous = isAnonymous
    }

    public static func anonymous(_ name: String) -> CardByline {
        CardByline(name: name, initials: "·", imageURL: nil, color: Tokens.avatarWait, avatarSeed: 97, isAnonymous: true)
    }
}

/// A Resonance card shared in a message, inside its bubble — Messenger's shared post, so it reads
/// at a glance as a card of this site and what it is about: the author (avatar 32, pen name, and
/// `source` · the read time under it), the cover edge to edge at 1.91:1 (or, without one, a band of
/// the card's own colour with the wave mark), the title in the heading face (16 bold, three lines),
/// the excerpt (two) and a source line — the wave and `source`, like the "Facebook" under a shared
/// post. A tap opens the card; a hold is the message's menu.
public struct SharedCardSection: View {
    let byline: CardByline
    let readTime: String
    let title: String
    let excerpt: String?
    let imageURL: URL?
    let accentHue: Double?
    let source: String
    let onOpen: (() -> Void)?
    @State private var coverFailed = false

    public init(byline: CardByline, readTime: String, title: String, excerpt: String?, imageURL: URL?, accentHue: Double?,
                source: String, onOpen: (() -> Void)?) {
        self.byline = byline
        self.readTime = readTime
        self.title = title
        self.excerpt = excerpt
        self.imageURL = imageURL
        self.accentHue = accentHue
        self.source = source
        self.onOpen = onOpen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                HandDrawnAvatar(initials: byline.initials, imageURL: byline.imageURL, color: byline.color, size: 32, seed: byline.avatarSeed)
                VStack(alignment: .leading, spacing: 1) {
                    Text(byline.name)
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(byline.isAnonymous ? Tokens.textMuted : Tokens.text)
                        .lineLimit(1)
                    Text("\(source) · \(readTime)")
                        .font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            if let imageURL, !coverFailed {
                BubblePicture(url: imageURL) { coverFailed = true }
            } else {
                let palette = CardPalette(accentHue: accentHue, position: 0)
                ZStack {
                    palette.fill
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: 0.08, tile: "grain-overlay")
                    OrganicIcon(.wave, size: 40, color: palette.border.opacity(0.32))
                }
                .frame(height: 96)
                .padding(.horizontal, -pictureBleed)
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(AppFonts.heading(16, weight: .bold)).foregroundStyle(Tokens.text)
                    .lineLimit(3).multilineTextAlignment(.leading)
                if let excerpt, !excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(excerpt)
                        .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                        .lineLimit(2).multilineTextAlignment(.leading)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            HStack(spacing: 6) {
                OrganicIcon(.wave, size: 14, color: Tokens.terracotta)
                Text(source).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .modifier(BubblePartAction(action: onOpen))
    }
}

/// ``SharedCardSection`` while the card is read: its footprint in plain shimmering blocks (no
/// wobble, nothing measured).
public struct SharedCardSkeleton: View {
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                SkeletonBlock(height: 32, circle: true)
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 88, height: 12)
                    SkeletonBlock(width: 64, height: 10)
                }
            }
            .padding(12)
            Tokens.text.opacity(0.06).aspectRatio(1.91, contentMode: .fit)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBlock(fraction: 0.85, height: 15)
                SkeletonBlock(fraction: 0.6, height: 15)
                SkeletonBlock(fraction: 0.9, height: 11)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            SkeletonBlock(width: 56, height: 11)
                .padding(.leading, 12).padding(.top, 12).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel("Loading")
    }
}

// MARK: - Composer

/// The chat composer's measures (round 9 §4, round 10 §3), the same on the web and Android: one
/// floating capsule exactly 48 tall for a line of text at any text size, ＋ (44 wide) at its start,
/// Send as its 52-wide end segment; 14 from the screen's sides, 8 over the bottom safe area (or the
/// keyboard), at most 720 wide; what rides with the message in rows 6 above it. Behind them the foot's
/// paper (``ComposerBacking``) across the whole pane, its top `fade` (12) a fade into it — never a halo,
/// never a shadow.
public nonisolated enum ComposerMetrics {
    /// The capsule with one line in it, whatever the text size (only more lines make it taller).
    public static let height: CGFloat = 48
    /// ＋'s room at the capsule's start (its glyph 22).
    public static let attachWidth: CGFloat = 44
    public static let attachGlyph: CGFloat = 22
    /// The send segment, the capsule's end.
    public static let sendWidth: CGFloat = 52
    public static let sendGlyph: CGFloat = 20
    /// The foot's paper fades in over its top 12 (round 11 §3: just enough to see it is a fade), from the
    /// top edge of what the foot shows first: over the capsule's top 12 when nothing rides with the
    /// message; from the top of `rideFadeRoom` over the topmost riding row when something does.
    public static let fade: CGFloat = 12
    /// What the foot gains over its riding rows (the owner's notes 2026-10-31): the whole fade, then
    /// `slipGap` of solid paper — so the paper over the rows' first ink (a picture, a card's tile, the
    /// reply's rule, a label) is as deep as under their last ink down to the capsule.
    public static let rideFadeRoom: CGFloat = fade + slipGap
    /// The capsule over the bottom safe area or the keyboard.
    public static let bottomGap: CGFloat = 8
    /// The last row (or a notice) over the capsule.
    public static let slipGap: CGFloat = 6
    /// A riding row: at least 52 tall, 4 over and under its content, which starts 12 in from the
    /// capsule's start edge; 10 from its lead to its words; a 40 × 40 picture or tile, a tile's glyph 18.
    public static let rowMinHeight: CGFloat = 52
    public static let rowPadY: CGFloat = 4
    public static let rowStart: CGFloat = 12
    public static let rowLeadGap: CGFloat = 10
    public static let rowThumb: CGFloat = 40
    public static let rowGlyph: CGFloat = 18
    /// The screen's sides (the page gutter) and the widest the capsule is.
    public static let gutter: CGFloat = 14
    public static let maxWidth: CGFloat = 720
    /// The text's size (× the interface scale) and its most lines before it scrolls.
    public static let textSize: CGFloat = 16
    public static let maxLines = 5
    /// The air from the capsule's (or the slip's) top to the newest message, the jump pill and 已複製
    /// (the web's --dock-clear; 12 sat the newest message on the capsule).
    public static let clearance: CGFloat = 20
    /// The capsule's corner (the field's) and the slip's.
    public static let radius: CGFloat = Tokens.radiusMd
    public static let slipRadius: CGFloat = 14
    /// The text's room after its words, before the send segment's seam.
    public static let textTrailing: CGFloat = 10
    /// Round 22: the capsule's tools are one button (v3, the owner's call): ☺ / ⌨ before the send segment the very
    /// size, glyph and press of ＋ at its start, and ⤢ / ⤡ — the same 44 square, a ghost — centred in the send column
    /// at the capsule's top-right, `cornerInset` under its pen line (room above it as the send block has under its glyph).
    public static let stickerWidth: CGFloat = attachWidth
    public static let stickerGlyph: CGFloat = attachGlyph
    public static let cornerGlyph: CGFloat = 18
    public static let cornerSide: CGFloat = attachWidth
    public static let cornerInset: CGFloat = 4
    /// ⤢ shows once the text runs to this many lines.
    public static let expandAtLines = 3
    /// Grown over the thread on an iPad or the Mac: at most this share of the thread pane.
    public static let expandedPaneShare: CGFloat = 0.6

    /// The text's padding above and below so a line `lineHeight` tall sits centred in the 48 —
    /// computed from the line the text really draws at its size, so the capsule never grows from the
    /// font (Telegram's composer, the owner's example), only from more lines.
    public static func textPadding(lineHeight: CGFloat) -> CGFloat {
        max(0, (height - lineHeight) / 2)
    }

    /// The capsule's pen (round 10 §3.3): the field's border at rest, its darker hover pen while it is
    /// written in — darker, never another colour (it was terracotta).
    public static func pen(focused: Bool) -> Color { focused ? Tokens.fieldBorderHover : Tokens.fieldBorder }

    /// How much the foot adds over what it holds: `rideFadeRoom` when rows ride over the capsule (the fade,
    /// then 6 of solid paper over the first row); nothing otherwise (it lies over the capsule's top 12).
    public static func fadeRoom(riding: Bool) -> CGFloat { riding ? rideFadeRoom : 0 }

    /// ＋'s ink: muted at rest, the text ink while its menu is open (the web's bare trigger, `data-open`).
    public static func attachInk(open: Bool) -> Color { open ? Tokens.text : Tokens.textMuted }

    /// The send segment's seam: SegmentedActionBar's seed for the seam after the text.
    static func seamSeed(_ seed: Double) -> Double { seed + 11 }
}

/// The composer's capsule (round 9 §4, round 10 §3): one hand-drawn field shape — the field's wobble,
/// the cream paper, its pen at INK in the field's border, darker (the field's hover pen) while it is
/// being written in, never a halo. Inside, ＋ as a ghost at its start, the text (`field`, no border of
/// its own), and Send as its end segment: a wavy seam cut across the capsule in the paper's colour (the
/// segmented bar's language), the segment's face the tonal peach with a terracotta plane at rest and
/// the solid terracotta with a cream plane once there is something to send (a 140 ms change). Send
/// is disabled by its semantics, never faded. ＋ and the plane sit on the last line's row: a field grown
/// to more lines keeps them at its foot.
public struct ComposerCapsule<Field: View>: View {
    let focused: Bool
    let canSend: Bool
    /// ＋'s menu (圖片 · 卡片) is open: ＋ wears the web's open bare trigger — the text ink on a soft wobbly
    /// disc of it (round 17 review A10).
    var attachOpen: Bool = false
    let seed: Double
    let attachLabel: String
    let sendLabel: String
    let onAttach: (CGRect) -> Void
    let onSend: () -> Void
    /// Round 22: the ☺ before the send segment (⌨ while the sticker panel is open; none while there are words to
    /// send: the field takes its room), and the ⤢ / ⤡ straight over the send block.
    var stickers: ComposerSideButton?
    var corner: ComposerSideButton?
    /// The send segment's face: Send, or the sticker panel's ↑ / ↓ (with `faceLabel`, `onFace`).
    var sendFace: ComposerSendFace = .send
    var faceLabel: String?
    var onFace: (() -> Void)?
    /// More than one line (or grown over the thread, option C): the send segment is a 52 × 48 block on the last
    /// row, its top-left corner rounded, with the column over it free for ⤢ / ⤡ — no longer the full-height strip.
    var block = false
    @ViewBuilder let field: Field
    @State private var attachFrame: CGRect = .zero
    @State private var sendPressed = false

    public init(focused: Bool, canSend: Bool, attachOpen: Bool = false, seed: Double = 17, attachLabel: String, sendLabel: String,
                stickers: ComposerSideButton? = nil, corner: ComposerSideButton? = nil, sendFace: ComposerSendFace = .send,
                faceLabel: String? = nil, onFace: (() -> Void)? = nil, block: Bool = false,
                onAttach: @escaping (CGRect) -> Void, onSend: @escaping () -> Void, @ViewBuilder field: () -> Field) {
        self.focused = focused
        self.canSend = canSend
        self.attachOpen = attachOpen
        self.seed = seed
        self.attachLabel = attachLabel
        self.sendLabel = sendLabel
        self.stickers = stickers
        self.corner = corner
        self.sendFace = sendFace
        self.faceLabel = faceLabel
        self.onFace = onFace
        self.block = block
        self.onAttach = onAttach
        self.onSend = onSend
        self.field = field()
    }

    /// The segment acts: Send sends, ↑ / ↓ grow or shrink the sticker panel.
    private var segmentEnabled: Bool { sendFace == .send ? canSend : onFace != nil }

    public var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            Button { onAttach(attachFrame) } label: {
                OrganicIcon(.plus, size: ComposerMetrics.attachGlyph, color: ComposerMetrics.attachInk(open: attachOpen),
                            strokeWidth: Tokens.ink)
                    .animation(BareTriggerDisc.change, value: attachOpen)
                    .geometryGroup()
                    .frame(width: ComposerMetrics.attachWidth, height: ComposerMetrics.height)
                    .background { BareTriggerDisc(open: attachOpen, seed: seed + 3) }
                    .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle(inset: 2))
            .accessibilityLabel(attachLabel)
            .accessibilityAddTraits(attachOpen ? .isSelected : [])
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { attachFrame = $0 }
            field
                .frame(maxWidth: .infinity, minHeight: ComposerMetrics.height, alignment: .leading)
                .padding(.trailing, stickers == nil ? ComposerMetrics.textTrailing : 0)
            if let stickers {
                // The ☺ on the last line's row, only while there is nothing written (round 22 v2).
                sideButton(stickers, width: ComposerMetrics.stickerWidth) {
                    OrganicIcon(stickers.on ? .keyboard : .smile, size: ComposerMetrics.stickerGlyph, color: Tokens.textMuted,
                                strokeWidth: Tokens.ink)
                }
                .frame(height: ComposerMetrics.height)
                .transition(.opacity)
            }
            // The send column: the block on the last row and, over it, ⤢ / ⤡ (round 22 v2) — or, one line, the segment.
            VStack(spacing: 0) {
                if block {
                    // ⤢ / ⤡ in the send column, at the capsule's top-right — where a full-screen control is looked for
                    // and easy to reach — the block at its foot (the owner's call, round 22 v2).
                    if let corner {
                        sideButton(corner, width: ComposerMetrics.cornerSide) {
                            OrganicIcon(corner.on ? .collapse : .expand, size: ComposerMetrics.cornerGlyph, color: Tokens.textMuted,
                                        strokeWidth: Tokens.ink)
                        }
                        .frame(width: ComposerMetrics.cornerSide, height: ComposerMetrics.cornerSide)
                        .padding(.top, ComposerMetrics.cornerInset)
                        .transition(.opacity)
                    }
                    Spacer(minLength: 0)
                }
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if sendFace == .send { onSend() } else { onFace?() }
                } label: {
                    segmentGlyph
                        // Its ink changes in 140 ms; where it sits follows the capsule at once (a sent message's
                        // lines going flip `canSend` in the same update: the plane never glides down to the row).
                        // Send, ↑ and ↓ are one glyph's faces, never swapped views: growing the panel, the glyph rides
                        // up with the capsule in the capsule's own animation (round 22 v3) instead of landing first.
                        .animation(ComposerCapsuleFace.faceChange, value: canSend)
                        .geometryGroup()
                        .frame(width: ComposerMetrics.sendWidth, height: ComposerMetrics.height)
                        .frame(maxHeight: block ? nil : .infinity, alignment: .bottom)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressReport(pressed: $sendPressed))
                .disabled(!segmentEnabled)
                .accessibilityLabel(sendFace == .send ? sendLabel : faceLabel ?? sendLabel)
            }
            .frame(width: ComposerMetrics.sendWidth)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .frame(minHeight: ComposerMetrics.height)
        // As tall as its text asks (and the segment with it) — never the height it is offered.
        .fixedSize(horizontal: false, vertical: true)
        .background {
            ComposerCapsuleFace(seed: seed, focused: focused, canSend: canSend && sendFace == .send, pressed: sendPressed,
                                block: block)
        }
    }

    /// The plane — or the sticker panel's ↑ / ↓ (round 22 §4.1): both always there, one showing, the arrow turned for
    /// ↓; only their opacity and turn change, in a scoped animation that leaves where they sit to the capsule.
    private var segmentGlyph: some View {
        ZStack {
            OrganicIcon(.send, size: ComposerMetrics.sendGlyph, color: canSend ? Tokens.cream : Tokens.terracotta, strokeWidth: Tokens.ink)
                .animation(ComposerCapsuleFace.faceChange) { $0.opacity(sendFace == .send ? 1 : 0) }
            OrganicIcon(.arrowUp, size: ComposerMetrics.sendGlyph, color: Tokens.terracotta, strokeWidth: Tokens.ink)
                .animation(ComposerCapsuleFace.faceChange) {
                    $0.rotationEffect(.degrees(sendFace == .collapse ? 180 : 0)).opacity(sendFace == .send ? 0 : 1)
                }
        }
    }

    /// A ghost control in the capsule (☺ / ⌨, ⤢ / ⤡): the glyph alone, `width` wide.
    private func sideButton(_ spec: ComposerSideButton, width: CGFloat, pressInset: CGFloat = 2,
                            @ViewBuilder glyph: () -> some View) -> some View {
        Button(action: spec.action) {
            glyph()
                .frame(width: width)
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: pressInset))
        .accessibilityLabel(spec.label)
    }
}

/// The send segment's face (round 22 §4.1): Send — or, the sticker panel open with nothing to send, ↑ to grow
/// the panel to under the header and ↓ to bring it back.
public enum ComposerSendFace: Equatable, Sendable {
    case send, expand, collapse
}

/// A ghost button in the capsule's side column (round 22): ☺ / ⌨ (`on`: the sticker panel is open), or
/// ⤢ / ⤡ (`on`: the field is grown).
public struct ComposerSideButton {
    public let on: Bool
    public let label: String
    public let action: () -> Void

    public init(on: Bool, label: String, action: @escaping () -> Void) {
        self.on = on
        self.label = label
        self.action = action
    }
}

/// A sheet of the menus' paper (the web's PaperSheet, round 18): the theme's menu paper inside one hand-drawn
/// pen line at INK in the header's grey — no grain, no shadow. Behind the sticker preview and the Mac's popovers.
public struct PaperSheet: View {
    var seed: Double

    public init(seed: Double = 41) {
        self.seed = seed
    }

    public var body: some View {
        let shape = MenuSheetShape(seed: seed)
        ZStack {
            shape.fill(MenuSheetColors.paper(hue: nil))
            shape.stroke(MenuSheetColors.pen(hue: nil), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

/// The web's bare menu trigger while its menu is open (OrganicMenu `.bare[data-open] .wash`): a wobbly disc
/// of the text ink at 8 %, 92 % of the trigger's width (its 46 in a 100 box), growing from 0.4 as it fades in
/// (160 ms). Laid behind the composer's ＋ while 圖片 · 卡片 is open (round 17 review A10).
public struct BareTriggerDisc: View {
    let open: Bool
    var seed: Double

    public init(open: Bool, seed: Double = 17) {
        self.open = open
        self.seed = seed
    }

    /// The web's `transform 160ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 160ms ease`.
    public static let change = Animation.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.16)
    public static let ink: Double = 0.08
    public static let reach: CGFloat = 0.92

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) * Self.reach
            WobCircleShape(seed: seed, options: WobCircleOptions(segments: 8, mag: Double(side) / 2 * 2.2 / 46, cpJitter: 0.4))
                .fill(Tokens.text.opacity(Self.ink))
                .frame(width: side, height: side)
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
                .animation(Self.change) { $0.scaleEffect(open ? 1 : 0.4).opacity(open ? 1 : 0) }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The capsule's own shape: the field's wobble (FieldSurface's), radius 16.
public nonisolated struct ComposerCapsuleShape: Shape {
    public var seed: Double

    public init(seed: Double) {
        self.seed = seed
    }

    public func path(in rect: CGRect) -> Path {
        WobRectShape(radius: ComposerMetrics.radius, seed: seed).path(in: rect)
    }
}

/// The capsule drawn: the paper, the send segment's face, its seam, the grain over the segment, and
/// the pen line over all. `segmentWidth` is the end segment's (the composer's Send, 52; the writer's tag
/// field its two faces' wider, round 16 §1).
struct ComposerCapsuleFace: View {
    let seed: Double
    let focused: Bool
    let canSend: Bool
    let pressed: Bool
    var segmentWidth: CGFloat = ComposerMetrics.sendWidth
    /// Grown over the thread (round 22 §4.3): the segment a block on the last row, its seam on its top and left.
    var block = false

    var body: some View {
        let shape = ComposerCapsuleShape(seed: seed)
        let segment = ComposerSendSegment(seed: seed, width: segmentWidth, block: block)
        ZStack {
            shape.fill(Tokens.cream)
            ZStack {
                // The faces change by their colour alone (round 17 review A2): each animation is scoped to the
                // opacity it fades, never to a frame. Once it covered the whole segment, and committing a tag —
                // which flips `canSend` in the same update that moves the field under the new pills — slid the
                // segment in from where the field had been while the field itself stood still.
                segment.fill(Tokens.buttonTonal)
                segment.fill(Tokens.buttonFill)
                    .animation(Self.faceChange) { $0.opacity(canSend ? 1 : 0) }
                GrainLayer(shape: segment, mode: .tile, opacity: 0.38, tile: "grain-button", overflow: 16)
                segment.fill(Tokens.terracotta.opacity(0.14))
                    .animation(Self.pressChange) { $0.opacity(pressed && !canSend ? 1 : 0) }
                segment.fill(Tokens.towardInk.opacity(0.14))
                    .animation(Self.pressChange) { $0.opacity(pressed && canSend ? 1 : 0) }
                ComposerSendSeam(seed: seed, width: segmentWidth, block: block)
                    .stroke(Tokens.cream, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
            }
            .clipShape(shape)
            shape.stroke(style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
                .animation(.easeOut(duration: 0.15)) { $0.foregroundStyle(ComposerMetrics.pen(focused: focused)) }
        }
        .accessibilityHidden(true)
    }

    /// The segment's faces crossfading (tonal ⇄ solid) and its press wash.
    static let faceChange = Animation.easeOut(duration: 0.14)
    static let pressChange = Animation.easeOut(duration: 0.12)
}

/// The send segment's region in the capsule's frame: the last `width` (52), cut from the text by the
/// seam (the capsule's outline trims it).
nonisolated struct ComposerSendSegment: Shape {
    let seed: Double
    var width: CGFloat = ComposerMetrics.sendWidth
    var block = false

    func path(in rect: CGRect) -> Path {
        guard block else {
            return SegmentRegion(left: ComposerMetrics.seamSeed(seed), right: nil).path(in: Self.frame(in: rect, width: width))
        }
        return ComposerBlockSeams(seed: seed, width: width).region.offsetBy(dx: rect.maxX - width, dy: rect.maxY - ComposerMetrics.height)
    }

    static func frame(in rect: CGRect, width: CGFloat = ComposerMetrics.sendWidth) -> CGRect {
        CGRect(x: rect.maxX - width, y: rect.minY, width: width, height: rect.height)
    }
}

/// The seam at the send segment's start, across the capsule — or, a block, along its top and down its left.
nonisolated struct ComposerSendSeam: Shape {
    let seed: Double
    var width: CGFloat = ComposerMetrics.sendWidth
    var block = false

    func path(in rect: CGRect) -> Path {
        guard block else {
            return SegmentRegion.leftSeam(seed: ComposerMetrics.seamSeed(seed)).path(in: ComposerSendSegment.frame(in: rect, width: width))
        }
        return ComposerBlockSeams(seed: seed, width: width).seam.offsetBy(dx: rect.maxX - width, dy: rect.maxY - ComposerMetrics.height)
    }
}

/// The send block of a composer of more than one line (round 22 §4.3, v2): 52 × 48 in the capsule's foot corner,
/// cut from the text by the bar's wavy seam running down its left and along its top, turning the top-left corner
/// round (`cornerRadius`) rather than meeting there at a right angle.
public nonisolated struct ComposerBlockSeams {
    public static let cornerRadius: Double = 14

    /// The block's face in its own 52 × 48 frame (reaching past its right and foot, which the capsule trims), and its seam.
    public let region: Path
    public let seam: Path

    public init(seed: Double, width: CGFloat = ComposerMetrics.sendWidth) {
        let w = Double(width), h = Double(ComposerMetrics.height), pad = SegmentSeams.pad(h), r = Self.cornerRadius
        let left = SegmentSeams.down(x: 0, h: h, seed: ComposerMetrics.seamSeed(seed), amp: 1.6, pad: pad)
            .filter { Double($0.y) >= r }.sorted { $0.y > $1.y }
        let top = SegmentSeams.across(y: 0, w: w, seed: ComposerMetrics.seamSeed(seed) + 5, amp: 1.6, pad: pad)
            .filter { Double($0.x) >= r }.sorted { $0.x < $1.x }
        // Up the left from past the foot, round the corner, along the top past the end.
        let start = left.first ?? CGPoint(x: 0, y: h + pad)
        let turnFrom = CGPoint(x: left.last?.x ?? 0, y: r)
        let turnTo = CGPoint(x: r, y: top.first?.y ?? 0)
        var seam = Path()
        seam.move(to: start)
        for pt in left.dropFirst() { seam.addLine(to: pt) }
        seam.addLine(to: turnFrom)
        seam.addCurve(to: turnTo, control1: CGPoint(x: turnFrom.x, y: r * 0.45), control2: CGPoint(x: r * 0.45, y: turnTo.y))
        for pt in top { seam.addLine(to: pt) }
        self.seam = seam
        var region = seam
        region.addLine(to: CGPoint(x: w + pad, y: h + pad))
        region.closeSubpath()
        self.region = region
    }
}

/// A notice in the composer's place, where there is nothing to write (a letter waiting for its
/// answer, no connection): a slip of the capsule's width — opaque paper, its pen INK_LIGHT in the
/// muted ink, the field's wobble at a radius of 14 — on the foot's paper (round 10 §3.2: no halo).
public struct ComposerSlip<Content: View>: View {
    var seed: Double
    @ViewBuilder let content: Content

    public init(seed: Double = 23, @ViewBuilder content: () -> Content) {
        self.seed = seed
        self.content = content()
    }

    public var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                let shape = WobRectShape(radius: ComposerMetrics.slipRadius, seed: seed)
                ZStack {
                    shape.fill(Tokens.cream)
                    shape.stroke(Tokens.textMuted, style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round, lineJoin: .round))
                }
                .accessibilityHidden(true)
            }
    }
}

/// The foot's paper (round 10 §3.2): the page's cream behind the composer across the pane's whole
/// width, run down to the screen's foot by its host (through the home indicator, under the keyboard),
/// its top ``ComposerMetrics/fade`` a fade from clear paper into it — so a message scrolling down
/// never shows under the composer, and where the foot meets the thread the paper comes on softly.
/// The solid part takes taps (`onTap`: the thread puts the keyboard away there, as on the thread);
/// the fade lets them through to the messages under it.
public struct ComposerBacking: View {
    let onTap: () -> Void

    public init(onTap: @escaping () -> Void) {
        self.onTap = onTap
    }

    public var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Tokens.cream.opacity(0), Tokens.cream], startPoint: .top, endPoint: .bottom)
                .frame(height: ComposerMetrics.fade)
                .allowsHitTesting(false)
            Tokens.cream
                .contentShape(Rectangle())
                .onTapGesture(perform: onTap)
        }
        .accessibilityHidden(true)
    }
}

/// One thing riding with the message (round 10 §3.4), in the reply's style: its lead (the reply's
/// wavy rule, a 40 × 40 picture, or a glyph on a tile — ``ComposerRowTile``), a label (12, semibold)
/// over a detail (12.5, muted) — one line each, cut with … — and a ✕ a finger wide at the row's end.
/// No frame: rows sit on the foot's paper in the composer's column, their content 12 in from the
/// capsule's start edge, at least 52 tall, touching each other. A label alone is centred in its row.
/// The lead and the words take no taps: a tap there is a tap on the paper (the keyboard goes away).
/// `onRemove` nil: nothing to take away yet (a picture still being readied), its room kept.
public struct ComposerRow<Lead: View>: View {
    let label: String
    let detail: String?
    let removeLabel: String
    let onRemove: (() -> Void)?
    let lead: Lead

    public init(label: String, detail: String? = nil, removeLabel: String, onRemove: (() -> Void)?,
                @ViewBuilder lead: () -> Lead) {
        self.label = label
        self.detail = detail
        self.removeLabel = removeLabel
        self.onRemove = onRemove
        self.lead = lead()
    }

    public var body: some View {
        HStack(spacing: ComposerMetrics.rowLeadGap) {
            lead
                .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(AppFonts.body(12, weight: .semibold)).foregroundStyle(Tokens.text).lineLimit(1)
                if let detail, !detail.isEmpty {
                    Text(detail).font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .allowsHitTesting(false)
            if let onRemove {
                OrganicIconButton(.close, label: removeLabel, size: 16, action: onRemove)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .padding(.vertical, ComposerMetrics.rowPadY)
        .padding(.leading, ComposerMetrics.rowStart)
        // The ✕'s glyph on the send plane's line, under the capsule's end.
        .padding(.trailing, (ComposerMetrics.sendWidth - 44) / 2)
        .frame(minHeight: ComposerMetrics.rowMinHeight)
        .accessibilityElement(children: .contain)
    }
}

/// A riding row's 40 × 40 lead, rounded as the chips were (12 / 14): a picture cover-cropped (or the
/// pen's loader while it is readied), a card's cover, or a glyph (18) on the tonal tile — the
/// terracotta light mixed into the paper, the chips' old face.
public struct ComposerRowTile: View {
    public enum Face {
        case picture(UIImage?)
        case cover(URL)
        case glyph(IconName)
    }

    let face: Face

    public init(_ face: Face) {
        self.face = face
    }

    public static let shape = UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 14, bottomTrailingRadius: 12,
                                                     topTrailingRadius: 14)
    /// The tile's face: the terracotta light at 40% on the paper.
    public static let tonal = Tokens.cream.mix(with: Tokens.terracottaLight, by: 0.4, in: .device)

    public var body: some View {
        Group {
            switch face {
            case let .picture(image):
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    Self.tonal.overlay { SketchLoader(size: 18) }
                }
            case let .cover(url):
                Self.tonal.overlay {
                    LazyImage(url: url) { state in
                        if let image = state.image { image.resizable().scaledToFill() }
                    }
                }
            case let .glyph(icon):
                Self.tonal.overlay { OrganicIcon(icon, size: ComposerMetrics.rowGlyph, color: Tokens.text, strokeWidth: Tokens.ink) }
            }
        }
        .frame(width: ComposerMetrics.rowThumb, height: ComposerMetrics.rowThumb)
        .clipShape(Self.shape)
        .accessibilityHidden(true)
    }
}

/// A button style that only reports its press (the face is drawn by the view around it).
private struct PressReport: ButtonStyle {
    @Binding var pressed: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, now in pressed = now }
    }
}

/// A reply's rule in the composer: a short vertical pen line in terracotta, wavy like the headers' edges.
public struct ReplyRule: View {
    var seed: Double

    public init(seed: Double = 31) {
        self.seed = seed
    }

    public var body: some View {
        ReplyRuleShape(seed: seed)
            .stroke(Tokens.terracotta, style: StrokeStyle(lineWidth: 2, lineCap: .round))
            .frame(width: 6)
            .accessibilityHidden(true)
    }
}

private nonisolated struct ReplyRuleShape: Shape {
    let seed: Double

    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        guard h > 0 else { return Path() }
        return wavyVertical(h, seed: seed, amp: 1.1, steps: max(3, Int(h / 9)))
            .path(offsetX: Double(rect.midX), offsetY: Double(rect.minY))
    }
}

// MARK: - Words

/// A bubble's words on CSS line boxes (the twin of Android's ChatText; `CSSText` has no spans):
/// `links` are coloured and wear the story's pen wave under them (``LinkWaves``), `highlights` washed behind the glyphs on rounded rects (the
/// matches of a search; `highlightWeight` sets them in a heavier face too), and a tap on a link goes
/// to `onLinkTap`. Takes its words' own width when they wrap (a bubble hugs its words), and at most
/// `maxLines` lines (cut with …). A press anywhere else is left to the bubble.
public struct ChatText: UIViewRepresentable {
    let text: String
    var size: CGFloat
    var weight: UIFont.Weight
    var lineHeight: CGFloat
    var color: Color
    var links: [MessageLinkRange]
    var linkColor: Color
    var highlights: [NSRange]
    var highlightColor: Color
    var highlightWeight: UIFont.Weight?
    var maxLines: Int
    var onLinkTap: ((URL) -> Void)?

    public init(_ text: String, size: CGFloat = BubbleMetrics.textSize, weight: UIFont.Weight = .regular,
                lineHeight: CGFloat = BubbleMetrics.lineHeight, color: Color = Tokens.text,
                links: [MessageLinkRange] = [], linkColor: Color = Tokens.terracotta,
                highlights: [NSRange] = [], highlightColor: Color = highlightWash(strong: false), highlightWeight: UIFont.Weight? = nil,
                maxLines: Int = 0, onLinkTap: ((URL) -> Void)? = nil) {
        self.text = text
        self.size = size
        self.weight = weight
        self.lineHeight = lineHeight
        self.color = color
        self.links = links
        self.linkColor = linkColor
        self.highlights = highlights
        self.highlightColor = highlightColor
        self.highlightWeight = highlightWeight
        self.maxLines = maxLines
        self.onLinkTap = onLinkTap
    }

    /// What the words were last drawn from: an update that brings the same (a row drawn again for
    /// something else) leaves the view as it is — no new string, no new layout, no redraw.
    struct Drawn: Equatable {
        let text: String
        let font: UIFont
        let heavier: UIFont?
        let lineHeight: CGFloat
        let color: Color
        let links: [MessageLinkRange]
        let linkColor: Color
        let highlights: [NSRange]
        let highlightColor: Color
        let maxLines: Int
    }

    public final class Coordinator {
        var drawn: Drawn?
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeUIView(context: Context) -> ChatTextView {
        let view = ChatTextView()
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    public func updateUIView(_ view: ChatTextView, context: Context) {
        // The fonts are asked for every time (they follow the person's text size), the rest compared.
        let font = AppFonts.scaledUIFont(.body, size: size, weight: weight)
        let heavier = highlightWeight.map { AppFonts.scaledUIFont(.body, size: size, weight: $0) }
        let drawn = Drawn(text: text, font: font, heavier: heavier, lineHeight: lineHeight, color: color, links: links,
                          linkColor: linkColor, highlights: highlights, highlightColor: highlightColor, maxLines: maxLines)
        guard drawn != context.coordinator.drawn else {
            // Only the tap's callback is new (it does the same).
            view.setLinkTap(onLinkTap)
            return
        }
        context.coordinator.drawn = drawn
        let out = NSMutableAttributedString(string: text, attributes: [.font: font, .foregroundColor: UIColor(color)])
        let all = NSRange(location: 0, length: out.length)
        for link in links {
            let r = NSIntersectionRange(link.range, all)
            guard r.length > 0 else { continue }
            out.addAttributes([.foregroundColor: UIColor(linkColor)], range: r)
        }
        if let heavier {
            for range in highlights {
                let r = NSIntersectionRange(range, all)
                if r.length > 0 { out.addAttribute(.font, value: heavier, range: r) }
            }
        }
        view.set(text: out, font: font, lineHeight: lineHeight, maxLines: maxLines, links: links, highlights: highlights,
                 highlightColor: UIColor(highlightColor), onLinkTap: onLinkTap)
        view.accessibilityLabel = text
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: ChatTextView, context: Context) -> CGSize? {
        var width = proposal.width ?? 320
        if !width.isFinite { width = 320 }
        return uiView.measure(width: max(1, width))
    }
}

/// ``ChatText``'s view: TextKit 1 on exact CSS line boxes (``CSSLineBoxes``), drawn by hand so the
/// search's washes can lie under the glyphs. It takes a tap only on a link; everything else falls
/// through to the bubble (and a long-press over a link asks it which: `link(at:)`).
public final class ChatTextView: UIView, UIGestureRecognizerDelegate {
    private let storage = NSTextStorage()
    private let layout = NSLayoutManager()
    private let container = NSTextContainer(size: CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude))
    /// The layout manager holds its delegate weakly.
    private var lineBoxes: CSSLineBoxes?
    private var links: [MessageLinkRange] = []
    private var highlights: [NSRange] = []
    private var highlightColor: UIColor = .clear
    /// How tall a highlight is: the glyphs' height, centred on the line box.
    private var glyphHeight: CGFloat = 0
    private var onLinkTap: ((URL) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.delegate = self
        addGestureRecognizer(tap)
        // Drawn by hand: a light/dark switch or a new theme draws the words, waves and washes again.
        registerForTraitChanges([UITraitUserInterfaceStyle.self, AccentTrait.self]) { (view: ChatTextView, _) in view.setNeedsDisplay() }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func set(text: NSAttributedString, font: UIFont, lineHeight: CGFloat, maxLines: Int, links: [MessageLinkRange],
             highlights: [NSRange], highlightColor: UIColor, onLinkTap: ((URL) -> Void)?) {
        // Drawn again only when something drawn changed: drawing is by hand, on the CPU.
        var changed = false
        if lineBoxes?.font != font || lineBoxes?.lineBox != font.pointSize * lineHeight {
            let boxes = CSSLineBoxes(font: font, lineHeight: lineHeight)
            lineBoxes = boxes
            layout.delegate = boxes
            changed = true
        }
        let breakMode: NSLineBreakMode = maxLines > 0 ? .byTruncatingTail : .byWordWrapping
        if container.maximumNumberOfLines != maxLines || container.lineBreakMode != breakMode {
            container.maximumNumberOfLines = maxLines
            container.lineBreakMode = breakMode
            changed = true
        }
        if !storage.isEqual(to: text) {
            storage.setAttributedString(text)
            invalidateIntrinsicContentSize()
            changed = true
        }
        if self.links != links || self.highlights != highlights || self.highlightColor != highlightColor {
            changed = true
        }
        self.links = links
        self.highlights = highlights
        self.highlightColor = highlightColor
        setLinkTap(onLinkTap)
        glyphHeight = font.pointSize * 1.3
        if changed { setNeedsDisplay() }
    }

    /// What a tap on a link calls.
    func setLinkTap(_ onLinkTap: ((URL) -> Void)?) {
        self.onLinkTap = onLinkTap
        // Words without a link to tap leave every touch to what they sit in (a bubble, a row of results).
        isUserInteractionEnabled = onLinkTap != nil && !links.isEmpty
    }

    /// The words laid out across `width`: as wide as their longest line, as tall as their lines —
    /// and as deep as a link's wave under the last line reaches past its line box.
    /// Drawn at the width it took, the lines break where they did (none of them is wider).
    func measure(width: CGFloat) -> CGSize {
        lay(width)
        let used = layout.usedRect(for: container)
        let waveFoot = waveFragments().map { $0.baseline + LinkWaves.reach(fontSize: fontSize) }.max() ?? 0
        return CGSize(width: min(width, ceil(used.width)), height: ceil(max(used.height, waveFoot)))
    }

    private var fontSize: CGFloat { lineBoxes?.font.pointSize ?? BubbleMetrics.textSize }

    /// Each link's share of each line it covers.
    private func waveFragments() -> [LinkFragment] {
        let all = NSRange(location: 0, length: storage.length)
        return links.flatMap { link -> [LinkFragment] in
            let r = NSIntersectionRange(link.range, all)
            guard r.length > 0 else { return [] }
            return LinkWaves.fragments(of: r, layoutManager: layout, container: container)
        }
    }

    /// The story link's wave (LinkWaveTextView's recipe): ``LinkWaves/ink`` at 70%, INK wide, round caps,
    /// ``LinkWaves/depthEm`` under the baseline, seeded per link and line — beneath the glyphs.
    private func drawWaves() {
        let all = NSRange(location: 0, length: storage.length)
        let drop = LinkWaves.drop(fontSize: fontSize)
        LinkWaves.ink.withAlphaComponent(0.7).setStroke()
        for link in links {
            let r = NSIntersectionRange(link.range, all)
            guard r.length > 0 else { continue }
            for (i, f) in LinkWaves.fragments(of: r, layoutManager: layout, container: container).enumerated() {
                let wave = penWave(Double(f.maxX - f.minX), seed: Double(seedFromString(link.url.absoluteString) + i), amp: Double(LinkWaves.amp))
                    .path(offsetX: Double(f.minX), offsetY: Double(f.baseline + drop))
                let path = UIBezierPath(cgPath: wave.cgPath)
                path.lineWidth = Tokens.ink
                path.lineCapStyle = .round
                path.lineJoinStyle = .round
                path.stroke()
            }
        }
    }

    private func lay(_ width: CGFloat) {
        if container.size.width != width { container.size = CGSize(width: width, height: .greatestFiniteMagnitude) }
        layout.ensureLayout(for: container)
    }

    public override func draw(_ rect: CGRect) {
        guard storage.length > 0, bounds.width > 0 else { return }
        lay(bounds.width)
        if !highlights.isEmpty {
            highlightColor.setFill()
            for box in highlightRects() { UIBezierPath(roundedRect: box, cornerRadius: 4).fill() }
        }
        if !links.isEmpty { drawWaves() }
        let glyphs = layout.glyphRange(for: container)
        layout.drawBackground(forGlyphRange: glyphs, at: .zero)
        layout.drawGlyphs(forGlyphRange: glyphs, at: .zero)
    }

    /// Where each highlighted range falls: one rect per line it crosses, as tall as the glyphs,
    /// centred on the line box, 2 wider than the words at each end.
    private func highlightRects() -> [CGRect] {
        var out: [CGRect] = []
        let all = NSRange(location: 0, length: storage.length)
        for range in highlights {
            let r = NSIntersectionRange(range, all)
            guard r.length > 0 else { continue }
            let glyphs = layout.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
            layout.enumerateLineFragments(forGlyphRange: glyphs) { [layout, container, glyphHeight] line, _, _, lineGlyphs, _ in
                let part = NSIntersectionRange(glyphs, lineGlyphs)
                guard part.length > 0 else { return }
                let box = layout.boundingRect(forGlyphRange: part, in: container)
                guard box.width > 0.5 else { return }
                out.append(CGRect(x: box.minX - 2, y: line.midY - glyphHeight / 2, width: box.width + 4, height: glyphHeight))
            }
        }
        return out
    }

    /// The link under `point` (in this view's space), if any; a little room round its words still counts.
    public func link(at point: CGPoint) -> URL? {
        guard !links.isEmpty, storage.length > 0 else { return nil }
        lay(bounds.width)
        var fraction: CGFloat = 0
        let glyph = layout.glyphIndex(for: point, in: container, fractionOfDistanceThroughGlyph: &fraction)
        let box = layout.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
        guard box.insetBy(dx: -6, dy: -6).contains(point) else { return nil }
        let at = layout.characterIndexForGlyph(at: glyph)
        return links.first { NSLocationInRange(at, $0.range) }?.url
    }

    public override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard g.delegate === self else { return super.gestureRecognizerShouldBegin(g) }
        return onLinkTap != nil && link(at: g.location(in: self)) != nil
    }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        if let url = link(at: g.location(in: self)) { onLinkTap?(url) }
    }
}
