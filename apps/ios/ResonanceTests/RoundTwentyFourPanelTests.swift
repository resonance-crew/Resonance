import DesignSystem
import GameController
import SwiftUI
import UIKit
import Testing
@testable import Resonance

/// Round 24, part 3 (the owner's iPad and the Mac): switching between stickers and the keyboard never moves the thread —
/// a panel is exactly what the keyboard covers of the window, and where no on-screen keyboard would stand in its place
/// an iPad opens the Mac's popovers; a wide pane keeps the thread beside the capsule with a panel open; the attach
/// panel is one paper under 圖片, and its line runs on to the rule between the panes.
@MainActor @Suite struct RoundTwentyFourPanelTests {
    // MARK: §A1 — the panel is what the keyboard covers of the window

    @Test func aWindowShortOfTheScreensFootHasThatMuchLessOfTheKeyboardOverIt() {
        // iPadOS's windowed app: the screen 1366 tall, the window's foot 48 above it; a docked keyboard 398 tall.
        let gap = KeyboardCover.windowGap(screenMaxY: 1366, windowMaxY: 1318)
        #expect(gap == 48)
        let keyboardTop: CGFloat = 1366 - 398
        // The panel in its place is what the keyboard covers of the window — trading one for the other moves nothing.
        #expect(KeyboardCover.overWindow(398, gap: gap) == 1318 - keyboardTop)
        #expect(KeyboardCover.overWindow(398, gap: gap) == 350)
    }

    @Test func aWindowAtTheScreensFootTakesTheKeyboardWhole() {
        // Full screen (or a window reaching past the foot, as a sliding one may for a moment): no gap.
        #expect(KeyboardCover.windowGap(screenMaxY: 844, windowMaxY: 844) == 0)
        #expect(KeyboardCover.windowGap(screenMaxY: 844, windowMaxY: 900) == 0)
        #expect(KeyboardCover.overWindow(336, gap: 0) == 336)
        // Never less than nothing: a keyboard wholly under the window's foot covers none of it.
        #expect(KeyboardCover.overWindow(40, gap: 48) == 0)
        #expect(KeyboardCover.overWindow(336, gap: -12) == 336)
    }

    // MARK: §A2 — no keyboard to trade on an iPad: the Mac's popovers

    @Test func anIPadWithNoKeyboardToTradeOpensThePopovers() {
        func opens(_ device: ComposerOpens.Device, width: CGFloat = 1024, hardware: Bool = false, floats: Bool = false,
                   docked: CGFloat = 0, remembered: CGFloat = 398, gap: CGFloat = 0) -> ComposerOpens {
            ComposerOpens.at(device: device, windowWidth: width, hardwareKeyboard: hardware, keyboardFloats: floats,
                             dockedHeight: docked, keyboardHeight: remembered, windowGap: gap)
        }
        // The Mac: always the popovers, whatever its keyboard.
        #expect(opens(.mac) == .popover)
        #expect(opens(.mac, width: 400) == .popover)
        // An iPad with a hardware keyboard (the owner's simulator), a floating or split keyboard, or only the shortcut
        // strip docked: no keyboard would stand where a panel would rise — the popovers.
        #expect(opens(.pad, hardware: true) == .popover)
        #expect(opens(.pad, floats: true) == .popover)
        #expect(opens(.pad, docked: 55) == .popover)
        #expect(opens(.pad, docked: KeyboardHeightMemory.smallest - 1) == .popover)
        // An iPad with its keyboard docked: a panel takes the keyboard's place — and with none up at all, a panel too.
        #expect(opens(.pad, docked: 398) == .panel)
        #expect(opens(.pad, docked: ComposerPanels.least) == .panel)
        #expect(opens(.pad) == .panel)
        // An iPad window too narrow for a popover beside the capsule keeps its panel.
        #expect(opens(.pad, width: ComposerOpens.popoverWindowMin - 1, hardware: true) == .panel)
        #expect(opens(.pad, width: ComposerOpens.popoverWindowMin, hardware: true) == .popover)
        // A phone keeps its panel in every case.
        #expect(opens(.phone, hardware: true) == .panel)
        #expect(opens(.phone, floats: true) == .panel)
        #expect(opens(.phone, width: 932, docked: 55) == .panel)
        #expect(opens(.phone, docked: 336, gap: 300) == .panel)
    }

    @Test func aWindowTheKeyboardCoversTooLittleOfOpensThePopovers() {
        func opens(docked: CGFloat = 0, remembered: CGFloat = 398, gap: CGFloat, width: CGFloat = 1024) -> ComposerOpens {
            ComposerOpens.at(device: .pad, windowWidth: width, hardwareKeyboard: false, keyboardFloats: false,
                             dockedHeight: docked, keyboardHeight: remembered, windowGap: gap)
        }
        // iPadOS's windowed app, its foot 48 over the screen's: the keyboard covers 350 of it — a panel of exactly that.
        #expect(opens(docked: 398, gap: 48) == .panel)
        #expect(opens(gap: 48) == .panel)
        // A window placed high (Stage Manager): the docked keyboard — or, none up, the one the field would raise — covers
        // less of it than a panel's least. The panel would stand taller than what it trades for and move the composer.
        #expect(opens(docked: 398, gap: 300) == .popover)
        #expect(opens(gap: 300) == .popover)
        #expect(opens(docked: 398, gap: 420) == .popover)
        // At the edge: covering a panel's least exactly is a trade; a point short of it is not.
        #expect(opens(docked: 398, gap: 398 - ComposerPanels.least) == .panel)
        #expect(opens(docked: 398, gap: 398 - ComposerPanels.least + 1) == .popover)
        // A panel's least is the least ``ThreadScreen`` lays a panel out at.
        #expect(ComposerPanels.least == 160)
        // Too narrow for a popover: the panel, whatever it covers.
        #expect(opens(docked: 398, gap: 300, width: ComposerOpens.popoverWindowMin - 1) == .panel)
    }

    @Test func aHardwareKeyboardIsKeptFromGameControllersNoticesNotAskedAtTheTap() async {
        HardwareKeyboard.watch()
        let center = NotificationCenter.default
        // Put back as GameController has it, for whatever runs next.
        defer { center.post(name: GCKeyboard.coalesced != nil ? .GCKeyboardDidConnect : .GCKeyboardDidDisconnect, object: nil) }
        center.post(name: .GCKeyboardDidConnect, object: nil)
        #expect(await eventually { HardwareKeyboard.connected })
        center.post(name: .GCKeyboardDidDisconnect, object: nil)
        #expect(await eventually { !HardwareKeyboard.connected })
    }

    // MARK: §B — a wide pane keeps the thread beside the capsule with a panel open

    @Test func aWidePanesFootLooksTheSameWithAPanelOpenAsWithout() {
        let capsulePart: CGFloat = ComposerMetrics.height + ComposerMetrics.bottomGap
        let without = ThreadFootPapers.of(listWidth: 900, capsulePart: capsulePart, panel: .none, tab: .pictures)
        let expected = ComposerBacking.Wide(footHeight: capsulePart, capsuleWidth: ComposerMetrics.maxWidth - ComposerMetrics.gutter * 2,
                                            columnTop: ComposerMetrics.height / 2)
        #expect(without.wide == expected)
        for panel in [ComposerPanel.stickers, .attach] {
            for tab in [AttachTab.pictures, .cards] {
                // Clear beside the capsule, its fade ending on the capsule's part of the foot — where the panel begins.
                let open = ThreadFootPapers.of(listWidth: 900, capsulePart: capsulePart, panel: panel, tab: tab)
                #expect(open.wide == expected)
                #expect(open.wide?.footHeight == capsulePart)
            }
        }
    }

    /// What ``ThreadScreen`` reads its `footHeight` from: the capsule's part of the foot, laid over a panel — measured
    /// without the panel. Counted with it, a wide pane's fade would sink to the panel's foot, the panel with no paper under
    /// it and the thread showing through the sticker panel.
    @Test func theFootMeasuresItsCapsulesPartApartFromThePanelUnderIt() async throws {
        final class Seen { var height: CGFloat? }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let capsule: CGFloat = 98
        for panel in [false, true] {
            let seen = Seen()
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 1024, height: 768)
            window.rootViewController = UIHostingController(rootView: VStack(spacing: 0) {
                Spacer(minLength: 0)
                ThreadFootStack(onCapsulePart: { seen.height = $0 }) {
                    Color.red.frame(height: capsule)
                } panel: {
                    if panel { Color.blue.frame(height: 320) }
                }
            })
            window.makeKeyAndVisible()
            defer { window.isHidden = true }
            #expect(await eventually { seen.height != nil }, "panel: \(panel)")
            let measured = try #require(seen.height)
            #expect(measured == capsule + ComposerMetrics.bottomGap, "panel: \(panel)")
            // So the wide pane's fade ends on the capsule's part, where the panel begins.
            let papers = ThreadFootPapers.of(listWidth: 1024, capsulePart: measured, panel: panel ? .stickers : .none, tab: .pictures)
            #expect(papers.wide?.footHeight == capsule + ComposerMetrics.bottomGap)
        }
    }

    @Test func aPaneTheCapsuleFillsKeepsThePaperAcrossIt() {
        for panel in [ComposerPanel.none, .stickers, .attach] {
            #expect(ThreadFootPapers.of(listWidth: 390, capsulePart: 56, panel: panel, tab: .pictures).wide == nil)
            #expect(ThreadFootPapers.of(listWidth: ComposerMetrics.maxWidth, capsulePart: 56, panel: panel, tab: .cards).wide == nil)
        }
    }

    // MARK: §C1 — the attach panel is one paper

    @Test func underPicturesTheAttachPanelsPaperIsThePickersOwn() {
        #expect(AttachPaper.of(.pictures) == .picker)
        #expect(AttachPaper.of(.cards) == .foot)
        #expect(AttachPaper.picker.color != nil)
        // Under 卡片 the panel lays nothing of its own: the foot's cream goes on under it.
        #expect(AttachPaper.foot.color == nil)
        #expect(ThreadFootPapers.of(listWidth: 900, capsulePart: 56, panel: .attach, tab: .pictures).panel == .picker)
        #expect(ThreadFootPapers.of(listWidth: 390, capsulePart: 56, panel: .attach, tab: .pictures).panel == .picker)
        #expect(ThreadFootPapers.of(listWidth: 900, capsulePart: 56, panel: .attach, tab: .cards).panel == .foot)
        // The sticker panel keeps the foot's paper, whichever tab the attach panel was left on.
        #expect(ThreadFootPapers.of(listWidth: 900, capsulePart: 56, panel: .stickers, tab: .pictures).panel == .foot)
        #expect(ThreadFootPapers.of(listWidth: 900, capsulePart: 56, panel: .none, tab: .pictures).panel == .foot)
    }

    /// The picker's paper begins on the grip's pen line: nothing of it above the line (laid from the panel's top edge, a
    /// straight strip of white — black by night — showed over the hand-drawn line on the cream), nothing of the cream
    /// between the line and it.
    @Test func thePickersPaperBeginsOnTheGripsPenLine() throws {
        let rect = CGRect(x: 0, y: 0, width: 858, height: 400)
        let paper = AttachPaperShape().path(in: rect)
        let pen = AttachPanelLine.shape.path(in: CGRect(x: 0, y: 0, width: rect.width, height: AttachPanelLine.frameHeight))
            .strokedPath(StrokeStyle(lineWidth: Tokens.ink, lineCap: .round))
        let straight = Path(rect)
        var straightShowed = false
        for x in stride(from: 1.0, through: rect.width - 1, by: 5) {
            let column = stride(from: 0.0, through: 16, by: 0.05).map { CGPoint(x: x, y: $0) }
            let inked = column.filter { pen.contains($0) }
            let top = try #require(inked.first).y, bottom = try #require(inked.last).y
            #expect(column.filter { $0.y < top }.allSatisfy { !paper.contains($0) }, "x \(x): paper over the line")
            #expect(column.filter { $0.y > bottom }.allSatisfy { paper.contains($0) }, "x \(x): cream under the line")
            if column.contains(where: { $0.y < top && straight.contains($0) }) { straightShowed = true }
        }
        // As it was: the paper's straight top edge showed over the line.
        #expect(straightShowed)
    }

    @Test func thePickersPaperIsSystemBackgroundByDayAndByNight() {
        func rgba(_ color: UIColor) -> [CGFloat] {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: &a)
            return [r, g, b, a]
        }
        let picker = UIColor(AttachPaper.pickerPaper)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let drawn = rgba(picker.resolvedColor(with: traits)), system = rgba(UIColor.systemBackground.resolvedColor(with: traits))
            #expect(zip(drawn, system).allSatisfy { abs($0 - $1) < 0.002 })
        }
        // White by day, and never the day's white by night.
        #expect(rgba(picker.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))).prefix(3).allSatisfy { $0 > 0.99 })
        #expect(rgba(picker.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))).prefix(3).allSatisfy { $0 < 0.2 })
    }

    // MARK: §D2 — the picker inside the attach popover's pen line

    /// The photo picker is out of the app's process: no clip reliably trims it, and it may draw square corners. Its rect
    /// stays inside the sheet's outline and clear of the pen line all round — its corners too, where the sheet's corners
    /// (radius 26, ± 7 %) bow in.
    @Test func theAttachPopoversPickerNeverReachesItsPenLineSquareCornersIncluded() {
        let size = MacComposerPopover<EmptyView>.size(.attach)
        let picker = ComposerPopoverMetrics.pickerRect(in: size)
        // Where AttachPanel lays it: inside the sheet's content, padded by the insets.
        let insets = ComposerPopoverMetrics.pickerInsets
        #expect(picker.minY == ComposerPopoverMetrics.contentTop + insets.top)
        #expect(picker.maxY == size.height - ComposerPopoverMetrics.contentBottom - insets.bottom)
        #expect(picker.minX == insets.leading && picker.maxX == size.width - insets.trailing)
        func outline(_ r: CGRect) -> [CGPoint] {
            let xs = stride(from: r.minX, through: r.maxX, by: 0.5), ys = stride(from: r.minY, through: r.maxY, by: 0.5)
            return xs.flatMap { [CGPoint(x: $0, y: r.minY), CGPoint(x: $0, y: r.maxY)] }
                + ys.flatMap { [CGPoint(x: r.minX, y: $0), CGPoint(x: r.maxX, y: $0)] }
        }
        func clear(_ r: CGRect, seed: Double) -> Bool {
            let sheet = MenuSheetShape(seed: seed).path(in: CGRect(origin: .zero, size: size))
            let pen = sheet.strokedPath(ComposerPopoverMetrics.pen)
            return outline(r).allSatisfy { sheet.contains($0) && !pen.contains($0) }
        }
        let seed = MacComposerPopover<EmptyView>.sheet(.attach).seed
        #expect(clear(picker, seed: seed))
        // Not one sheet's luck: any seed's wobble and corners keep clear of it.
        for other in stride(from: 1.0, through: 40, by: 1) { #expect(clear(picker, seed: other), "seed \(other)") }
        // The 6 at its sides it had (8 over it, 10 under it) ran its square corners across the line.
        let six = CGRect(x: 6, y: ComposerPopoverMetrics.contentTop, width: size.width - 12,
                         height: size.height - ComposerPopoverMetrics.contentTop - ComposerPopoverMetrics.contentBottom)
        #expect(!clear(six, seed: seed))
    }

    // MARK: §C2 — the attach panel's line runs on to the rule

    @Test func whatRunsOnToTheRuleIsCutOnTheRulesOwnCurve() {
        // ``PaneLines``' box in the thread screen's space (8 up under the header, down to the window's foot), and a panel
        // laid ``PaneLines/gutter`` before its column — from the detail pane's leading edge — 600 down.
        let box = CGRect(x: 0, y: -PaneLines.tuck, width: 760, height: 1032)
        let rule = PaneRuleBox(box: box, space: "thread.screen")
        let panel = CGRect(x: 0, y: 600, width: 760, height: 432)
        let trailing = rule.trailing(of: panel)
        let curve = PaneRuleGeometry(height: Double(box.height))
        for localY in [0.0, 3, 14, 120, 300, 431] {
            let x = CGFloat(curve.x(at: Double(panel.minY - box.minY) + localY))
            // Past the rule's centre line it is drawn; short of it — the list's side of the gutter — never.
            #expect(trailing.contains(CGPoint(x: x + 0.5, y: localY)))
            #expect(!trailing.contains(CGPoint(x: x - 0.5, y: localY)))
            #expect(x > 8 && x < PaneLines.gutter - 8)
        }
        // Out to the pane's trailing edge.
        #expect(trailing.contains(CGPoint(x: 759, y: 10)))
    }
}
