import DesignSystem
import SwiftUI

/// A list's rows parted into bands (round 23 §4/§5, the owner: 「沒有真的一個 border，只是…用這一條有機的曲線分開的
/// 區塊」): no rule between them — each row is the paper between two hand-drawn curves it shares with its neighbours,
/// seen only as the edge of its wash: a finger's press (``pressAlpha``, from ``pressDelay`` in, gone the moment the
/// list scrolls) or a pointer over it (``hoverAlpha``, the Mac's and an iPad's trackpad); at rest nothing is drawn. The
/// rows touch (``rowPad`` above and below each row's content, no gap), the band runs the list's whole width — a phone's
/// screen edge to edge, a tablet's or the Mac's window — while the content keeps its column, and its curves swing
/// ``amp`` about the rows' edges, drawn unclipped.
///
/// Each curve is seeded by the key of the row BELOW it, never by a place in the list: a row arriving on top moves no
/// other curve. A row's top curve is its own key's, its bottom one the next row's — or, above a part's title, that
/// title's key (``below(_:after:)``); the list's last row ends on ``endKey``. A part's title sits on bare paper,
/// ``titleClear`` clear of the swing above and below it. Android's ListBands and the web's bell list are the twins.
nonisolated enum ListBands {
    /// How far a band's curve swings about the row's edge: the menu sheets' 2.
    static let amp = 2.0
    /// Above and below each row's content; the bands touch (gap 0).
    static let rowPad: CGFloat = 12
    /// A title between the bands: this much bare paper past the farthest a band's curve can reach.
    static let titleClear: CGFloat = 4
    /// A title's own padding toward a band: the curve's swing and ``titleClear``.
    static var titleToBand: CGFloat { CGFloat(amp) + titleClear }
    /// The content's side inset from the band's ends on a phone (and inside a tablet's reading column).
    static let contentInset: CGFloat = 20
    /// A finger held this long on a row before its band shows (a scroll starting sooner shows nothing).
    static let pressDelay: Duration = .milliseconds(80)
    /// A tap lifted before ``pressDelay``: how long the list is given to say it took the finger for a scroll
    /// (SwiftUI lets a row's press go as a scroll begins) before the band shows for as long as the delay.
    static let scrollWord: Duration = .milliseconds(30)
    /// The pressed band's wash toward the ink, and a pointer's (the same mixes at night).
    static let pressAlpha = 0.12
    static let hoverAlpha = 0.06
    /// Where the last band of the list ends: its bottom curve's key.
    static let endKey = "bands:end"

    /// A band's turns across `width`: one every ~100, never fewer than a menu's 4.
    static func steps(_ width: Double) -> Int { max(4, Int(jsRound(width / 100))) }

    /// A curve's seed: its key's (the row below it), never its index.
    static func seed(_ key: String) -> Double { Double(seedFromString(key)) }

    /// The curve `key` draws at `y` across a band `w` wide (flat where it meets the band's ends).
    static func curve(y: Double, w: Double, key: String) -> [Point] {
        rowBoundary(y: y, w: w, seed: seed(key), amp: amp, pad: 0, steps: steps(w))
    }

    /// A row's band, `w` × `h`: its own curve along the top, the one under it (`bottom`'s) along the bottom.
    static func region(w: Double, h: Double, top: String, bottom: String) -> [PathCommand] {
        let upper = curve(y: 0, w: w, key: top)
        let back = Array(curve(y: h, w: w, key: bottom).reversed())
        return dividerPath(upper) + [.line(back[0].x, back[0].y)] + Array(dividerPath(back).dropFirst()) + [.close]
    }

    /// The key of the curve under each row of `keys`: the next row's, and after the last, `after` (a title's key,
    /// or the list's end).
    static func below(_ keys: [String], after: String) -> [String] {
        keys.isEmpty ? [] : Array(keys.dropFirst()) + [after]
    }

    /// How strong a band's wash is now.
    static func alpha(press: BandPress, hovered: Bool) -> Double {
        press.showsWash ? pressAlpha : hovered ? hoverAlpha : 0
    }
}

/// A finger's press as a band shows it: on after ``ListBands/pressDelay`` held; off on lifting, or the moment the
/// list takes the finger for a scroll — so scrolling never flickers. A finger that stops a glide presses nothing. A
/// tap lifted before the delay still shows the band for as long, once the list has had its word (no scroll), as a
/// tap's ripple would.
nonisolated struct BandPress: Equatable {
    enum Phase: Equatable { case idle, waiting, shown, lifted, flashing }
    private(set) var phase: Phase = .idle

    var showsWash: Bool { phase == .shown || phase == .flashing }

    /// The finger comes down. True: wait the delay, then ``delayElapsed()``. While the list scrolls, nothing.
    mutating func down(scrolling: Bool) -> Bool {
        phase = scrolling ? .idle : .waiting
        return phase == .waiting
    }

    mutating func delayElapsed() {
        if phase == .waiting { phase = .shown }
    }

    /// The finger lifts (or SwiftUI let the press go). True: a tap lifted early — ``confirm()`` once the list has
    /// had its word.
    mutating func up() -> Bool {
        phase = phase == .waiting ? .lifted : .idle
        return phase == .lifted
    }

    /// No scroll came of the early lift: the band shows for the delay's length (then ``flashEnded()``).
    mutating func confirm() -> Bool {
        guard phase == .lifted else { return false }
        phase = .flashing
        return true
    }

    mutating func flashEnded() {
        if phase == .flashing { phase = .idle }
    }

    /// The list began to scroll: whatever was showing, or about to, goes.
    mutating func scrolled() { phase = .idle }
}

/// A row's band as a shape: its own curve on top, `bottom`'s under it, reaching ``ListBands/amp`` past the frame.
nonisolated struct BandShape: Shape {
    let top: String
    let bottom: String

    func path(in rect: CGRect) -> Path {
        guard rect.width > 0, rect.height > 0 else { return Path() }
        return ListBands.region(w: Double(rect.width), h: Double(rect.height), top: top, bottom: bottom)
            .path(offsetX: Double(rect.minX), offsetY: Double(rect.minY))
    }
}

/// A row of a banded list: nothing at rest, the band between its curves washed while pressed or under a pointer.
struct BandWashStyle: ButtonStyle {
    /// The row's own key (its top curve) and the key under it (``ListBands/below(_:after:)``).
    let top: String
    let bottom: String

    func makeBody(configuration: Configuration) -> some View {
        BandWash(label: configuration.label, top: top, bottom: bottom, pressed: configuration.isPressed)
    }
}

private struct BandWash<Label: View>: View {
    let label: Label
    let top: String
    let bottom: String
    let pressed: Bool
    @Environment(\.listScrolling) private var scrolling
    @State private var press = BandPress()
    @State private var hovered = false
    @State private var timer: Task<Void, Never>?

    var body: some View {
        label
            .background {
                let alpha = ListBands.alpha(press: press, hovered: hovered)
                if alpha > 0 {
                    BandShape(top: top, bottom: bottom).fill(Tokens.towardInk.opacity(alpha))
                }
            }
            .onHover { hovered = $0 }
            .onChange(of: pressed) { _, now in now ? pressDown() : lift() }
            .onChange(of: scrolling) { _, now in
                guard now else { return }
                timer?.cancel()
                press.scrolled()
            }
            // Back from the page it opened, the row is at rest.
            .onDisappear {
                timer?.cancel()
                press = BandPress()
                hovered = false
            }
    }

    private func pressDown() {
        timer?.cancel()
        guard press.down(scrolling: scrolling) else { return }
        timer = Task {
            try? await Task.sleep(for: ListBands.pressDelay)
            guard !Task.isCancelled else { return }
            press.delayElapsed()
        }
    }

    private func lift() {
        timer?.cancel()
        guard press.up() else { return }
        timer = Task {
            try? await Task.sleep(for: ListBands.scrollWord)
            guard !Task.isCancelled, press.confirm() else { return }
            try? await Task.sleep(for: ListBands.pressDelay)
            guard !Task.isCancelled else { return }
            press.flashEnded()
        }
    }
}

extension EnvironmentValues {
    /// The tab's list is scrolling (dragged, or gliding on): a band's press holds off (``TabScreen`` says so).
    @Entry var listScrolling = false
}
