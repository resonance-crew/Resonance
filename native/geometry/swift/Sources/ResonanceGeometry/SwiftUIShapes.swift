#if canImport(SwiftUI)
import SwiftUI

extension Array where Element == PathCommand {
    /// SwiftUI path, optionally translated (e.g. to inset a stroke).
    public func path(offsetX dx: Double = 0, offsetY dy: Double = 0) -> Path {
        var p = Path()
        for cmd in self {
            switch cmd {
            case let .move(x, y): p.move(to: CGPoint(x: x + dx, y: y + dy))
            case let .line(x, y): p.addLine(to: CGPoint(x: x + dx, y: y + dy))
            case let .cubic(x1, y1, x2, y2, x, y):
                p.addCurve(to: CGPoint(x: x + dx, y: y + dy),
                           control1: CGPoint(x: x1 + dx, y: y1 + dy),
                           control2: CGPoint(x: x2 + dx, y: y2 + dy))
            case let .quad(x1, y1, x, y):
                p.addQuadCurve(to: CGPoint(x: x + dx, y: y + dy), control: CGPoint(x: x1 + dx, y: y1 + dy))
            case .close: p.closeSubpath()
            }
        }
        return p
    }
}

/// The web's `HandDrawnBorder` / `wobRect` as a SwiftUI `Shape`. Size comes
/// from layout (no measuring pass like the web's `useElementSize`); the
/// wobble defaults follow `wobAuto`, exactly like the web component.
public struct WobRectShape: Shape {
    public var radius: Double
    public var seed: Double
    public var mag: Double?
    public var options: WobRectOptions?

    public init(radius: Double = 22, seed: Double = 1, mag: Double? = nil, options: WobRectOptions? = nil) {
        self.radius = radius
        self.seed = seed
        self.mag = mag
        self.options = options
    }

    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width), h = Double(rect.height)
        guard w > 0, h > 0 else { return Path() }
        let o = options ?? WobRectOptions(curve: autoCurve(w, h),
                                          segmentsH: .count(Double(autoSegments(w))),
                                          segmentsV: .count(Double(autoSegments(h))))
        let r = min(radius, min(w, h) / 2)
        let m = mag ?? autoMag(w, h)
        return GeometryCache.shared.wobRectPath(WobRectKey(w: w, h: h, r: r, seed: seed, mag: m, options: o,
                                                           offsetX: Double(rect.minX), offsetY: Double(rect.minY)))
    }
}

/// Everything that shapes a wobbly rectangle's path (`wobRect`'s arguments) and where it is drawn:
/// the key ``GeometryCache`` keeps the finished path by. Compared field by field — cheaper than the
/// string it replaced, which spelled out every number.
public struct WobRectKey: Hashable, Sendable {
    let w: Double, h: Double, r: Double, seed: Double, mag: Double
    let curve: Double?, cornerJitter: Double?, cornerOffset: Double?
    let segmentsH: SegValue?, segmentsV: SegValue?
    let cornerRadii: CornerRadii?
    let offsetX: Double, offsetY: Double

    public init(w: Double, h: Double, r: Double, seed: Double, mag: Double, options: WobRectOptions,
                offsetX: Double = 0, offsetY: Double = 0) {
        self.w = w
        self.h = h
        self.r = r
        self.seed = seed
        self.mag = mag
        curve = options.curve
        cornerJitter = options.cornerJitter
        cornerOffset = options.cornerOffset
        segmentsH = options.segmentsH
        segmentsV = options.segmentsV
        cornerRadii = options.cornerRadii
        self.offsetX = offsetX
        self.offsetY = offsetY
    }

    var options: WobRectOptions {
        WobRectOptions(curve: curve, cornerJitter: cornerJitter, cornerOffset: cornerOffset, segmentsH: segmentsH,
                       segmentsV: segmentsV, cornerRadii: cornerRadii)
    }
}

public struct WobCircleShape: Shape {
    public var seed: Double
    public var options: WobCircleOptions
    public init(seed: Double = 1, options: WobCircleOptions = WobCircleOptions()) {
        self.seed = seed
        self.options = options
    }
    public func path(in rect: CGRect) -> Path {
        let r = Double(min(rect.width, rect.height)) / 2
        return wobCircle(Double(rect.midX), Double(rect.midY), r, seed: seed, options: options).path()
    }
}

/// A full-width wavy stroke (dividers, header edges).
public struct WavyLineShape: Shape {
    public var seed: Double
    public var amp: Double
    public var stepsPerPoint: Double
    public init(seed: Double = 1, amp: Double = 1.4, stepsPerPoint: Double = 1.0 / 30) {
        self.seed = seed
        self.amp = amp
        self.stepsPerPoint = stepsPerPoint
    }
    public func path(in rect: CGRect) -> Path {
        let w = Double(rect.width)
        let steps = max(3, Int((w * stepsPerPoint).rounded()))
        return wavyLine(w, seed: seed, amp: amp, steps: steps).path(offsetX: Double(rect.minX), offsetY: Double(rect.midY))
    }
}

/// Two generations of a cache: what is asked for stays (a hit moves it into the young one), what
/// isn't asked for again goes when the old generation is let go — about least-recently-used, at a
/// dictionary's cost. Holds at most `2 × limit`.
struct CacheGenerations<Key: Hashable, Value> {
    private var young: [Key: Value] = [:]
    private var old: [Key: Value] = [:]
    let limit: Int

    init(limit: Int) {
        self.limit = limit
    }

    mutating func value(_ key: Key) -> Value? {
        if let hit = young[key] { return hit }
        guard let hit = old.removeValue(forKey: key) else { return nil }
        insert(key, hit)
        return hit
    }

    mutating func insert(_ key: Key, _ value: Value) {
        young[key] = value
        if young.count >= limit {
            old = young
            young = [:]
        }
    }
}

/// Small LRU-ish cache: SwiftUI re-asks `path(in:)` on every layout pass, and a
/// scrolling feed lays out the same few card sizes over and over.
public final class GeometryCache: @unchecked Sendable {
    public static let shared = GeometryCache()
    private var store = CacheGenerations<String, [PathCommand]>(limit: 256)
    /// Wobbly rectangles' finished paths, by everything that shapes them (``WobRectKey``): a hit
    /// hands the path back as it is, nothing made again.
    private var wobRects = CacheGenerations<WobRectKey, Path>(limit: 512)
    private let lock = NSLock()

    public func path(key: String, make: () -> [PathCommand]) -> [PathCommand] {
        lock.lock()
        if let hit = store.value(key) {
            lock.unlock()
            return hit
        }
        lock.unlock()
        let value = make()
        lock.lock()
        store.insert(key, value)
        lock.unlock()
        return value
    }

    /// The path of the wobbly rectangle `key` names, at its offset: exactly what
    /// `wobRect(…).path(offsetX:offsetY:)` makes, made once.
    public func wobRectPath(_ key: WobRectKey) -> Path {
        lock.lock()
        if let hit = wobRects.value(key) {
            lock.unlock()
            return hit
        }
        lock.unlock()
        let path = wobRect(key.w, key.h, key.r, seed: key.seed, mag: key.mag, options: key.options)
            .path(offsetX: key.offsetX, offsetY: key.offsetY)
        lock.lock()
        wobRects.insert(key, path)
        lock.unlock()
        return path
    }
}
#endif
