import Testing
@testable import Resonance

/// `-route` at launch (Debug, screen checks and the release screenshots, scripts/visual/ios.ts): the
/// site's paths that are a tab or the writer here open there; every other path is left to `Route(url:)`.
@MainActor @Suite struct LaunchRouteTests {
    @Test func theTabsPathsOpenTheirTab() {
        #expect(MainTabView.launchTab("/home")?.0 == .feed)
        #expect(MainTabView.launchTab("/messages")?.0 == .messages)
        #expect(MainTabView.launchTab("/me")?.0 == .cardBox)
        #expect(MainTabView.launchTab("/me")?.1 == [])
    }

    @Test func theWriterOpensOnANewCardOrOneOfYours() {
        #expect(MainTabView.launchTab("/write")?.1 == [.write(.init())])
        #expect(MainTabView.launchTab("/write/alice-draft")?.1 == [.write(.init(cardId: "alice-draft"))])
    }

    @Test func pagesWithASiteAddressAreLeftToTheRoute() {
        #expect(MainTabView.launchTab("/messages/bob") == nil)
        #expect(MainTabView.launchTab("/me/thought-map") == nil)
        #expect(MainTabView.launchTab("/card/rich-story") == nil)
    }
}
