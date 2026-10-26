#if canImport(SwiftUI)
import SwiftUI
import Testing
@testable import ResonanceGeometry

// WobRectShape keeps the paths it made in GeometryCache, keyed by everything that shapes them.

@Test func shapesDifferingOnlyInTheirCornersAreCachedApart() {
    let rect = CGRect(x: 0, y: 0, width: 180, height: 40)
    func bubble(_ radii: CornerRadii?) -> Path {
        WobRectShape(radius: 16.8, seed: 183, mag: 2, options: WobRectOptions(
            curve: 1.3, cornerJitter: 1.6, cornerOffset: 1.6, segmentsH: .count(2), segmentsV: .count(1), cornerRadii: radii
        )).path(in: rect)
    }
    let round = bubble(nil)
    // A bubble in the middle of a run of your own: its right-hand corners tucked.
    let tucked = bubble(CornerRadii(topLeft: 16.8, topRight: 4, bottomRight: 4, bottomLeft: 16.8))
    #expect(round.description != tucked.description)
    // Asked again, each is the one it was.
    #expect(bubble(nil).description == round.description)
    #expect(bubble(CornerRadii(topLeft: 16.8, topRight: 4, bottomRight: 4, bottomLeft: 16.8)).description == tucked.description)
}

@Test func aCachedRectangleIsExactlyTheOneMadeAfresh() {
    let options = WobRectOptions(curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3))
    for (dx, dy) in [(0.0, 0.0), (12.0, 12.0), (-3.5, 7.25)] {
        let fresh = wobRect(320, 200, 18, seed: 7, mag: 10, options: options).path(offsetX: dx, offsetY: dy)
        let key = WobRectKey(w: 320, h: 200, r: 18, seed: 7, mag: 10, options: options, offsetX: dx, offsetY: dy)
        #expect(GeometryCache.shared.wobRectPath(key).description == fresh.description)
        // Asked again: the same path.
        #expect(GeometryCache.shared.wobRectPath(key).description == fresh.description)
    }
    // A shape drawn away from its frame's corner is moved as before.
    let shape = WobRectShape(radius: 22, seed: 3)
    let auto = WobRectOptions(curve: autoCurve(180, 40), segmentsH: .count(Double(autoSegments(180))), segmentsV: .count(Double(autoSegments(40))))
    #expect(shape.path(in: CGRect(x: 5, y: 9, width: 180, height: 40)).description
        == wobRect(180, 40, 20, seed: 3, mag: autoMag(180, 40), options: auto).path(offsetX: 5, offsetY: 9).description)
}

@Test func everyFieldOfTheKeyTellsShapesApart() {
    let base = WobRectOptions(curve: 1, cornerJitter: 1, cornerOffset: 1, segmentsH: .count(2), segmentsV: .range(1, 2))
    let key = WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: base)
    var variants: [WobRectKey] = [
        WobRectKey(w: 101, h: 50, r: 10, seed: 1, mag: 2, options: base),
        WobRectKey(w: 100, h: 51, r: 10, seed: 1, mag: 2, options: base),
        WobRectKey(w: 100, h: 50, r: 11, seed: 1, mag: 2, options: base),
        WobRectKey(w: 100, h: 50, r: 10, seed: 2, mag: 2, options: base),
        WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 3, options: base),
        WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: base, offsetX: 1),
        WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: base, offsetY: 1),
    ]
    for change in [\WobRectOptions.curve, \.cornerJitter, \.cornerOffset] {
        var options = base
        options[keyPath: change] = nil
        variants.append(WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: options))
    }
    var options = base
    options.segmentsH = .range(2, 3)
    variants.append(WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: options))
    options = base
    options.segmentsV = .count(1)
    variants.append(WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: options))
    options = base
    options.cornerRadii = CornerRadii(topLeft: 10, topRight: 4, bottomRight: 4, bottomLeft: 10)
    variants.append(WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: options))
    #expect(variants.allSatisfy { $0 != key })
    #expect(key == WobRectKey(w: 100, h: 50, r: 10, seed: 1, mag: 2, options: base))
}

@Test func theCacheKeepsWhatIsAskedForAndLetsTheRestGo() {
    var cache = CacheGenerations<Int, String>(limit: 3)
    for i in 0..<3 { cache.insert(i, "\(i)") }
    // Three in: the young generation is now the old one. 0 is asked for again and comes back young.
    #expect(cache.value(0) == "0")
    cache.insert(3, "3")
    cache.insert(4, "4")
    // The young generation (0, 3, 4) is full and became the old one; 1 and 2, never asked for again, are gone.
    #expect(cache.value(1) == nil)
    #expect(cache.value(2) == nil)
    #expect(cache.value(0) == "0")
    #expect(cache.value(4) == "4")
}
#endif
