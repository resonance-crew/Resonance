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
        // A feed card on an iPhone: 390 pt wide at 3×, cut to 0.62.
        let feed = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 1170, height: 725)))
        #expect(feed == CGSize(width: 1280, height: 1280))
        // A 40 pt thumb: 120 px, the 128 bucket.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 120, height: 120)) == CGSize(width: 128, height: 128))
        // A frame zoomed in shows less of the picture, so it is decoded larger.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 300, height: 300), zoom: 2)?.width == 768)
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
        let wide = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 1270, height: 790)))
        let tall = try #require(ImageSizeBuckets.decodeSize(box: CGSize(width: 700, height: 1100)))
        #expect(narrow == wide)
        #expect(narrow == tall)
        #expect(narrow == CGSize(width: 1280, height: 1280))
        #expect(ImageSizeBuckets.request(url, box: CGSize(width: 1030, height: 640)).thumbnail != nil)
        // Past the bucket, the next one.
        #expect(ImageSizeBuckets.decodeSize(box: CGSize(width: 1290, height: 800))?.width == 1600)
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
