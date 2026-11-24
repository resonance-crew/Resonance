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
    /// Asked for when `url` fails: a list's smaller cover (`imageThumbUrl`) falls back to the cover itself.
    let fallback: URL?
    @Environment(\.displayScale) private var displayScale
    @Environment(\.coverFraming) private var framing

    /// `grain` is the web's GrainOverlay opacity laid over the picture (the
    /// story cards' paper texture, StoryGrain.cover); 0 draws none.
    public init(url: URL?, fallback: URL? = nil, seed: Double, radius: Double = 18, grain: Double = 0,
                @ViewBuilder placeholder: () -> Placeholder) {
        self.url = url
        self.fallback = fallback
        self.seed = seed
        self.radius = radius
        self.grain = grain
        self.placeholder = placeholder()
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let bleed = organicImageBleed(w, h)
            let box = CGSize(width: (w + bleed * 2) * displayScale, height: (h + bleed * 2) * displayScale)
            let zoom = framing?.zoom ?? 1
            ZStack {
                if let url {
                    // The smaller cover only where it has the pixels the box needs, else the cover itself (B2).
                    let source = ImageSizeBuckets.listSource(url, fallback: fallback, box: box, zoom: zoom)
                    CoverLazyImage(url: source.url, fallback: source.fallback,
                                   request: { ImageSizeBuckets.request($0, box: box, zoom: zoom) }) { image, pictureSize, failed in
                        if let image {
                            ZStack {
                                placeholder
                                // On the cover's frame when it has one (round 25 §G1), centred otherwise — the frame's
                                // crop the visible box's, the picture carried on into the bleed (round 33 §Q4).
                                FramedCover(image, pictureSize: pictureSize, bleed: bleed)
                            }
                        } else if failed {
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

/// The few widths and heights (pixels) a list's pictures are decoded at: the next one up from what is shown.
public nonisolated enum ImageSizeBuckets {
    static let sides: [CGFloat] = [128, 256, 384, 512, 768, 1024, 1280, 1600, 2048, 2560]

    public static func bucket(_ side: CGFloat) -> CGFloat {
        sides.first { $0 >= side } ?? (side / 512).rounded(.up) * 512
    }

    /// The picture at `url` decoded as an ImageIO thumbnail just large enough to fill `box` (pixels; ×
    /// a cover frame's `zoom`, which shows a smaller part of it) — never the whole 2048 px bitmap for a
    /// card a third as wide, nor a cover for a 40 pt thumb (audit I2). Each side is rounded up to one of
    /// `sides`, so a feed's pictures share a handful of memory-cache keys; the URL, and so the disk cache
    /// the prefetch fills, stays the same. Nothing laid out yet (an empty box): as it is.
    public static func request(_ url: URL, box: CGSize, zoom: Double = 1) -> ImageRequest {
        var request = ImageRequest(url: url)
        guard let size = decodeSize(box: box, zoom: zoom) else { return request }
        request.thumbnail = ImageRequest.ThumbnailOptions(size: size, unit: .pixels, contentMode: .aspectFill)
        return request
    }

    /// The box (pixels) a picture shown in `box` is decoded to fill (aspect fill): its width and its height each
    /// the bucket above that side shown (× the frame's zoom), so the picture has at least the pixels the box shows
    /// on both axes — and a wide box no longer decodes a square as tall as it is wide (a 1170 × 725 feed card
    /// fills 1280 × 768, not 1280 × 1280). It depends on the two buckets alone, so a box whose width changes a
    /// little (a rotation, Stage Manager, a Mac window or divider dragged) keeps its request and cache key, and its
    /// cover stays up instead of going back to the skeleton. Nil for a box not laid out yet.
    public static func decodeSize(box: CGSize, zoom: Double = 1) -> CGSize? {
        guard box.width > 0, box.height > 0 else { return nil }
        let scale = clampedZoom(zoom)
        let width = box.width * scale, height = box.height * scale
        guard width.isFinite, height.isFinite else { return nil }
        return CGSize(width: bucket(width), height: bucket(height))
    }

    /// A cover frame's zoom as the decode reads it (1…2).
    static func clampedZoom(_ zoom: Double) -> CGFloat {
        zoom.isFinite ? max(1, min(zoom, 2)) : 1
    }

    /// The longer side (pixels) of the picture a `box` shows: the box's, × the frame's zoom (1…2).
    public static func neededSide(box: CGSize, zoom: Double = 1) -> CGFloat {
        max(box.width, box.height) * clampedZoom(zoom)
    }

    /// The smaller cover's longer side (`imageThumbUrl`, B2).
    public static let listCoverSide: CGFloat = 960

    /// Which picture a list's `box` asks for: the smaller cover `url`, with `fallback` (the cover itself) to try if
    /// it fails — or, where the box needs more than the smaller cover has (a wide card, a bubble, a zoomed frame, at
    /// the screen's scale), the cover itself at once, with nothing after it. Without a fallback, `url` alone.
    public static func listSource(_ url: URL, fallback: URL?, box: CGSize, zoom: Double = 1) -> (url: URL, fallback: URL?) {
        guard let fallback, fallback != url else { return (url, nil) }
        return neededSide(box: box, zoom: zoom) > listCoverSide ? (fallback, nil) : (url, fallback)
    }

    /// The same for a square `side` points across, at 3× (an avatar, a 40 pt thumb).
    public static func request(_ url: URL, square side: CGFloat) -> ImageRequest {
        request(url, box: CGSize(width: side * 3, height: side * 3))
    }
}

/// A remote picture that, when `url` fails, asks once for `fallback` (a list's smaller cover falling back to the
/// cover itself), never round again. `content` gets the picture and its size, and `failed` once nothing more is
/// coming; while the fallback is on its way it gets neither, as while loading.
///
/// Every remote picture the app draws comes through here (`imageReveal.ios.test.ts` counts the ones that don't): one
/// that arrives after its box is on screen comes in blurred and sharpens as `reveal` says (``ImageReveal``), its
/// loading face (`content` with no picture) kept under it until it has; one the memory cache answers is simply there.
public struct CoverLazyImage<Content: View>: View {
    let url: URL
    let fallback: URL?
    let request: (URL) -> ImageRequest
    let reveal: ImageReveal.Kind
    let onPicture: ((CGSize) -> Void)?
    let content: (Image?, CGSize?, Bool) -> Content
    @State private var failed: URL?
    @Environment(\.imageRevealBudget) private var budget

    public init(url: URL, fallback: URL?, request: @escaping (URL) -> ImageRequest, reveal: ImageReveal.Kind = .cover,
                onPicture: ((CGSize) -> Void)? = nil,
                @ViewBuilder content: @escaping (_ image: Image?, _ pictureSize: CGSize?, _ failed: Bool) -> Content) {
        self.url = url
        self.fallback = fallback
        self.request = request
        self.reveal = reveal
        self.onPicture = onPicture
        self.content = content
    }

    public var body: some View {
        let next = fallback.flatMap { $0 != url ? $0 : nil }
        let shown = failed == url ? (next ?? url) : url
        LazyImage(request: request(shown)) { state in
            if state.error != nil, shown == url, next != nil {
                Color.clear.onAppear { failed = url }
            } else if let image = state.image {
                content(image, state.imageContainer?.image.size, false)
                    .imageReveal(ImageReveal.decide(reveal, atHand: Self.atHand(state.result), budget: budget)) {
                        content(nil, nil, false)
                    }
            } else {
                content(nil, nil, state.error != nil)
            }
        }
        .onCompletion { result in
            if let onPicture, case let .success(response) = result { onPicture(response.image.size) }
        }
    }

    /// Whether the picture was at hand when asked for: the memory cache's (Nuke answers it on the first frame).
    public nonisolated static func atHand(_ result: Result<ImageResponse, Error>?) -> Bool {
        guard case let .success(response) = result else { return false }
        return response.cacheType == .memory
    }
}

/// How far an ``OrganicImage``'s picture reaches past its `w` × `h` box on every side: the wobble's
/// outward swing (its magnitude and corner offset) and 4 more. What must cover the picture as far as it
/// reaches — a veil over it in a story card's cover slot — reaches as far.
public func organicImageBleed(_ w: CGFloat, _ h: CGFloat) -> CGFloat {
    (min(w, h) * 0.05 + 6 + 4).rounded(.up)
}

/// The clip, drawn in the bled frame's coordinates (so offset by `bleed`) from the rect's own origin. Public for the
/// cover's framing stage (round 25 §G3), whose frame is the cover's own outline (`bleed` 0) cut out of the stage's
/// middle — a rect away from the origin, which the hole once ignored and was cut at the stage's top-left.
public nonisolated struct OrganicImageShape: Shape {
    let seed: Double
    let radius: Double
    let bleed: Double

    public init(seed: Double, radius: Double, bleed: Double) {
        self.seed = seed
        self.radius = radius
        self.bleed = bleed
    }

    public func path(in rect: CGRect) -> Path {
        let w = rect.width - bleed * 2, h = rect.height - bleed * 2
        guard w > 0, h > 0 else { return Path() }
        // Kept by the geometry cache: a feed of covers asks for the same few sizes on every layout.
        return GeometryCache.shared.wobRectPath(WobRectKey(w: w, h: h, r: min(radius, min(w, h) / 2), seed: seed, mag: min(w, h) * 0.05,
                                                           options: Self.options, offsetX: rect.minX + bleed, offsetY: rect.minY + bleed))
    }

    private static let options = WobRectOptions(curve: 0.4, cornerJitter: 1.1, cornerOffset: 6, segmentsH: .range(3, 4), segmentsV: .range(2, 3))
}

extension OrganicImage where Placeholder == Color {
    public init(url: URL?, fallback: URL? = nil, seed: Double, radius: Double = 18, grain: Double = 0, fill: Color) {
        self.init(url: url, fallback: fallback, seed: seed, radius: radius, grain: grain) { fill }
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

    private static let decoder = ImagePrefetcher(destination: .memoryCache)

    /// Small pictures a screen is about to draw at `box` (pixels; ``RemoteImage``'s `pixelSize`), decoded ahead into
    /// the memory cache under the very request ``RemoteImage`` makes, so they are on screen the moment it lays out
    /// — a list of 46 pt thumbs (the bell's cards), never a feed's covers.
    public static func decoded(_ urls: [URL], box: CGSize) {
        guard !urls.isEmpty else { return }
        decoder.startPrefetching(with: urls.map { ImageSizeBuckets.request($0, box: box) })
    }
}

/// A remote picture filling its frame (cover), decoded at the size it's shown
/// at (`pixelSize`, in points × scale) instead of full resolution — for many
/// small pictures at once, like the thought map's card thumbnails.
public struct RemoteImage: View {
    let url: URL
    let pixelSize: CGSize
    /// Asked for once when `url` fails: a list's smaller cover falls back to the cover itself.
    let fallback: URL?
    /// How it comes in when it arrives late (a small thumbnail's 4 pt; the thought map's a fade).
    let reveal: ImageReveal.Kind

    public init(url: URL, fallback: URL? = nil, pixelSize: CGSize, reveal: ImageReveal.Kind = .thumb) {
        self.url = url
        self.fallback = fallback
        self.pixelSize = pixelSize
        self.reveal = reveal
    }

    public var body: some View {
        let source = ImageSizeBuckets.listSource(url, fallback: fallback, box: pixelSize)
        // An ImageIO thumbnail (audit I2): the whole cover is never decoded first, then shrunk.
        CoverLazyImage(url: source.url, fallback: source.fallback,
                       request: { ImageSizeBuckets.request($0, box: pixelSize) }, reveal: reveal) { image, pictureSize, _ in
            // On the cover's frame when it has one (round 25 §G1): the decoded thumbnail keeps the picture's proportions.
            if let image { FramedCover(image, pictureSize: pictureSize) }
        }
    }
}
