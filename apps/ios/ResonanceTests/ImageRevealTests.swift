import DesignSystem
import Foundation
import Nuke
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Blur-to-sharp (Wave 2 #7): which pictures come in blurred, which only fade and which are simply there, and the
/// story picture, moved onto the shared path, decoded for its column (IOS-3).
@MainActor @Suite struct ImageRevealTests {
    private let free = ImageRevealBudget()

    @Test func aPictureArrivingLateSharpensByItsKind() {
        #expect(ImageReveal.decide(.cover, atHand: false, budget: free) == .blur(radius: 10, duration: 0.32))
        #expect(ImageReveal.decide(.thumb, atHand: false, budget: free) == .blur(radius: 4, duration: 0.24))
        #expect(ImageReveal.decide(.avatar, atHand: false, budget: free) == .blur(radius: 3, duration: 0.20))
        // The full-screen viewer (and the thought map) only fades.
        #expect(ImageReveal.decide(.viewer, atHand: false, budget: free) == .fade(duration: 0.24))
    }

    @Test func aPictureAtHandIsSimplyThere() {
        for kind in ImageReveal.Kind.allCases {
            #expect(ImageReveal.decide(kind, atHand: true, budget: free) == ImageReveal.Effect.none)
        }
    }

    @Test func reduceMotionAndTheScreenshotsPlayNothingLowPowerOnlyFades() {
        for kind in ImageReveal.Kind.allCases {
            #expect(ImageReveal.decide(kind, atHand: false, budget: ImageRevealBudget(reduceMotion: true)) == ImageReveal.Effect.none)
            #expect(ImageReveal.decide(kind, atHand: false, budget: ImageRevealBudget(capture: true)) == ImageReveal.Effect.none)
            #expect(ImageReveal.decide(kind, atHand: false, budget: ImageRevealBudget(lowPower: true))
                    == .fade(duration: ImageReveal.strength(kind).duration))
        }
        // Low Power Mode under Reduce Motion: still nothing.
        #expect(ImageReveal.decide(.cover, atHand: false, budget: ImageRevealBudget(reduceMotion: true, lowPower: true))
                == ImageReveal.Effect.none)
    }

    @Test func onlyTheMemoryCachesAnswerIsAtHand() throws {
        let image = try #require(UIImage(systemName: "circle"))
        let request = ImageRequest(url: URL(string: "https://img.resonance.channel/a.webp"))
        func response(_ cache: ImageResponse.CacheType?) -> Result<ImageResponse, Error> {
            .success(ImageResponse(container: ImageContainer(image: image), request: request, cacheType: cache))
        }
        #expect(CoverLazyImage<EmptyView>.atHand(response(.memory)))
        // The disk's (a cover fetched ahead) still has to be decoded after the box shows: it comes in.
        #expect(!CoverLazyImage<EmptyView>.atHand(response(.disk)))
        #expect(!CoverLazyImage<EmptyView>.atHand(response(nil)))
        #expect(!CoverLazyImage<EmptyView>.atHand(nil))
    }

    @Test func aStoryPictureIsDecodedForItsColumnNeverWhole() throws {
        // A phone's column at 3×: 1600 wide (not 2400), the tallest picture's 520 pt in 2048.
        #expect(ImageSizeBuckets.storyPictureBox(column: 362, scale: 3) == CGSize(width: 1600, height: 2048))
        // A narrower or wider column by a few points keeps its cache key.
        #expect(ImageSizeBuckets.storyPictureBox(column: 360, scale: 3) == ImageSizeBuckets.storyPictureBox(column: 370, scale: 3))
        // An iPad's measure at 2×, and never past the 2400 a story picture was always capped at.
        #expect(ImageSizeBuckets.storyPictureBox(column: 680, scale: 2) == CGSize(width: 2048, height: 1280))
        #expect(ImageSizeBuckets.storyPictureBox(column: 1200, scale: 3) == CGSize(width: 2400, height: 2048))
        #expect(ImageSizeBuckets.storyPictureBox(column: 0, scale: 3) == nil)
    }
}
