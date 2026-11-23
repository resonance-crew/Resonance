import DesignSystem
import Foundation
import ResonanceKit
import Testing
import UIKit
@testable import Resonance

/// Wave 2 iOS P1: a list fetches ahead the very cover its cards will ask for (IOS-4), and a picture sent from here is
/// kept once in the chat pictures' memory (IOS-10).
@MainActor @Suite struct PicturePerfTests {
    @Test func theFeedFetchesAheadTheCoverItsCardsWillAskFor() {
        var card = Fixture.card("a")
        card.imageUrl = "https://img.resonance.channel/a.webp"
        card.imageThumbUrl = "https://img.resonance.channel/a-960.webp"
        let cards = [Fixture.card("x"), card]
        // A phone's band at 3× needs more than the smaller cover has: the cover itself, as OrganicImage asks.
        let phone = StoryCardList.coverBox(window: WindowLayout(width: 402, height: 874), scale: 3)
        #expect(ImageSizeBuckets.neededSide(box: phone) > ImageSizeBuckets.listCoverSide)
        #expect(StoryCardList.coversAhead(of: 0, in: cards, box: phone) == [card.listCoverFallbackURL!])
        // A landscape iPad's grid card at 2×: the smaller cover.
        let tablet = StoryCardList.coverBox(window: WindowLayout(width: 1180, height: 820), scale: 2)
        #expect(ImageSizeBuckets.neededSide(box: tablet) < ImageSizeBuckets.listCoverSide)
        #expect(StoryCardList.coversAhead(of: 0, in: cards, box: tablet) == [card.listCoverURL!])
        // No box: the smaller cover, as before.
        #expect(StoryCardList.coversAhead(of: 0, in: cards) == [card.listCoverURL!])
    }

    @Test func aPictureSentFromHereIsKeptOnce() async throws {
        let store = ChatImageStore { _, _ in throw APIFailure(code: "not_found", message: "No such picture.", status: 404) }
        let local = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        store.keep(local, for: "AbCdEfGhIjKlMnOpQrSt")
        // At either size from the one entry, nothing asked of the server.
        #expect(store.cached("AbCdEfGhIjKlMnOpQrSt", .thumb) === local)
        #expect(store.cached("AbCdEfGhIjKlMnOpQrSt", .full) === local)
        #expect(await store.image("AbCdEfGhIjKlMnOpQrSt", .thumb) === local)
        #expect(store.fetches == 0)
    }
}
