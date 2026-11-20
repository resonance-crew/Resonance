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
        #expect(feed.width == 1280)
        #expect(abs(feed.height - 725 * 1280 / 1170) < 1)
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
}
