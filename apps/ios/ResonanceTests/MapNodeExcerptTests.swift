import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A thought-map node says what the story says, as the web's node does: `StoryProse` (ResonanceKit,
/// tested there against src/lib/markdown/plainText.ts case for case), cut between code points.
@MainActor @Suite struct MapNodeExcerptTests {
    @Test func aNodesExcerptIsTheStorysProseCutBetweenCodePoints() {
        // What the editor stores for `->` (the Android feed's `-&gt;`) reads as it was typed.
        #expect(plainExcerpt("我想 -&gt; 你") == "我想 -> 你")
        #expect(plainExcerpt("**九份**的雨 https://example.com/rain", max: 80) == "九份的雨")
        #expect(plainExcerpt(String(repeating: "雨", count: 79) + "😀b", max: 80) == String(repeating: "雨", count: 79) + "😀…")
    }
}
