import Foundation
import Testing
@testable import Resonance

/// A list's launch argument (Debug, the release screenshots' `profile-translated`, scripts/visual/ios.ts):
/// `-scrollToCard <slug>` scrolls a person's page to that card, which a first card taller than a screenful
/// otherwise keeps below the fold. A Release build reads nothing.
@MainActor @Suite struct ListLaunchTests {
    private func defaults(_ values: [String: Any]) -> UserDefaults {
        let name = "ListLaunchTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        for (key, value) in values { defaults.set(value, forKey: key) }
        return defaults
    }

    @Test func theTargetIsTheSlugGiven() {
        #if DEBUG
        #expect(ListLaunch.scrollTarget(defaults(["scrollToCard": "bridge-rain"])) == "bridge-rain")
        #else
        #expect(ListLaunch.scrollTarget(defaults(["scrollToCard": "bridge-rain"])) == nil)
        #endif
        #expect(ListLaunch.scrollTarget(defaults(["scrollToCard": ""])) == nil)
        #expect(ListLaunch.scrollTarget(defaults([:])) == nil)
        #expect(ListLaunch.anchor("bridge-rain") != ListLaunch.anchor("carol-note"))
    }

    /// The profile scrolls to the anchor the list's row carries, and the read stays inside Debug.
    @Test func theProfileScrollsToTheRowsAnchor() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("..").standardized
        let list = try String(contentsOf: root.appendingPathComponent("Resonance/Features/Shared/StoryCardList.swift"), encoding: .utf8)
        let author = try String(contentsOf: root.appendingPathComponent("Resonance/Features/Author/AuthorScreen.swift"), encoding: .utf8)
        #expect(list.contains("Color.clear.id(ListLaunch.anchor(target))"))
        #expect(author.contains("proxy.scrollTo(ListLaunch.anchor(target), anchor: .top)"))
        let read = try #require(list.range(of: #"string(forKey: "scrollToCard")"#))
        let debug = try #require(list.range(of: "#if DEBUG", options: .backwards, range: list.startIndex..<read.lowerBound))
        #expect(list.range(of: "#endif", range: debug.upperBound..<read.lowerBound) == nil)
        #expect(list.components(separatedBy: #"forKey: "scrollToCard""#).count == 2)
    }
}
