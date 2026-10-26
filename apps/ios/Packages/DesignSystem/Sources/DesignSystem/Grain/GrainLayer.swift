import SwiftUI
import UIKit

// MARK: - Grain

public enum GrainMode: String, CaseIterable, Identifiable, Sendable {
    case none, tile, shader
    public var id: String { rawValue }
}

/// The web's feTurbulence parameters for each grain, keyed by tile name
/// (scripts/native/grain-tiles.ts renders the tiles from the same values).
struct GrainSpec {
    let frequency: Double
    let octaves: Int
    let seed: Int
    /// 0 = ShapeGrain (gray noise), 1 = GrainOverlay (black, alpha from noise).
    var shaderMode: Float = 0

    static func named(_ tile: String) -> GrainSpec {
        switch tile {
        case "grain-button": GrainSpec(frequency: 1.1, octaves: 2, seed: 3)
        case "grain-overlay": GrainSpec(frequency: 0.72, octaves: 4, seed: 0, shaderMode: 1)
        default: GrainSpec(frequency: 0.85, octaves: 2, seed: 3)
        }
    }
}

/// ShapeGrain: the web's feTurbulence noise, clipped to a shape.
/// `.tile` draws the pre-rendered spec-exact noise tile (scripts/native/grain-tiles.ts);
/// `.shader` computes the same noise per pixel on the GPU (Grain.metal).
public struct GrainLayer<S: Shape>: View {
    let shape: S
    var mode: GrainMode
    var opacity: Double
    var tile: String
    /// How far the shape reaches past the view's box (a wobbly outline bowing out, a region
    /// overshooting to be trimmed by an outer clip): the tile is laid that much wider, so the
    /// grain doesn't stop at the box and leave a band of bare fill along the bulge.
    var overflow: CGFloat
    /// Drawn in dark too (false: a face that is plain in dark, Apple's white button).
    var inDark: Bool

    public init(shape: S, mode: GrainMode = .tile, opacity: Double = 0.3, tile: String = "grain-card", overflow: CGFloat = 0,
                inDark: Bool = true) {
        self.shape = shape
        self.mode = mode
        self.opacity = opacity
        self.tile = tile
        self.overflow = overflow
        self.inDark = inDark
    }

    @Environment(\.colorScheme) private var colorScheme

    /// The grain's strength in this scheme: light specks on night paper read louder than dark ones
    /// on cream (palette SCHEME_NUMBERS `grain-scale`).
    private var strength: Double { opacity * Palette.grainScale(PaletteScheme(colorScheme)) }

    public var body: some View {
        switch inDark || colorScheme != .dark ? mode : .none {
        case .none:
            EmptyView()
        case .tile:
            tileImage
                .opacity(strength)
                .clipShape(OutsetShape(base: shape, by: overflow))
                .padding(-overflow)
                .allowsHitTesting(false)
        case .shader:
            let spec = GrainSpec.named(tile)
            // The fill is only the shape's coverage: the shader draws the noise (in --grain-ink).
            shape.fill(.black)
                .turbulenceGrain(frequency: spec.frequency, octaves: spec.octaves, seed: spec.seed,
                                 opacity: strength, mode: spec.shaderMode, ink: Tokens.grainInk)
                .allowsHitTesting(false)
        }
    }

    /// The tile. GrainOverlay's is ink with the noise as its alpha, drawn in --grain-ink (black on
    /// cream, chalk on the night paper); ShapeGrain's grey noise is the same in both.
    @ViewBuilder private var tileImage: some View {
        if GrainSpec.named(tile).shaderMode == 1 {
            Image(uiImage: GrainTiles.image(tile).withRenderingMode(.alwaysTemplate))
                .resizable(resizingMode: .tile)
                .foregroundStyle(Tokens.grainInk)
        } else {
            Image(uiImage: GrainTiles.image(tile))
                .resizable(resizingMode: .tile)
        }
    }
}

/// `base` laid out in a box `by` smaller on each side than the one it is asked to fill: the shape
/// as its own view sees it, drawn in a frame grown by `by` (GrainLayer's `overflow`).
nonisolated struct OutsetShape<Base: Shape>: Shape {
    let base: Base
    let by: CGFloat

    func path(in rect: CGRect) -> Path {
        base.path(in: rect.insetBy(dx: by, dy: by))
    }
}

/// The pre-rendered noise tiles are @3x PNGs in this package; load once.
enum GrainTiles {
    private static var cache: [String: UIImage] = [:]
    static func image(_ name: String) -> UIImage {
        if let hit = cache[name] { return hit }
        let img = UIImage(named: name, in: .module, compatibleWith: nil) ?? UIImage()
        cache[name] = img
        return img
    }
}
