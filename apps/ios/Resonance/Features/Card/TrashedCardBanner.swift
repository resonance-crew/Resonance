import DesignSystem
import ResonanceKit
import SwiftUI

/// 「這張卡片在垃圾桶裡」 (the web's TrashedCardBanner) — what the owner sees as the first block of
/// their card's page while it is in the trash (from the shelf, a bell, a link, or the page's own
/// 刪除, which leaves them here): how long it has and that only they can see it, and that an
/// anonymous card's notes went with it; then 還原 (the card comes back here, as it was) and 永久刪除
/// (asked first, in red, then back to the tab's root). Everyone else gets the page's not-found.
///
/// One hand-drawn shape, cut as the segmented bar is (round 19): the words on its paper, the two ways
/// out filling its end as segments behind wavy seams — 還原 the verb's solid face, 永久刪除 the
/// danger's tonal one — and on a phone, where the words take the width, its foot, split in half.
struct TrashedCardBanner: View {
    let card: FeedCard
    /// It was moved to the trash on this very page a moment ago: VoiceOver comes to the banner's title.
    var focusTitle = false
    /// Deleted for good: the page goes.
    var onDeleted: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.window) private var window
    @Environment(\.organicBusyLabel) private var busyLabel
    @AccessibilityFocusState private var titleFocused: Bool
    @State private var busy: Busy?
    @State private var confirming = false
    @State private var failed = false
    /// Where the segments are laid out, in the banner's own space: the drawing follows them.
    @State private var size: CGSize = .zero
    @State private var restoreFrame: CGRect = .zero
    @State private var deleteFrame: CGRect = .zero
    /// Each segment's press ink (0…1), spread and lifted as the segmented bar's.
    @State private var restoreInk = 0.0
    @State private var deleteInk = 0.0
    @State private var presses = 0
    @State private var pressedAt: Date?

    private enum Busy { case restore, delete }
    private static let space = "trashBanner"

    /// Whether the card's page shows the banner (and leaves out its share, its ⋯ and its lists): the
    /// owner's card in the trash.
    static func shows(_ detail: CardDetail) -> Bool {
        detail.isOwner && detail.card.isTrashed
    }

    /// The caption: when it goes, and that only the owner can see it.
    static func caption(_ card: FeedCard, now: Date = .now) -> String {
        TrashCaption.days(purgeAt: card.purgeDate, now: now).map { "\($0) · \(L10n.Card.Trashed.onlyYou)" } ?? L10n.Card.Trashed.onlyYou
    }

    var body: some View {
        // A phone: the words take the width, the two ways out its foot (the web's ≤ 640).
        let stacked = window.layoutClass == .compact
        Group {
            if stacked {
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 14) {
                        glyph.padding(.top, 1)
                        words
                    }
                    .padding(.top, 14)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 0) {
                        restoreSegment(stacked: true).frame(maxWidth: .infinity)
                        deleteSegment(stacked: true).frame(maxWidth: .infinity)
                    }
                    .frame(minHeight: 50)
                    .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack(spacing: 0) {
                    HStack(alignment: .center, spacing: 14) {
                        glyph
                        words
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, 20)
                    .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
                    restoreSegment(stacked: false)
                    deleteSegment(stacked: false)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .coordinateSpace(.named(Self.space))
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
        .background { backdrop(stacked: stacked) }
        .accessibilityElement(children: .contain)
        .onAppear { if focusTitle { titleFocused = true } }
        .organicConfirm(isPresented: $confirming, title: L10n.Me.Actions.deleteForeverConfirmTitle,
                        message: L10n.Me.Actions.deleteConfirmBody, cancelLabel: L10n.Me.Actions.deleteCancel,
                        confirmLabel: L10n.Me.Actions.deleteForever, closeLabel: L10n.Me.Actions.deleteCancel,
                        busy: busy == .delete, error: failed ? L10n.Safety.actionError : nil, destructive: true, seed: 71) {
            Task { await deleteForever() }
        }
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Not a heading: it comes before the card's own title.
            Text(L10n.Card.Trashed.title)
                .font(AppFonts.body(15, weight: .semibold))
                .foregroundStyle(Tokens.text)
                .accessibilityFocused($titleFocused)
            Text(Self.caption(card)).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            if card.anonymous && card.publishedAt != nil {
                Text(L10n.Card.Trashed.notesGone).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var glyph: some View {
        OrganicIcon(.trash, size: 20, color: Tokens.textMuted).accessibilityHidden(true)
    }

    private func restoreSegment(stacked: Bool) -> some View {
        Button { Task { await restore() } } label: {
            segmentLabel(L10n.Me.Actions.restore, icon: .restore, ink: Tokens.cream, working: busy == .restore,
                         leading: stacked ? 12 : 26, trailing: stacked ? 12 : 24, stacked: stacked)
        }
        .buttonStyle(BannerSegmentStyle { pressed($0, ink: $restoreInk) })
        .allowsHitTesting(busy == nil)
        .accessibilityValue(busy == .restore ? busyLabel : "")
        .accessibilityAddTraits(busy == .restore ? .updatesFrequently : [])
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { restoreFrame = $0 }
    }

    private func deleteSegment(stacked: Bool) -> some View {
        Button {
            failed = false
            confirming = true
        } label: {
            segmentLabel(L10n.Me.Actions.deleteForever, icon: .trash, ink: Tokens.buttonOnDangerTonal, working: false,
                         leading: stacked ? 12 : 24, trailing: stacked ? 12 : 26, stacked: stacked)
        }
        .buttonStyle(BannerSegmentStyle { pressed($0, ink: $deleteInk) })
        .allowsHitTesting(busy == nil)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.space)) } action: { deleteFrame = $0 }
    }

    /// A segment's glyph and words, centred on its share of the shape, its whole height (stacked: half
    /// the foot's width; side by side: its words' own).
    private func segmentLabel(_ label: String, icon: IconName, ink: Color, working: Bool, leading: CGFloat, trailing: CGFloat,
                              stacked: Bool) -> some View {
        HStack(spacing: 6) {
            OrganicIcon(icon, size: 16, color: ink)
                .opacity(working ? 0 : 1)
                .overlay { if working { ButtonLoader(size: 16, color: ink).transition(.opacity) } }
            Text(label)
                .font(AppFonts.body(15, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
                .fixedSize()
        }
        .animation(.easeOut(duration: 0.12), value: working)
        .padding(.leading, leading)
        .padding(.trailing, trailing)
        .frame(maxWidth: stacked ? .infinity : nil, minHeight: stacked ? 50 : 48, maxHeight: .infinity)
        .contentShape(Rectangle())
    }

    /// The shape drawn under the words and labels: the paper, the segments' faces, their grain and
    /// press inks, the seams cut in the page's paper, and the pen line round it all.
    @ViewBuilder private func backdrop(stacked: Bool) -> some View {
        if let shape = TrashBannerShape(size: size, restore: restoreFrame, delete: deleteFrame, stacked: stacked) {
            ZStack(alignment: .topLeading) {
                shape.outline.fill(Tokens.creamDark)
                ZStack(alignment: .topLeading) {
                    shape.segments.fill(Tokens.buttonFill)
                    // The faces, their grain and inks, and (stacked) the split between the two, which
                    // reaches up past the words' seam: all cut back to the segments.
                    ZStack(alignment: .topLeading) {
                        shape.danger.fill(Tokens.buttonDangerTonal)
                        GrainLayer(shape: shape.segments, mode: .tile, opacity: 0.38, tile: "grain-button", overflow: 16)
                        shape.restore.fill(Tokens.towardInk.opacity(0.14)).opacity(restoreInk)
                        shape.danger.fill(Tokens.danger.opacity(0.14)).opacity(deleteInk)
                        shape.seams[1].stroke(Tokens.cream, style: seamStroke)
                    }
                    .clipShape(shape.segments)
                    shape.seams[0].stroke(Tokens.cream, style: seamStroke)
                }
                .clipShape(shape.outline)
                shape.outline.stroke(Tokens.fieldBorderHover, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round))
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .accessibilityHidden(true)
        }
    }

    /// The seams, cut in the page's paper at the house pen's width.
    private var seamStroke: StrokeStyle { StrokeStyle(lineWidth: Tokens.ink, lineCap: .round) }

    /// A press: the ink spreads at once and lifts once the finger does, after the spread has run its
    /// course (a quick tap still shows all of it); a new press keeps it.
    private func pressed(_ down: Bool, ink: Binding<Double>) {
        if down {
            presses += 1
            pressedAt = .now
            withAnimation(InkTiming.spread) { ink.wrappedValue = 1 }
        } else {
            let mine = presses
            let wait = max(0, InkTiming.leastSpread - (pressedAt.map { Date.now.timeIntervalSince($0) } ?? 1))
            Task { @MainActor in
                if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
                guard presses == mine else { return }
                withAnimation(InkTiming.lift) { ink.wrappedValue = 0 }
            }
        }
    }

    private func restore() async {
        guard busy == nil else { return }
        busy = .restore
        defer { busy = nil }
        // The page reads the card again (the change concerns it): the banner goes with the trash.
        await TrashMoves.restore(card.id, answering: nil, session: session, writer: writer)
    }

    private func deleteForever() async {
        guard busy == nil else { return }
        busy = .delete
        failed = false
        defer { busy = nil }
        do {
            let result = try await TrashMoves.deleteForever(card.id, session: session, writer: writer)
            confirming = false
            if result == .deleted { onDeleted() }
        } catch {
            failed = true
        }
    }
}

/// A banner segment's press: its label as it is, the press told to the banner (whose drawing carries
/// the ink, as the segmented bar's faces do), with the light tap a segment gives.
private struct BannerSegmentStyle: ButtonStyle {
    let onPress: (Bool) -> Void

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, down in onPress(down) }
            .sensoryFeedback(.impact(weight: .light), trigger: configuration.isPressed) { _, new in new }
    }
}

/// The banner's drawing at its laid-out size (the web's bannerShape): its outline — a calm wobble (round 20)
/// — and the two segments cut off by the segmented bar's wavy seams. Side by side the
/// segments are the shape's end, past the words; stacked (a phone) its foot, under them, split down
/// the middle. One point list for each seam's stroke and the faces' edges.
struct TrashBannerShape {
    let outline: Path
    /// The wavy seams: before 還原 and between the two (stacked: the one under the words, then the split).
    let seams: [Path]
    /// Where the segments are: everything past the first seam (stacked: under the words' seam).
    let segments: Path
    /// Past the seam between 還原 and 永久刪除.
    let danger: Path
    /// 還原's own region, for its press ink (cut to `segments` where it reaches past them).
    let restore: Path

    static let seed = 83.0
    /// The corner, as a card's.
    static let radius = 18.0
    /// How far the seams wave: a gentle bend, not a swing (round 20; the web's SEAM / SEAM_ACROSS).
    static let seam = 1.1
    static let seamAcross = 1.5

    /// Nil until the banner and its segments are laid out.
    init?(size: CGSize, restore: CGRect, delete: CGRect, stacked: Bool) {
        let w = Double(size.width), h = Double(size.height)
        guard w > 0, h > 0, restore.width > 0, delete.width > 0 else { return nil }
        // Calm (round 20, the owner: the curve was too strong): a Panel's wobble a little quieter.
        outline = WobRectShape(radius: Self.radius, seed: Self.seed, mag: autoMag(w, h) * 0.8, options: WobRectOptions(
            curve: autoCurve(w, h) * 0.7, cornerJitter: 0.8, segmentsH: .count(Double(autoSegments(w))),
            segmentsV: .count(2))).path(in: CGRect(origin: .zero, size: size))
        let pad = SegmentSeams.pad(h)
        if !stacked {
            let first = SegmentSeams.down(x: Double(restore.minX), h: h, seed: Self.seed + 11, amp: Self.seam, pad: pad)
            let second = SegmentSeams.down(x: Double(delete.minX), h: h, seed: Self.seed + 48, amp: Self.seam, pad: pad)
            seams = [Path(polyline: first), Path(polyline: second)]
            segments = SegmentSeams.right(of: first, w: w, h: h, pad: pad)
            danger = SegmentSeams.right(of: second, w: w, h: h, pad: pad)
            self.restore = SegmentSeams.between(first, second)
        } else {
            let top = Double(restore.minY)
            let under = SegmentSeams.across(y: top, w: w, seed: Self.seed + 11, amp: Self.seamAcross, pad: pad)
            // Down the middle of the foot, from a little above the seam over it (which hides what reaches above).
            let split = SegmentSeams.down(x: Double(delete.minX), h: h - top, seed: Self.seed + 48, amp: Self.seam, pad: pad)
                .map { CGPoint(x: $0.x, y: $0.y + top) }
            seams = [Path(polyline: under), Path(polyline: split)]
            segments = SegmentSeams.below(under, w: w, h: h, pad: pad)
            danger = SegmentSeams.right(of: split, w: w, h: h, pad: pad)
            self.restore = SegmentSeams.left(of: split, h: h, pad: pad)
        }
    }
}

/// 刪除 from the card's own ⋯ leaves the reader on its page (trash.spec §5.4), whose banner then stands at
/// its head — far above the line they were reading, maybe. Once the banner shows, the page goes up to
/// it, as the web's focus on its title and Android's focusable title bring it into view: once for each
/// move to the trash made on the page (not again for a later read of the same card, nor for a card
/// that was in the trash when the page opened).
struct TrashedHere: Equatable {
    /// Moves to the trash made from this page's ⋯, and how many of them the page has gone up for.
    private var moved = 0
    private var shown = 0

    /// The card went to the trash from this page.
    mutating func trashed() { moved += 1 }

    /// VoiceOver's focus goes to the banner's title.
    var focusTitle: Bool { moved > 0 }

    /// Whether the page goes up to the banner now: it shows (`banner`), after a move not gone up for yet.
    mutating func bringIntoView(banner: Bool) -> Bool {
        guard banner, shown < moved else { return false }
        shown = moved
        return true
    }
}
