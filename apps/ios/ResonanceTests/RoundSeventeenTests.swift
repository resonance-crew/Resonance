import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 17 (2026-10-27, the owner's review of round 16 on an iPad): one menu sheet everywhere, the press
/// layer dimming the thread's body alone with its reactions floating, the tag pills in the tonal face and
/// a Return that keeps the field, the link editor as a modal with 連結 last on the format bar, the phone's
/// tab bar lower and in a stronger pen, and the split's publish step with one back.
@MainActor @Suite struct RoundSeventeenMenuTests {
    private func item(_ title: String) -> OrganicMenuItem {
        OrganicMenuItem(id: title, title: title, icon: .flag) {}
    }

    @Test func theSheetIsItsRowsWithSixAboveAndBelowOrTheTimesLine() {
        // Rows 44; 6 of paper over the first and under the last.
        #expect(MenuSheetMetrics.row == 44)
        #expect(MenuSheetMetrics.height(rows: 5) == CGFloat(232))
        // With the time: its 24 line right under the last row, then 10.
        #expect(MenuSheetMetrics.height(rows: 3, footer: true) == CGFloat(172))
        #expect(PressMetrics.listHeight(rows: 3, footer: true) == MenuSheetMetrics.height(rows: 3, footer: true))
    }

    @Test func theSheetIsAsWideAsItsLongestRowAndTwentyEitherSide() {
        // Two short rows: 168, so they still read as a sheet rather than a blob.
        let short = OrganicMenuPanel.width([item("圖片"), item("卡片")])
        #expect(short == MenuSheetMetrics.minWidth && short == 168)
        // A held message's actions keep the press layer's 216 to 280.
        #expect(OrganicMenuPanel.width([item("回覆"), item("複製")], footer: "下午8:33", widths: MenuSheetMetrics.pressWidths) == 216)
        #expect(OrganicMenuPanel.width([item(String(repeating: "很長", count: 30))], widths: MenuSheetMetrics.pressWidths) == 280)
        // The glyph 17, 12, the words, and 20 at each end, once that is more.
        let long = OrganicMenuPanel.width([item("封鎖"), item("Report this conversation to us")])
        #expect(long > short)
        // A footer longer than the rows widens it; no button's menu is wider than 300.
        #expect(OrganicMenuPanel.width([item("封鎖")], footer: "Tuesday, 27 October 2026 at 8:33 in the evening") > short)
        #expect(OrganicMenuPanel.width([item(String(repeating: "很長的選項", count: 20))]) == MenuSheetMetrics.maxWidth)
        #expect(MenuSheetMetrics.maxWidth == 300)
        #expect(MenuSheetMetrics.padX == 20 && MenuSheetMetrics.gap == 12 && MenuSheetMetrics.glyph == 17)
    }

    @Test func theGrainIsLaidPastTheWobble() {
        // The wobble swings past the box: the grain covers it all (the strip at the top edge, round 17 §1).
        #expect(MenuSheetMetrics.grainOverflow >= 6)
    }

    @Test func theSheetsShadowIsWarmByDayAndDeepAtNight() {
        func alpha(_ color: Color, _ style: UIUserInterfaceStyle) -> CGFloat {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style)).getRed(&r, green: &g, blue: &b, alpha: &a)
            return a
        }
        #expect(abs(alpha(SheetShadow.far, .light) - 0.16) < 0.005)
        #expect(abs(alpha(SheetShadow.near, .light) - 0.10) < 0.005)
        #expect(abs(alpha(SheetShadow.far, .dark) - 0.45) < 0.005)
        #expect(alpha(SheetShadow.near, .dark) < 0.005)
        // CSS 0 8 24 / 0 1 3 by day, 0 10 28 at night: a layer's radius is half the blur.
        #expect(SheetShadow.far(dark: false) == (12, 8))
        #expect(SheetShadow.far(dark: true) == (14, 10))
        #expect(SheetShadow.nearRadius == 1.5 && SheetShadow.nearY == 1)
    }
}

@MainActor @Suite struct RoundSeventeenPressTests {
    @Test func theTrayAndTheListStayTwelveUnderTheHeader() {
        // The header's foot at 120: a message just under it glides down until the tray is 12 under it.
        let frame = CGRect(x: 60, y: 130, width: 200, height: 44)
        let list = PressMetrics.listHeight(rows: 3, footer: true)
        let place = PressPlacement.of(frame: frame, top: 120, bottom: 840, tray: true, listHeight: list)
        #expect(place.trayY == 132)
        #expect(place.shift == CGFloat(54))
    }

    @Test func besideTheListTheSheetsKeepClearOfTheRule() {
        // Two panes: the region starts at the rule's gutter (24 into the pane); a sheet never comes nearer than 12.
        let theirs = CGRect(x: 30, y: 300, width: 120, height: 44)
        #expect(PressPlacement.x(width: 220, frame: theirs, mine: false, leading: 24, trailing: 700) == 36)
        // Your own: its right edge on the message's, and 12 from the window's side.
        let mine = CGRect(x: 500, y: 300, width: 190, height: 44)
        #expect(PressPlacement.x(width: 220, frame: mine, mine: true, leading: 24, trailing: 720) == 470)
        #expect(PressPlacement.x(width: 220, frame: mine, mine: true, leading: 24, trailing: 700) == 468)
    }

    @Test func theChosenReactionKeepsItsOpaqueDisc() {
        var a: CGFloat = 0, r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
        for style in [UIUserInterfaceStyle.light, .dark] {
            UIColor(PressSheet.chosenDisc).resolvedColor(with: UITraitCollection(userInterfaceStyle: style)).getRed(&r, green: &g, blue: &b, alpha: &a)
            #expect(a == 1)
        }
    }
}

@MainActor @Suite struct RoundSeventeenTagTests {
    @Test func aChosenTagWearsTheSuggestSegmentsFace() {
        #expect(TagField<EmptyView>.pillFill == Tokens.buttonTonal)
        #expect(TagField<EmptyView>.pillInk == Tokens.buttonOnTonal)
    }

    @Test func returnAddsTheWordAndKeepsTheField() {
        // Return typed at the end (or in the middle) of the word: the word as it was, to be added.
        #expect(TagInput.returned("散步\n", before: "散步")! == ("散步", true))
        #expect(TagInput.returned("散\n步", before: "散步")! == ("散步", true))
        // Lines pasted in: each a tag, as commas part them; the last one left to type on.
        #expect(TagInput.returned("雨\n散步\n", before: "")! == ("雨,散步", false))
        #expect(TagInput.split("雨,散步").words == ["雨"])
        // No line break: nothing to do.
        #expect(TagInput.returned("散步", before: "散") == nil)
    }
}

@MainActor @Suite struct RoundSeventeenLinkTests {
    @Test func theLinkToolIsLastOnTheFormatBar() {
        #expect(StoryFormatBar.toolOrder.last == "link")
        #expect(StoryFormatBar.toolOrder == ["image", "card", "bold", "italic", "h2", "h3", "quote", "bullets", "numbers", "link"])
    }

    @Test func theLinkEditorNamesWhatItDoesAndOffersRemoveOnlyForALink() {
        let new = StoryLinkRequest.of(link: nil, canCard: true, caret: true)
        #expect(StoryLinkModal.title(new) == L10n.Write.Editor.insertLink)
        #expect(!StoryLinkModal.offersRemove(new))
        let existing = StoryLinkRequest.card("https://example.com/rain")
        #expect(StoryLinkModal.title(existing) == L10n.Write.Editor.linkEdit)
        #expect(StoryLinkModal.offersRemove(existing))
        #expect(StoryLinkModal.Metrics.maxWidth == 400)
    }
}

@MainActor @Suite struct RoundSeventeenTabBarTests {
    @Test func theBarSitsSoItsRowsMiddleIsFortyTwoOverTheFoot() {
        // An iPhone's 34 of home indicator: the 52 row lowered 18 into it, its middle 42 over the screen's foot.
        let lowered = OrganicTabBar<AppTab>.lowered(bottomInset: 34)
        #expect(lowered == 18)
        #expect(34 - lowered + OrganicTabBar<AppTab>.height / 2 == 42)
        // No home indicator (a Home button): where it was.
        #expect(OrganicTabBar<AppTab>.lowered(bottomInset: 0) == 0)
        // The toast keeps its 12 over the bar, wherever the bar stands.
        #expect(ToastPlacement.bottom(.compact, tabBar: true, lowered: 18)
                == OrganicTabBar<AppTab>.height + HeaderEdge.height + 12 - 18)
    }

    @Test func oneStrongPenForTheWholeBar() {
        #expect(OrganicTabBar<AppTab>.outlinePen == Tokens.inkStrong)
        #expect(Tokens.inkStrong == 2.2)
    }
}

@MainActor @Suite struct RoundSeventeenWriterTests {
    @Test func theBarsSecondLineGrowsWithTheText() {
        // At the default size the box is 12 on a 1.4 line, and the title stands down half of it and its gap alone.
        #expect(BarTitles.titleOffset(subtitle: nil, line: 21) == 11)
        #expect(BarTitles.titleOffset(subtitle: "已儲存", line: 21) == 0)
        #expect(BarTitles.scaledSubtitleLine >= BarTitles.subtitleLine - 0.001)
    }

    @Test func thePaneKnowsItsStepAndForgetsItWithItsCard() {
        // The workspace's one back reads it (round 17 §9): the Leave over the map steps back to writing.
        let pane = WritePane()
        #expect(!pane.publishing)
        pane.publishing = true
        pane.clear()
        #expect(!pane.publishing)
    }
}
