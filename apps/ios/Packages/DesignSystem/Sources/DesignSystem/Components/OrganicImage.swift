import Nuke
import NukeUI
import SwiftUI

/// OrganicImage: a remote image cover-fitted inside a hand-drawn curve. As on
/// the web, the picture bleeds past its box by the wobble's outward swing so
/// the bulges land on real pixels rather than on nothing.
///
/// While the picture is on its way its place shimmers (a SkeletonBlock in the
/// same clip); the placeholder — a story card's stripes, "no picture" — is for
/// no address, a picture that couldn't be loaded, and under one that has.
public struct OrganicImage<Placeholder: View>: View {
    let url: URL?
    let seed: Double
    let radius: Double
    let grain: Double
    let placeholder: Placeholder

    /// `grain` is the web's GrainOverlay opacity laid over the picture (the
    /// story cards' paper texture, StoryGrain.cover); 0 draws none.
    public init(url: URL?, seed: Double, radius: Double = 18, grain: Double = 0, @ViewBuilder placeholder: () -> Placeholder) {
        self.url = url
        self.seed = seed
        self.radius = radius
        self.grain = grain
        self.placeholder = placeholder()
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let mag = min(w, h) * 0.05
            let bleed = (mag + 6 + 4).rounded(.up)
            ZStack {
                if let url {
                    LazyImage(url: url) { state in
                        if let image = state.image {
                            ZStack {
                                placeholder
                                image.resizable().scaledToFill()
                            }
                        } else if state.error != nil {
                            placeholder
                        } else {
                            SkeletonBlock(height: nil, radius: 0)
                        }
                    }
                } else {
                    placeholder
                }
                if grain > 0 {
                    // Above the photo too (the web's overlay sits at z 10): ink at 2×.
                    GrainLayer(shape: Rectangle(), mode: .tile, opacity: grain * 2, tile: "grain-overlay")
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipShape(OrganicImageShape(seed: seed, radius: radius, bleed: bleed))
            .offset(x: -bleed, y: -bleed)
        }
    }
}

/// The clip, drawn in the bled frame's coordinates (so offset by `bleed`).
nonisolated struct OrganicImageShape: Shape {
    let seed: Double
    let radius: Double
    let bleed: Double

    func path(in rect: CGRect) -> Path {
        let w = rect.width - bleed * 2, h = rect.height - bleed * 2
        guard w > 0, h > 0 else { return Path() }
        // Kept by the geometry cache: a feed of covers asks for the same few sizes on every layout.
        return GeometryCache.shared.wobRectPath(WobRectKey(w: w, h: h, r: min(radius, min(w, h) / 2), seed: seed, mag: min(w, h) * 0.05,
                                                           options: Self.options, offsetX: bleed, offsetY: bleed))
    }

    private static let options = WobRectOptions(curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3))
}

extension OrganicImage where Placeholder == Color {
    public init(url: URL?, seed: Double, radius: Double = 18, grain: Double = 0, fill: Color) {
        self.init(url: url, seed: seed, radius: radius, grain: grain) { fill }
    }
}

/// Covers fetched before their cards come on screen: a list asks for the next few as each card
/// appears. Only their bytes, into the image pipeline's HTTP disk cache — nothing decoded, nothing
/// kept in memory — so the cover's own request, the same one (``OrganicImage``'s URL), is a cache hit
/// when its card shows. At low priority, two at a time; what is in memory or on its way is skipped.
public enum CoverPrefetch {
    private static let prefetcher = ImagePrefetcher(destination: .diskCache)

    /// Fetches the covers at `urls` ahead.
    public static func ahead(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        prefetcher.startPrefetching(with: urls)
    }
}

/// A remote picture filling its frame (cover), decoded at the size it's shown
/// at (`pixelSize`, in points × scale) instead of full resolution — for many
/// small pictures at once, like the thought map's card thumbnails.
public struct RemoteImage: View {
    let url: URL
    let pixelSize: CGSize

    public init(url: URL, pixelSize: CGSize) {
        self.url = url
        self.pixelSize = pixelSize
    }

    public var body: some View {
        LazyImage(request: ImageRequest(url: url, processors: [.resize(size: pixelSize, unit: .pixels, contentMode: .aspectFill)])) { state in
            if let image = state.image { image.resizable().scaledToFill() }
        }
    }
}
