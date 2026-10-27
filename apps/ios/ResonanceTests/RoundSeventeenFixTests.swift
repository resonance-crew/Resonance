import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 17's review, the iOS fixes (review-decisions.md): committing a tag moves neither the field nor its end segment
/// (A2); a destructive row is told by the danger ink alone (D1); a pane's press scrim starts on the rule's own line (D2);
/// the link dialog's controls are one height, 44, with 移除連結 a quiet word, and its address selected through the
/// field itself (D5, A6); the composer's ＋ wears the web's open state while its menu is open (A10); a menu row is
/// measured by the words' drawn advance (A11).

/// What the tag field holds: the room above it (the pills' row and the preview's coming in) and whether a word is typed.
@MainActor @Observable private final class TagShift {
    var room: CGFloat = 0
    var ready = true
}

private struct TagShiftHarness: View {
    let model: TagShift

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: model.room)
            TagEntryCapsule(focused: true, ready: model.ready, thinking: false, suggestLabel: "AI 建議", suggestAccessibility: "AI 建議",
                            addLabel: "新增", addAccessibility: "新增", onSegment: {}) {
                Text(verbatim: "回憶").frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .frame(width: 360, height: 300, alignment: .top)
        .background(Color(red: 0, green: 0, blue: 1))
        // At the window's own top-left, whatever the screen's safe area.
        .ignoresSafeArea()
    }
}

@MainActor @Suite(.serialized) struct RoundSeventeenTagJumpTests {
    private typealias RGB = (r: Double, g: Double, b: Double)

    private func rgb(_ color: Color, _ traits: UITraitCollection) -> RGB {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r) * 255, Double(g) * 255, Double(b) * 255)
    }

    private func distance(_ a: RGB, _ b: RGB) -> Double {
        ((a.r - b.r) * (a.r - b.r) + (a.g - b.g) * (a.g - b.g) + (a.b - b.b) * (a.b - b.b)).squareRoot()
    }

    /// How far a colour lies from the segment's crossfade (anywhere between its solid and its tonal face).
    private func offFace(_ c: RGB, solid: RGB, tonal: RGB) -> Double {
        let d = (tonal.r - solid.r, tonal.g - solid.g, tonal.b - solid.b)
        let len = d.0 * d.0 + d.1 * d.1 + d.2 * d.2
        let t = max(0, min(1, ((c.r - solid.r) * d.0 + (c.g - solid.g) * d.1 + (c.b - solid.b) * d.2) / max(len, 1)))
        return distance(c, (solid.r + t * d.0, solid.g + t * d.1, solid.b + t * d.2))
    }

    /// The window as it is on screen now (mid-animation included), 1 px a point.
    private func pixel(_ window: UIWindow, _ point: CGPoint) -> RGB {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            _ = window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
        }
        let (data, width) = CardShareTests.pixels(image.cgImage!)
        let i = (Int(point.y) * width + Int(point.x)) * 4
        return (Double(data[i]), Double(data[i + 1]), Double(data[i + 2]))
    }

    /// 新增 commits a word: in one update the pills' row comes in above the field (which moves down by it) and the
    /// segment turns from its solid face to its tonal one. The segment moves with the field at once, on every frame —
    /// only its colour crossfades. (It used to glide in from where the field had been: the owner's 「跳動」.)
    @Test func committingATagMovesTheSegmentWithTheFieldAtOnce() async throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 360, height: 300)
        let model = TagShift()
        window.rootViewController = UIHostingController(rootView: TagShiftHarness(model: model))
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        try await Task.sleep(for: .milliseconds(400))

        let traits = window.traitCollection
        let solid = rgb(Tokens.buttonFill, traits), tonal = rgb(Tokens.buttonTonal, traits)
        let blue: RGB = (0, 0, 255)
        // Just inside the segment's end, clear of its words and the capsule's pen.
        let x: CGFloat = 340 - 9
        let before = pixel(window, CGPoint(x: x, y: 24))
        #expect(offFace(before, solid: solid, tonal: tonal) < 40, "\(before) solid \(solid) tonal \(tonal)")

        model.room = 80
        model.ready = false
        for _ in 0..<6 {
            try await Task.sleep(for: .milliseconds(25))
            // Where the field is now: the segment's face (on its way from solid to tonal).
            let now = pixel(window, CGPoint(x: x, y: 80 + 24)), was = pixel(window, CGPoint(x: x, y: 24))
            #expect(offFace(now, solid: solid, tonal: tonal) < 40, "\(now)")
            // Where the field was: nothing of it is left behind.
            #expect(distance(was, blue) < 30, "\(was)")
        }
    }
}

@MainActor @Suite struct RoundSeventeenFixTests {
    private func resolved(_ color: Color, _ style: UIUserInterfaceStyle) -> UIColor {
        UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    private func same(_ a: Color, _ b: Color) -> Bool {
        [UIUserInterfaceStyle.light, .dark].allSatisfy { resolved(a, $0) == resolved(b, $0) }
    }

    // MARK: D1

    @Test func aDestructiveRowWearsTheDangerInk() {
        let block = OrganicMenuItem(id: "delete", title: "刪除", icon: .trash, danger: true) {}
        let search = OrganicMenuItem(id: "search", title: "搜尋訊息", icon: .search) {}
        for pressed in [false, true] {
            let inks = MenuRowInks.of(block, pressed: pressed)
            // The deeper danger red, which words can be read in (the plain one is 4.2 : 1 on the menu paper).
            #expect(same(inks.glyph, Tokens.dangerFill) && same(inks.label, Tokens.dangerFill))
            // A card's own menu (its hue) too: the danger ink is the danger ink.
            let carded = MenuRowInks.of(block, pressed: pressed, hue: 140)
            #expect(same(carded.glyph, Tokens.dangerFill) && same(carded.label, Tokens.dangerFill))
        }
        // A plain row: the pen's glyph and the text's words at rest, both the deeper pen pressed.
        #expect(same(MenuRowInks.of(search, pressed: false).glyph, Tokens.terracotta))
        #expect(same(MenuRowInks.of(search, pressed: false).label, Tokens.text))
        #expect(same(MenuRowInks.of(search, pressed: true).label, Tokens.terracottaDeep))
        // Its press is the same strength as every row's, in the danger hue (the plain red, as the web's ink).
        #expect(same(MenuRowInks.press(.danger), Tokens.danger.opacity(MenuRowInks.pressStrength)))
        #expect(same(MenuRowInks.press(.plain), Tokens.terracottaDeep.opacity(MenuRowInks.pressStrength)))
        // Every destructive row, not only the first.
        let delete = OrganicMenuItem(id: "delete", title: "刪除對話", icon: .trash, danger: true) {}
        #expect([search, block, delete].map(\.tone) == [.plain, .danger, .danger])
    }

    // MARK: D2

    @Test func aPanesScrimStartsOnTheRulesOwnLine() {
        let rect = CGRect(x: 0, y: 0, width: 700, height: 900)
        let path = PaneScrimShape().path(in: rect)
        let rule = PaneRuleGeometry(height: Double(rect.height))
        for y in stride(from: 20.0, through: 880.0, by: 37.0) {
            let x = rule.x(at: y)
            // From the rule's centre line across, never the 12 of paper beside it that stayed crisp.
            #expect(path.contains(CGPoint(x: x + 1, y: y)))
            #expect(!path.contains(CGPoint(x: x - 1, y: y)))
            #expect(path.contains(CGPoint(x: 699, y: y)))
        }
        // The rule waves about the gutter's middle, 12 in from the pane's edge (never its 24).
        #expect(rule.x(at: 450) < Double(PaneLines.gutter) - 6)
    }

    // MARK: D5, A6

    @Test func theLinkDialogsControlsAreOneHeight() {
        #expect(StoryLinkModal.Metrics.control == 44)
        #expect(StoryLinkModal.Metrics.fieldLine + 2 * StoryLinkModal.Metrics.fieldPadY == 44)
        func height(_ view: some View) -> CGFloat {
            UIHostingController(rootView: view).sizeThatFits(in: CGSize(width: 360, height: CGFloat.infinity)).height
        }
        let choice = SegmentedActionBar([SegmentSpec(id: "card", icon: .frame, label: "卡片") {},
                                         SegmentSpec(id: "text", icon: .link, label: "文字") {}],
                                        fill: Tokens.creamDark, height: StoryLinkModal.Metrics.control)
        #expect(abs(height(choice) - 44) < 0.5)
        #expect(abs(height(QuietTextButton("移除連結") {}) - 44) < 0.5)
        // Without a height the bar keeps its words' own air.
        #expect(height(SegmentedActionBar([SegmentSpec(id: "a", label: "公開") {}])) > 44)
    }

    @Test func theAddressIsSelectedThroughTheFieldItself() {
        let address = "https://example.com/rain"
        guard case let .selection(range) = StoryLinkModal.wholeAddress(address).indices else {
            Issue.record("not a range")
            return
        }
        #expect(range == address.startIndex..<address.endIndex)
    }

    // MARK: A10

    @Test func theComposersPlusWearsTheWebsOpenState() {
        #expect(same(ComposerMetrics.attachInk(open: false), Tokens.textMuted))
        #expect(same(ComposerMetrics.attachInk(open: true), Tokens.text))
        // The web's bare trigger: a disc of the text ink at 8 %, 92 % of the box, in 160 ms.
        #expect(BareTriggerDisc.ink == 0.08)
        #expect(BareTriggerDisc.reach == 0.92)
    }

    // MARK: A11

    @Test func aRowIsMeasuredByItsWordsDrawnAdvance() {
        // The sheet is the words as drawn, the glyph, its gap and 20 either side: the trailing room is the leading.
        for title in ["Report this conversation", "Delete conversation", "檢舉這段對話以及更多的字"] {
            let drawn = UIHostingController(rootView: Text(title).font(AppFonts.body(MenuSheetMetrics.textSize)).fixedSize())
                .sizeThatFits(in: CGSize(width: 1000, height: 100)).width
            let width = MenuSheetMetrics.width(titles: [title], footer: nil, widths: 0...1000)
            let trailing = width - MenuSheetMetrics.padX - MenuSheetMetrics.glyph - MenuSheetMetrics.gap - drawn
            #expect(trailing >= MenuSheetMetrics.padX && trailing <= MenuSheetMetrics.padX + 2.5, "\(title): \(trailing)")
        }
    }
}
