import DesignSystem
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A toast's clock the test runs by hand: each wait is asked for, and ends when the test says.
actor ToastSleeps {
    private(set) var asked: [Duration] = []
    private var waiting: [CheckedContinuation<Void, Never>?] = []

    func sleep(_ duration: Duration) async {
        asked.append(duration)
        await withCheckedContinuation { waiting.append($0) }
    }

    /// Ends the `index`th wait asked for (the toast it timed goes, if it is still the one showing).
    func end(_ index: Int) {
        waiting[index]?.resume()
        waiting[index] = nil
    }
}

/// The app's one toast (trash.spec §5.2, §6 — the web's ToastProvider): one at a time, a new one in
/// the old one's place; 4 s for a word, 8 s with an action, 16 s for whoever reads the screen with
/// VoiceOver or Switch Control; said aloud as it comes; its action run once.
@MainActor @Suite struct ToastTests {
    final class Spoken { var said: [String] = [] }

    func center(_ sleeps: ToastSleeps, assistive: Bool = false, spoken: Spoken = Spoken()) -> ToastCenter {
        ToastCenter(sleep: { await sleeps.sleep($0) }, assistive: { assistive }, announce: { spoken.said.append($0) })
    }

    @Test func aWordStaysFourSecondsIsSaidAloudAndGoes() async {
        let sleeps = ToastSleeps()
        let spoken = Spoken()
        let toasts = center(sleeps, spoken: spoken)
        toasts.show("已還原")
        #expect(toasts.current?.message == "已還原")
        #expect(toasts.current?.action == nil)
        #expect(spoken.said == ["已還原"])
        #expect(await eventually { await sleeps.asked == [.seconds(4)] })
        await sleeps.end(0)
        #expect(await eventually { toasts.current == nil })
    }

    @Test func anUndoStaysEightSecondsSaysWhatItActsOnAndRunsOnce() async {
        let sleeps = ToastSleeps()
        let spoken = Spoken()
        let toasts = center(sleeps, spoken: spoken)
        var undone = 0
        toasts.show("已移到垃圾桶", announcement: "〈外婆的醬油瓶〉已移到垃圾桶",
                    action: .init(label: "復原", accessibilityLabel: "已移到垃圾桶 · 復原〈外婆的醬油瓶〉", icon: .restore) { undone += 1 })
        // Said as the card it moved, not as the pill's two words.
        #expect(spoken.said == ["〈外婆的醬油瓶〉已移到垃圾桶"])
        #expect(toasts.current?.duration == .seconds(8))
        #expect(await eventually { await sleeps.asked == [.seconds(8)] })
        toasts.act()
        // The toast goes first, then the action runs — once, however often it is tapped.
        #expect(toasts.current == nil)
        #expect(undone == 1)
        toasts.act()
        #expect(undone == 1)
    }

    @Test func voiceOverAndSwitchControlKeepEveryToastSixteenSeconds() async {
        let sleeps = ToastSleeps()
        let toasts = center(sleeps, assistive: true)
        toasts.show("已還原")
        toasts.show("已移到垃圾桶", action: .init(label: "復原", accessibilityLabel: "復原") {})
        #expect(await eventually { await sleeps.asked == [.seconds(16), .seconds(16)] })
        #expect(ToastCenter.duration(action: false, assistive: false) == .seconds(4))
        #expect(ToastCenter.duration(action: true, assistive: false) == .seconds(8))
    }

    @Test func aNewToastTakesTheOldOnesPlaceAndTheOldOnesTimeNoLongerCounts() async {
        let sleeps = ToastSleeps()
        let toasts = center(sleeps)
        let first = toasts.show("已移到垃圾桶", action: .init(label: "復原", accessibilityLabel: "復原") {})
        let second = toasts.show("已永久刪除")
        #expect(first != second)
        #expect(toasts.current?.id == second)
        #expect(await eventually { await sleeps.asked.count == 2 })
        // The first toast's time running out takes nothing down: the second is showing.
        await sleeps.end(0)
        try? await Task.sleep(for: .milliseconds(50))
        #expect(toasts.current?.id == second)
        // Asked to take the first one down, nothing goes either; the second goes when asked.
        toasts.dismiss(first)
        #expect(toasts.current?.id == second)
        toasts.dismiss(second)
        #expect(toasts.current == nil)
        // A toast with no action does nothing when acted on.
        toasts.show("已還原")
        toasts.act()
        #expect(toasts.current?.message == "已還原")
        toasts.dismiss()
        #expect(toasts.current == nil)
    }

    /// The pill keeps the thread's tuned recipe (`.small`, unchanged) and grows a toast's size.
    @Test func thePillsTwoSizes() {
        let small = OrganicPill.Metrics.of(.small)
        #expect(small.fontSize == 12.5 && small.horizontalPadding == 16 && small.verticalPadding == 9)
        #expect(small.minHeight == 0 && small.glyph == 14 && small.gap == 6 && small.lines == nil)
        let toast = OrganicPill.Metrics.of(.toast)
        #expect(toast.fontSize == 14 && toast.horizontalPadding == 20 && toast.verticalPadding == 12)
        #expect(toast.minHeight == 44 && toast.glyph == 16 && toast.gap == 8 && toast.lines == 2)
    }

    @Test func aToastIsAtLeastATouchTallAndAtMostTwoLines() throws {
        func height(_ text: String, width: CGFloat = 300) throws -> CGFloat {
            let renderer = ImageRenderer(content: OrganicPill(icon: .restore, text: text, verb: "復原", size: .toast) {}
                .frame(width: width))
            renderer.scale = 1
            return try #require(renderer.uiImage).size.height
        }
        #expect(try height("已還原") >= 44)
        let long = try height(String(repeating: "這張卡片已經不在垃圾桶裡", count: 6))
        #expect(long > 44)
        // Two lines of 14pt words and the pill's 12 above and below, never a third line.
        let twoLines: CGFloat = 12 * 2 + 14 * 1.25 * 1.4 * 2 + 4
        #expect(long < twoLines)
    }

    /// Over a phone's tab bar on a tab's root, over the home indicator on a pushed page, and up from
    /// the window's foot on a tablet (no tab bar there).
    @Test func theToastSitsClearOfTheBarUnderIt() {
        #expect(ToastPlacement.bottom(.compact, tabBar: true) == OrganicTabBar<AppTab>.height + HeaderEdge.height + 12)
        #expect(ToastPlacement.bottom(.compact, tabBar: false) == 16)
        #expect(ToastPlacement.bottom(.medium, tabBar: false) == 24)
        #expect(ToastPlacement.bottom(.expanded, tabBar: false) == 24)
        #expect(ToastHost.maxWidth == 440 && ToastHost.sideMargin == 16)
    }
}
