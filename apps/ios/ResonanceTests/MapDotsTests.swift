import Foundation
import Testing
@testable import Resonance

/// The thought map's dotted paper is the web's at every zoom (native/fixtures/map-dots.json, which
/// src/components/molecules/ThoughtMap/mapDots.test.ts writes from mapDots.ts and Android reads too).
@MainActor @Suite struct MapDotsTests {
    static let fixture: [String: Any] = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/map-dots.json").standardized
        return try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    }()

    @Test func theConstantsAreTheWebs() {
        #expect(Self.fixture["grid"] as? Double == MapDots.grid)
        #expect(Self.fixture["levels"] as? Int == MapDots.levelCount)
        #expect(Self.fixture["radius"] as? Double == MapDots.fullRadius)
        #expect(Self.fixture["edge"] as? Double == MapDots.edge)
    }

    @Test func everyZoomDrawsTheWebsPaper() throws {
        let cases = try #require(Self.fixture["cases"] as? [[String: Any]])
        #expect(!cases.isEmpty)
        for c in cases {
            let s = try #require(c["s"] as? Double)
            let dots = MapDots(scale: s)
            let levels = try #require(c["levels"] as? [Double])
            #expect(abs(dots.tile - (c["tile"] as! Double)) < 1e-9, "tile at \(s)")
            #expect(dots.levels.count == levels.count, "levels at \(s)")
            for (a, b) in zip(dots.levels, levels) { #expect(abs(a - b) < 1e-9, "levels at \(s)") }
            #expect(abs(dots.radius - (c["radius"] as! Double)) < 1e-9, "radius at \(s)")
            #expect(abs(dots.alpha - (c["alpha"] as! Double)) < 1e-9, "alpha at \(s)")
        }
    }

    @Test func aTileIsInTheWebsLattice() throws {
        let tiles = try #require(Self.fixture["dotLevel"] as? [[String: Int]])
        for t in tiles {
            #expect(MapDots.level(t["i"]!, t["j"]!) == t["level"]!, "tile \(t["i"]!), \(t["j"]!)")
        }
    }
}
