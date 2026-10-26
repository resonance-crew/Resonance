import DesignSystem
import Foundation
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// What spares the app work on every update, without changing what it draws: the route action every
/// page reads counts as the same for the same tab, a thread's row is told only its own marks, and
/// formatters, faces, colours, the editor's page and a card's story are made once — each the very
/// thing that was made every time before.
@MainActor @Suite struct RedrawCostTests {
    @Test func aTabsRouteActionIsTheSameWhateverClosuresItWasMadeWith() {
        let feed = OpenRouteAction(tab: .feed, push: { _ in })
        #expect(feed == OpenRouteAction(tab: .feed, push: { _ in }, popToRoot: {}, replaceTop: { _ in }))
        #expect(feed != OpenRouteAction(tab: .messages, push: { _ in }))
        #expect(OpenRouteAction(push: { _ in }) == OpenRouteAction(push: { _ in }))
    }

    @Test func aRowsMarksAreItsOwnAlone() {
        let words = NSRange(location: 0, length: 3)
        let hits = ["m1": [words], "m2": [NSRange(location: 4, length: 2)]]
        let marks = RowMarks(id: "m1", key: "k1", highlights: hits, currentHit: "m2", lifted: "k2")
        // Another message found, looked at or lifted: this row's marks are as they were.
        #expect(marks == RowMarks(id: "m1", key: "k1", highlights: ["m1": [words]], currentHit: "m3", lifted: nil))
        // Its own words found no more, it is the hit looked at, it is lifted: they changed.
        #expect(marks != RowMarks(id: "m1", key: "k1", highlights: [:], currentHit: "m2", lifted: "k2"))
        #expect(marks != RowMarks(id: "m1", key: "k1", highlights: hits, currentHit: "m1", lifted: "k2"))
        #expect(marks != RowMarks(id: "m1", key: "k1", highlights: hits, currentHit: "m2", lifted: "k1"))
    }

    @Test func aTimeLabelsFormatterIsMadeOncePerPatternAndLanguage() {
        let zh = ThreadScreen.formatter("a h:mm", .zhTW)
        #expect(ThreadScreen.formatter("a h:mm", .zhTW) === zh)
        #expect(ThreadScreen.formatter("a h:mm", .en) !== zh)
        #expect(ThreadScreen.formatter("h:mm a", .zhTW) !== zh)
        #expect(zh.locale.identifier == "zh-Hant-TW")
        #expect(zh.timeZone == TimeZone.current)
        #expect(zh.dateFormat == "a h:mm")
    }

    @Test func aFaceIsMatchedOnceAndIsTheFaceAskedFor() {
        let body = AppFonts.uiFont(.body, size: 15)
        #expect(AppFonts.uiFont(.body, size: 15) === body)
        for other in [AppFonts.uiFont(.body, size: 15, weight: .bold), AppFonts.uiFont(.body, size: 15, oblique: true),
                      AppFonts.uiFont(.body, size: 15, lining: true), AppFonts.uiFont(.heading, size: 15),
                      AppFonts.uiFont(.body, size: 16)] {
            #expect(other !== body)
        }
        // The face Core Text matches for the family and weight.
        let matched = UIFont(descriptor: UIFontDescriptor(fontAttributes: [
            .family: AppFonts.Family.body.rawValue, .traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.regular],
        ]), size: 15)
        #expect(body.fontName == matched.fontName)
        #expect(body.pointSize == 15)
        #expect(AppFonts.uiFont(.body, size: 15, weight: .bold).fontName != body.fontName)
        #expect(AppFonts.body(13) == AppFonts.body(13))
    }

    @Test func theTextSizeFactorIsTheSystemsAsBefore() {
        let category = UIApplication.shared.preferredContentSizeCategory
        for style in [UIFont.TextStyle.body, .title1, .caption1] {
            #expect(TextScale.factor(relativeTo: style) == TextScale.effective(system: TextScale.system(relativeTo: style, in: category)))
            #expect(TextScale.readingFactor(relativeTo: style) == TextScale.reading(system: TextScale.system(relativeTo: style, in: category)))
        }
    }

    @Test func aCardFamilysColoursAreTheOnesItsCSSSays() {
        for (index, hue) in CardPalette.hues.enumerated() {
            let palette = CardPalette(index: index)
            #expect(palette.interior == OKLCHColor.parse("oklch(97.5% 0.012 \(hue))"))
            #expect(palette.hovered == OKLCHColor.parse("oklch(92.5% 0.024 \(hue))"))
            #expect(palette.separator == OKLCHColor.parse("oklch(55% 0.04 \(hue) / 0.4)"))
            #expect(palette.noteInk == OKLCHColor.parse("oklch(44% 0.08 \(hue))"))
        }
    }

    @Test func aColourStringReadsTheSameEveryTime() {
        #expect(OKLCHColor.parse("oklch(90% 0.05 60)") == OKLCHColor.color(0.9, 0.05, 60))
        #expect(OKLCHColor.parse("oklch(90% 0.05 60)") == OKLCHColor.color(0.9, 0.05, 60))
        #expect(OKLCHColor.parse("oklch(0.55 0.04 18 / 0.4)") == OKLCHColor.color(0.55, 0.04, 18, alpha: 0.4))
        #expect(OKLCHColor.parse("not a colour") == nil)
        #expect(OKLCHColor.parse("not a colour") == nil)
    }

    @Test func aStoryIsReadOffTheMainThreadAsItWasOnIt() async {
        let title = "雨後", story = "## 一\n\n去 https://example.com/a 看看。\n\n### 二\n\n走路。"
        let read = await Task.detached { CardModel.read(title: title, story: story) }.value
        #expect(read.type == ScriptRule.storyType(title: title, story: story))
        #expect(read.blocks == StoryBlock.linkingAddresses(StoryParser.parse(story)) { words in
            ChatLinks.links(in: words).map { (range: $0.range, url: $0.url.absoluteString) }
        })
        #expect(read.toc.map(\.text) == ["一", "二"])
        #expect(read.toc.map(\.level) == [2, 3])
    }
}
