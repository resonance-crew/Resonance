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
}
