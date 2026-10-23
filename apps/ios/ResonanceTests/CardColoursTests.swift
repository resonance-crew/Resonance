import DesignSystem
import Foundation
import Testing

/// No two neighbouring cards share a colour family (round 5 B3): the web's `cardPalettes`
/// (src/lib/design/cardColours.ts) as pinned by native/fixtures/card-colours.json, which the web
/// and Android run too — same list, same colours, on every platform.
@Suite struct CardColoursTests {
    struct Fixture: Decodable {
        struct Case: Decodable {
            let id: String
            let accentHues: [Double?]
            let palettes: [Int]
            let pages: [Int]?
            let columns: Int?
        }
        let hues: [Double]
        let window: Int
        let order: [[Int]]
        let cases: [Case]
    }

    static let fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/card-colours.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    @Test func theTablesAreTheWebs() {
        #expect(CardPalette.hues == Self.fixture.hues)
        #expect(CardPalette.window == Self.fixture.window)
        #expect(CardPalette.order == Self.fixture.order)
    }

    @Test(arguments: CardColoursTests.fixture.cases.map(\.id))
    func everyCaseColoursAsTheWeb(_ id: String) throws {
        let c = try #require(Self.fixture.cases.first { $0.id == id })
        let got = CardPalette.palettes(c.accentHues)
        #expect(got == c.palettes, "case \(id)")
        // No four in a row share a family: one, two and three columns keep neighbours apart.
        for i in got.indices {
            for j in max(0, i - CardPalette.window)..<i { #expect(got[i] != got[j], "case \(id) at \(i)") }
        }
        // Pages loaded one after another: every prefix colours as the whole list (nothing recoloured).
        if let pages = c.pages {
            var end = 0
            for page in pages {
                end += page
                #expect(CardPalette.palettes(Array(c.accentHues.prefix(end))) == Array(c.palettes.prefix(end)), "case \(id) to \(end)")
            }
        }
        // As a row-major grid: no row shares a family, nor a card and the one above it.
        if let n = c.columns {
            for i in got.indices {
                if i % n > 0 { #expect(got[i] != got[i - 1]) }
                if i >= n { #expect(got[i] != got[i - n]) }
            }
        }
    }

    @Test func aCardDrawnByItsFamilyWearsThatFamily() {
        for family in 0..<6 {
            #expect(CardPalette(index: family).hue == CardPalette.hues[family])
        }
        // Without a list, a card keeps its own preference: the cover's nearest family, else its position's.
        #expect(CardPalette(accentHue: 215, position: 3).index == 4)
        #expect(CardPalette(accentHue: nil, position: 7).index == 1)
    }

    /// Cards put on top of a list already shown (the feed's late picks) are coloured upward from where
    /// the two meet, so the list under them keeps every colour it had and four cards in a row still
    /// differ, across the seam too — whatever the two hold.
    @Test func cardsPutOnTopKeepTheListUnderThemAsItWas() {
        var rng = SplitMix(seed: 7)
        let choices: [Double?] = [nil, 55, 290, 140, 88, 215, 18, 120, 333]
        for _ in 0..<2000 {
            let below = (0..<Int(rng.next() % 9)).map { _ in choices[Int(rng.next() % UInt64(choices.count))] }
            let top = (0..<Int(rng.next() % 9)).map { _ in choices[Int(rng.next() % UInt64(choices.count))] }
            let belowFamilies = CardPalette.palettes(below)
            let topFamilies = CardPalette.palettes(top, over: belowFamilies)
            #expect(topFamilies.count == top.count)
            let all = topFamilies + belowFamilies
            for i in all.indices {
                for j in max(0, i - CardPalette.window)..<i { #expect(all[i] != all[j], "top \(top) over \(below) at \(i)") }
            }
            // Only the first `window` cards under them have a say.
            #expect(CardPalette.palettes(top, over: Array(belowFamilies.prefix(CardPalette.window))) == topFamilies)
        }
        // A card keeps its own family wherever nothing near it wears it.
        #expect(CardPalette.palettes([215], over: [0, 1, 2]) == [4])
        #expect(CardPalette.palettes([215], over: [4, 1, 2]) != [4])
    }
}

/// A small seeded generator (SplitMix64), so the random lists are the same on every run.
private struct SplitMix {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
