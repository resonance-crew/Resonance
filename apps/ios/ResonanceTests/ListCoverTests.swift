import DesignSystem
import Foundation
import Nuke
import ResonanceKit
import Testing
@testable import Resonance

/// A list draws a card's smaller cover (`imageThumbUrl`, B2) and falls back to the cover itself when
/// there is none or it fails; every picture in a list is decoded at about the size it is drawn (audit I2).
@MainActor @Suite struct ListCoverTests {
    @Test func aListTakesTheSmallerCoverAndKeepsTheCoverToFallBackOn() {
        var card = Fixture.card("a")
        card.imageUrl = "https://img.resonance.channel/a.webp"
        #expect(card.listCoverURL?.absoluteString == "https://img.resonance.channel/a.webp")
        #expect(card.listCoverFallbackURL == nil)

        card.imageThumbUrl = "https://img.resonance.channel/a-960.webp"
        #expect(card.listCoverURL?.absoluteString == "https://img.resonance.channel/a-960.webp")
        #expect(card.listCoverFallbackURL?.absoluteString == "https://img.resonance.channel/a.webp")
        #expect(card.story.imageURL == card.listCoverURL)
        #expect(card.story.imageFallbackURL == card.listCoverFallbackURL)
        #expect(card.mini.imageFallbackURL == card.listCoverFallbackURL)
        // The feed fetches ahead the very URL its cards will ask for.
        #expect(StoryCardList.coversAhead(of: 0, in: [Fixture.card("x"), card]) == [card.listCoverURL!])

        // An empty one is none.
        card.imageThumbUrl = ""
        #expect(card.listCoverURL?.absoluteString == "https://img.resonance.channel/a.webp")
        #expect(card.listCoverFallbackURL == nil)
    }

    @Test func aPictureIsDecodedAtTheBucketAboveWhatIsShown() throws {
        let url = URL(string: "https://img.resonance.channel/a.webp")!
        // A feed card on an iPhone: 390 pt wide at 3×, cut to 0.62 — each side its own bucket, not a 1280 square.
        let feed = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 1170, height: 725)))
        #expect(feed == CGSize(width: 1280, height: 768))
        // A wide box decodes wide: 1024 × 512, not 1024 × 1024 (half the pixels, half the memory).
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 1000, height: 400)) == CGSize(width: 1024, height: 512))
        // And a tall one tall.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 700, height: 1100)) == CGSize(width: 768, height: 1280))
        // A 40 pt thumb: 120 px, the 128 bucket.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 120, height: 120)) == CGSize(width: 128, height: 128))
        // A frame zoomed in shows less of the picture, so it is decoded larger.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 300, height: 300), zoom: 2) == CGSize(width: 768, height: 768))
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 600, height: 300), zoom: 2) == CGSize(width: 1280, height: 768))
        // Nothing laid out yet: the picture as it is.
        #expect(ImageSizeBuckets.decodeSize(box: .zero) == nil)
        #expect(ImageSizeBuckets.request(url, box: .zero).thumbnail == nil)
        #expect(ImageSizeBuckets.request(url, square: 40).thumbnail != nil)
        // The URL is the same, so the disk cache the prefetch filled is hit.
        #expect(ImageSizeBuckets.request(url, square: 40).url == url)
    }

    /// A box whose width changes a little — a rotation, Stage Manager, a Mac window or divider dragged — keeps its
    /// decode size, so its request and memory-cache key stay the same and the cover never flashes back to the skeleton.
    @Test func nearbyBoxesInOneBucketDecodeAtTheSameSize() throws {
        let url = URL(string: "https://img.resonance.channel/a.webp")!
        let narrow = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 1030, height: 640)))
        let wide = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 1270, height: 760)))
        #expect(narrow == wide)
        #expect(narrow == CGSize(width: 1280, height: 768))
        // A width wobble of 3 pt at 3× (a divider dragged) keeps the size, so the request's cache key.
        let before = ImageSizeBuckets.request(url, box: CGSize(width: 1170, height: 725))
        let after = ImageSizeBuckets.request(url, box: CGSize(width: 1179, height: 725))
        #expect(before.thumbnail != nil)
        #expect(before.thumbnail == after.thumbnail)
        #expect(ImageSizeBuckets.request(url, box: CGSize(width: 1030, height: 640)).thumbnail != nil)
        // Past the bucket, the next one — on that side alone.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 1290, height: 800)) == CGSize(width: 1600, height: 1024))
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 1290, height: 700)) == CGSize(width: 1600, height: 768))
    }

    /// Aspect fill into the decode box gives the picture at least the pixels the box shows on both axes, whatever the
    /// picture's shape: each side of the decode box is at least that side shown (× the zoom).
    @Test func theDecodeBoxCoversWhatIsShownOnBothAxes() throws {
        let boxes = [CGSize(width: 1170, height: 725), CGSize(width: 120, height: 120), CGSize(width: 2400, height: 300),
                     CGSize(width: 300, height: 2400), CGSize(width: 1560, height: 1040), CGSize(width: 3000, height: 1800)]
        let pictures = [CGSize(width: 2048, height: 1152), CGSize(width: 1152, height: 2048), CGSize(width: 2048, height: 2048)]
        for box in boxes {
            for zoom in [1.0, 1.5, 2.0] {
                let decode = try #require(ImageSizeBuckets.decodeSize(box: box, zoom: zoom))
                #expect(decode.width >= box.width * zoom && decode.height >= box.height * zoom)
                for picture in pictures {
                    // What Nuke's aspect-fill thumbnail scales the picture by (no upscaling past the picture itself).
                    let scale = min(1, max(decode.width / picture.width, decode.height / picture.height))
                    let shown = min(1, max(box.width * zoom / picture.width, box.height * zoom / picture.height))
                    #expect(scale >= shown)
                }
            }
        }
    }

    /// The smaller copy (≤ 960 px) is asked for only where it has the pixels the box needs; a wider box — a wide card
    /// at 3×, a 520 pt bubble, a frame zoomed in — takes the cover itself at once, with nothing after it.
    @Test func aBoxNeedingMoreThanTheCopyTakesTheCoverItself() {
        let thumb = URL(string: "https://img.resonance.channel/a-w960.webp")!
        let full = URL(string: "https://img.resonance.channel/a.webp")!
        // A 40 pt thumb, a mini card: the copy, the cover behind it.
        let small = ImageSizeBuckets.listSource(thumb, fallback: full, box: CGSize(width: 120, height: 120))
        #expect(small.url == thumb && small.fallback == full)
        let edge = ImageSizeBuckets.listSource(thumb, fallback: full, box: CGSize(width: 960, height: 600))
        #expect(edge.url == thumb && edge.fallback == full)
        // A feed card on an iPhone (1170 px), a bubble at 3× (1560): the cover itself.
        let feed = ImageSizeBuckets.listSource(thumb, fallback: full, box: CGSize(width: 1170, height: 725))
        #expect(feed.url == full && feed.fallback == nil)
        // A frame zoomed ×2 on a 600 px box needs 1200.
        let zoomed = ImageSizeBuckets.listSource(thumb, fallback: full, box: CGSize(width: 600, height: 400), zoom: 2)
        #expect(zoomed.url == full && zoomed.fallback == nil)
        // No copy (no fallback): the one address there is, however large the box.
        let only = ImageSizeBuckets.listSource(full, fallback: nil, box: CGSize(width: 2000, height: 1200))
        #expect(only.url == full && only.fallback == nil)
    }

    /// The map reads a card document's `media.thumbUrl` only while it is the current cover's copy: a draft's save
    /// merges `media`, so a changed cover can keep the old cover's `thumbUrl`.
    @Test func theMapTakesTheCopyOnlyWhenItIsTheCurrentCoversOwn() {
        let url = "https://img.resonance.channel/image/2026-11/B.webp"
        #expect(ThoughtMapService.isCopy("https://img.resonance.channel/image/2026-11/B-w960.webp", of: url))
        #expect(!ThoughtMapService.isCopy("https://img.resonance.channel/image/2026-11/A-w960.webp", of: url))
        #expect(!ThoughtMapService.isCopy("", of: url))
        // Only the last extension is replaced.
        #expect(ThoughtMapService.isCopy("https://img.resonance.channel/x/B.jpg-w960.webp", of: "https://img.resonance.channel/x/B.jpg.webp"))
        #expect(!ThoughtMapService.isCopy("https://img.resonance.channel/x/B-w960.webp", of: "https://img.resonance.channel/x/B.jpg.webp"))

        let current = MapCard.cover(media: ["type": "image", "url": url,
                                            "thumbUrl": "https://img.resonance.channel/image/2026-11/B-w960.webp"])
        #expect(current.url?.absoluteString == "https://img.resonance.channel/image/2026-11/B-w960.webp")
        #expect(current.fallback?.absoluteString == url)
        // The old cover's copy, left behind by a merged save: the cover itself, nothing to fall back to.
        let stale = MapCard.cover(media: ["type": "image", "url": url,
                                          "thumbUrl": "https://img.resonance.channel/image/2026-10/A-w960.webp"])
        #expect(stale.url?.absoluteString == url)
        #expect(stale.fallback == nil)
        #expect(MapCard.cover(media: ["type": "image", "url": url]).url?.absoluteString == url)
        #expect(MapCard.cover(media: ["type": "video", "url": url]).url == nil)
        #expect(ThoughtMapService.card(id: "c", data: ["media": ["type": "image", "url": url,
                                                                  "thumbUrl": "https://img.resonance.channel/image/2026-11/B-w960.webp"]])?
            .mediaFallbackURL?.absoluteString == url)

        // A summary from the server carries its cover to fall back on too.
        var card = Fixture.card("m")
        card.imageUrl = url
        card.imageThumbUrl = "https://img.resonance.channel/image/2026-11/B-w960.webp"
        #expect(MapCard(summary: card).mediaFallbackURL?.absoluteString == url)
    }
}

/// The decoded pictures' memory cache is capped below Nuke's default (15 % of the memory, up to 768 MB), and the cap is
/// set on the cache the shared pipeline reads — at launch, so the test host's own launch has already applied it.
@Suite struct ImageMemoryTests {
    @Test func theLimitIsEightPercentBetween64And256MB() {
        let mb = 1024 * 1024
        let gb: UInt64 = 1024 * 1024 * 1024
        #expect(ImageMemory.costLimit(physicalMemory: 512 * UInt64(mb)) == 64 * mb)
        #expect(ImageMemory.costLimit(physicalMemory: 2 * gb) == Int(Double(2 * gb) * 0.08))
        #expect(ImageMemory.costLimit(physicalMemory: 3 * gb) < 256 * mb)
        #expect(ImageMemory.costLimit(physicalMemory: 4 * gb) == 256 * mb)
        #expect(ImageMemory.costLimit(physicalMemory: 6 * gb) == 256 * mb)
        #expect(ImageMemory.costLimit(physicalMemory: 16 * gb) == 256 * mb)
    }

    @Test func theSharedPipelineReadsTheCappedCache() throws {
        let cache = try #require(ImagePipeline.shared.configuration.imageCache as? ImageCache)
        #expect(cache === ImageCache.shared)
        // Applied by the app's launch (ResonanceApp.init), before any picture was asked for.
        #expect(cache.costLimit == ImageMemory.costLimit(physicalMemory: ProcessInfo.processInfo.physicalMemory))
        #expect(cache.costLimit <= ImageMemory.ceiling)
        #expect(cache.countLimit == ImageMemory.countLimit)
    }
}
