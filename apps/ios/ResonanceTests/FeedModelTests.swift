import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The home feed never waits on today's picks: the latest cards show as soon
/// as they arrive, picks that come in time lead, and picks that come later go
/// on top of the latest cards at once — deduped against them, so none of the
/// cards already on screen moves or goes — with no hint to tap.
@MainActor @Suite struct FeedModelTests {
    let a = Fixture.card("a"), b = Fixture.card("b"), c = Fixture.card("c"), x = Fixture.card("x")

    private func ids(_ cards: [FeedCard]) -> [String] { cards.map(\.id) }

    @Test func picksThatComeInTimeLeadTheFeed() async {
        let (a, b, c, x) = (a, b, c, x)
        let model = FeedModel(feed: { _ in Fixture.page([a, b, c]) }, recommended: { [x, b] }, patience: .seconds(5))

        let started = ContinuousClock.now
        await model.load()

        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["x", "b"])
        #expect(!model.latestVisible)
        #expect(!model.picksOnTop)
        #expect(model.leadingPicks == 2)
        // Leading from the start, they land nowhere out of sight: nothing to tell.
        #expect(model.picksLanded == 0)
        // The picks ended the wait: nobody sat out the whole patience.
        #expect(ContinuousClock.now - started < .seconds(4))

        // "Load more" reveals the latest cards, deduped against the picks.
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "b", "a", "c"])
    }

    @Test func latePicksGoOnTopOfTheLatestAtOnceDedupedAgainstThem() async {
        let (a, b, c, x) = (a, b, c, x)
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b, c]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(30))

        await model.load()
        // The latest cards didn't wait for the picks.
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a", "b", "c"])
        #expect(!model.picksOnTop)

        await picks.open([x, b])
        // On top at once, nothing to ask for: x heads the feed, and b — on screen already among the
        // latest cards — stays where the reader has it, never twice and never moved.
        #expect(await eventually { model.picksOnTop })
        #expect(ids(model.cards) == ["x", "a", "b", "c"])
        #expect(model.leadingPicks == 1)
        #expect(model.latestVisible)
        // Something new landed above the latest: a reader down the list hears of it.
        #expect(model.picksLanded == 1)
        // The latest cards stay showing under them: "load more" fetches the next page, it reveals nothing.
        #expect(!model.canLoadMore)
    }

    /// Drawn on top as a block of their own, the picks leave the latest cards under them in the colours
    /// they wore before the picks came — and no four cards in a row share one, across the seam too.
    @Test func theCardsUnderPicksPutOnTopKeepTheirColours() {
        let latest = ["a", "b", "c", "d"].map { Fixture.card($0) }
        let before = StoryCardList.families(latest, splitAt: nil)
        let after = StoryCardList.families(["x", "y"].map { Fixture.card($0) } + latest, splitAt: 2)
        #expect(Array(after.suffix(latest.count)) == before)
        for i in after.indices {
            for j in max(0, i - CardPalette.window)..<i { #expect(after[i] != after[j]) }
        }
        // Nothing put on top: the list's one colouring.
        #expect(StoryCardList.families(latest, splitAt: 0) == CardPalette.palettes(latest.map(\.accentHue)))
    }

    @Test func latePicksAllOnScreenAlreadyAddNothing() async {
        let (a, b) = (a, b)
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(10))

        await model.load()
        await picks.open([b, a])
        #expect(await eventually { model.picksOnTop })
        #expect(ids(model.cards) == ["a", "b"])
        #expect(model.leadingPicks == 0)
        // Nothing new above the reader: nothing to tell.
        #expect(model.picksLanded == 0)
    }

    @Test func latePicksLeaveOutWhomTheReaderBlocked() async {
        let (a, b) = (a, b)
        let y = Fixture.card("y", by: "mallory")
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(10), blocked: { ["mallory"] })

        await model.load()
        await picks.open([y, Fixture.card("x")])
        #expect(await eventually { model.picksOnTop })
        #expect(ids(model.cards) == ["x", "a", "b"])
        #expect(model.leadingPicks == 1)
    }

    @Test func picksHereFirstLeadWhileTheLatestAreSlow() async {
        let (a, x) = (a, x)
        let latest = Gate<FeedPage>()
        let model = FeedModel(feed: { _ in await latest.wait() }, recommended: { [x] }, patience: .seconds(5))

        let loading = Task { await model.load() }
        #expect(await eventually { model.phase == .loaded })
        #expect(ids(model.cards) == ["x"])

        await latest.open(Fixture.page([a, x]))
        await loading.value
        // The latest cards arrived behind "load more": the picks on screen stay as they were.
        #expect(ids(model.cards) == ["x"])
        #expect(model.canLoadMore)
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "a"])
    }

    @Test func emptyPicksPutNothingOnTop() async {
        let (a, b) = (a, b)
        let picks = Gate<[FeedCard]>()
        let model = FeedModel(feed: { _ in Fixture.page([a, b]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(10))

        await model.load()
        await picks.open([])
        try? await Task.sleep(for: .milliseconds(50))
        #expect(!model.picksOnTop)
        #expect(ids(model.cards) == ["a", "b"])
        #expect(model.picksLanded == 0)
    }

    @Test func picksStandInWhenTheLatestFail() async {
        let x = x
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) }, recommended: { [x] },
                              patience: .milliseconds(10))

        await model.load()
        #expect(await eventually { model.phase == .loaded })
        #expect(ids(model.cards) == ["x"])
    }

    @Test func nothingToShowIsAFailure() async {
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) },
                              recommended: { throw APIFailure.unexpected(status: 502) }, patience: .milliseconds(10))

        await model.load()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
    }

    @Test func eachPageStartsWhereTheLastOneEnded() async {
        let (a, b, c) = (a, b, c)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            switch after {
            case nil: return Fixture.page([a], next: "2026-09-01T08:00:00.000Z", token: "t1")
            case .token("t1"): return Fixture.page([b], next: "2026-08-01T08:00:00.000Z", token: "t2")
            default: return Fixture.page([c])
            }
        }, recommended: { [] }, patience: .milliseconds(10))

        await model.load()
        await model.loadMore()
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b", "c"])
        // By the page token, never the millisecond cursor (cards sharing it would be skipped).
        #expect(await asked.all == [nil, .token("t1"), .token("t2")])
        // The last page: nothing more to ask for.
        #expect(!model.canLoadMore)
        await model.loadMore()
        #expect(await asked.all.count == 3)
    }

    /// 「顯示更多」 shows what is already here (round 19): the page after the ones on screen is fetched
    /// while the reader nears the foot, quietly — nothing new shows — and a tap shows it at once.
    @Test func aPageFetchedAheadShowsAtOnceOnATap() async {
        let (a, b, c) = (a, b, c)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            switch after {
            case nil: return Fixture.page([a], token: "t1")
            case .token("t1"): return Fixture.page([b], token: "t2")
            default: return Fixture.page([c])
            }
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        #expect(model.wantsAhead)

        model.fetchAhead()
        #expect(await eventually {
            let n = await asked.all.count
            return !model.wantsAhead && n == 2
        })
        try? await Task.sleep(for: .milliseconds(30))
        // Fetched, not shown, and the button isn't busy.
        #expect(ids(model.cards) == ["a"])
        #expect(!model.isLoadingMore)
        #expect(model.canLoadMore)

        // The tap shows it there and then, asking the server nothing.
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b"])
        #expect(await asked.all.count == 2)
        // The reader still near the foot: the next page is fetched ahead again.
        #expect(model.wantsAhead)
        model.fetchAhead()
        #expect(await eventually { await asked.all == [nil, .token("t1"), .token("t2")] })
        #expect(ids(model.cards) == ["a", "b"])
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b", "c"])
        // The last page: nothing more to fetch ahead, nothing more to show.
        #expect(!model.wantsAhead)
        #expect(!model.canLoadMore)
    }

    /// Tapped before the page fetched ahead has come: the button says it is on its way, taps do nothing
    /// more, and the page shows the moment it arrives.
    @Test func aTapBeforeThePageComesWaitsThenShowsIt() async {
        let (a, b) = (a, b)
        let next = Gate<FeedPage>()
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            return after == nil ? Fixture.page([a], token: "t1") : await next.wait()
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        model.fetchAhead()
        #expect(await eventually { await asked.all.count == 2 })

        let tap = Task { await model.loadMore() }
        #expect(await eventually { model.isLoadingMore })
        #expect(ids(model.cards) == ["a"])
        // A second tap meanwhile asks for nothing more.
        await model.loadMore()
        #expect(await asked.all.count == 2)

        await next.open(Fixture.page([b]))
        await tap.value
        #expect(ids(model.cards) == ["a", "b"])
        #expect(!model.isLoadingMore)
        #expect(!model.canLoadMore)
    }

    /// Never more than one page ahead: while one is on its way or waiting to be shown, nearing the foot
    /// again fetches nothing; nor does the first stage (picks leading, the latest behind 「顯示更多」),
    /// whose tap shows the latest cards already here.
    @Test func neverMoreThanOnePageAhead() async {
        let (a, b, x) = (a, b, x)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            return after == nil ? Fixture.page([a], token: "t1") : Fixture.page([b], token: "t2")
        }, recommended: { [x] }, patience: .seconds(5))
        await model.load()
        // Picks lead: the latest cards wait behind the button, and nothing is fetched ahead of them.
        #expect(!model.wantsAhead)
        model.fetchAhead()
        try? await Task.sleep(for: .milliseconds(30))
        #expect(await asked.all.count == 1)
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "a"])
        #expect(await asked.all.count == 1)

        model.fetchAhead()
        model.fetchAhead()
        #expect(await eventually {
            let n = await asked.all.count
            return !model.wantsAhead && n == 2
        })
        try? await Task.sleep(for: .milliseconds(30))
        model.fetchAhead()
        try? await Task.sleep(for: .milliseconds(30))
        #expect(await asked.all == [nil, .token("t1")])
        #expect(ids(model.cards) == ["x", "a"])
    }

    /// A page ahead that fails is not asked for again on its own (no loop against a failing server);
    /// a tap asks again, and shows it when it comes.
    @Test func aFailedPageAheadWaitsForATap() async {
        let (a, b) = (a, b)
        let failing = Flag()
        failing.on = true
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            if after == nil { return Fixture.page([a], token: "t1") }
            if failing.on { throw APIFailure.unexpected(status: 502) }
            return Fixture.page([b])
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        model.fetchAhead()
        #expect(await eventually {
            let n = await asked.all.count
            return n == 2 && !model.wantsAhead
        })
        #expect(model.canLoadMore)
        failing.on = false
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b"])
        #expect(await asked.all.count == 3)
    }

    @Test func aServerWithoutPageTokensPagesByItsCursor() async {
        let (a, b) = (a, b)
        let asked = Calls<PageAfter?>()
        let model = FeedModel(feed: { after in
            await asked.record(after)
            return after == nil ? Fixture.page([a], next: "2026-09-01T08:00:00.000Z") : Fixture.page([b])
        }, recommended: { [] }, patience: .milliseconds(10))
        await model.load()
        await model.loadMore()
        #expect(ids(model.cards) == ["a", "b"])
        #expect(await asked.all == [nil, .cursor("2026-09-01T08:00:00.000Z")])
    }

    @Test func aPullKeepsTheFeedOnScreenAndTakesItsOwnPicks() async {
        let (a, x, b, c) = (a, x, b, c)
        let first = Gate<[FeedCard]>(), latest = Gate<FeedPage>()
        let pages = Calls<Int>(), picks = Calls<Int>()
        let model = FeedModel(feed: { _ in
            await pages.record(1)
            // The load's page at once; the pull's when the test says.
            if await pages.all.count == 1 { return Fixture.page([a]) }
            return await latest.wait()
        }, recommended: {
            await picks.record(1)
            // The first load's picks hang; the pull's come at once.
            if await picks.all.count == 1 { return await first.wait() }
            return [b]
        }, patience: .milliseconds(200))

        await model.load()
        #expect(ids(model.cards) == ["a"])
        let pulling = Task { await model.refresh() }
        #expect(await eventually {
            let (asked, picked) = (await pages.all.count, await picks.all.count)
            return asked == 2 && picked == 2
        })
        // While the server thinks, the feed stays: never the skeleton (a full load's `.loading`).
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a"])

        await latest.open(Fixture.page([c, a]))
        await pulling.value
        // As after a fresh load: the pull's picks head the feed, the latest behind "load more".
        #expect(ids(model.cards) == ["b"])
        #expect(model.refreshFailure == nil)
        await model.loadMore()
        #expect(ids(model.cards) == ["b", "c", "a"])

        // The first load's picks, late: moot.
        await first.open([x])
        try? await Task.sleep(for: .milliseconds(50))
        #expect(!model.picksOnTop)
        #expect(ids(model.cards) == ["b", "c", "a"])
    }

    @Test func aPullThatBringsNothingBackKeepsTheFeedAndSaysSoQuietly() async {
        let (a, b, x) = (a, b, x)
        let failing = Flag()
        let model = FeedModel(feed: { _ in
            if failing.on { throw APIFailure.unexpected(status: 502) }
            return Fixture.page([a, b])
        }, recommended: {
            if failing.on { throw APIFailure.unexpected(status: 502) }
            return []
        }, patience: .milliseconds(10))
        await model.load()
        #expect(ids(model.cards) == ["a", "b"])

        failing.on = true
        await model.refresh()
        // Not the page's load error: the cards stay, and the failure is the feed's quiet line.
        #expect(model.phase == .loaded)
        #expect(ids(model.cards) == ["a", "b"])
        #expect(model.refreshFailure == .failed)
        #expect(model.refreshFailure?.message == L10n.Native.loadError)

        // The next pull that brings something clears it.
        failing.on = false
        await model.refresh()
        #expect(model.refreshFailure == nil)
        // So does any later answer (the app back after a while asks again behind the feed).
        failing.on = true
        await model.refresh()
        #expect(model.refreshFailure == .failed)
        failing.on = false
        await model.revalidate()
        #expect(model.refreshFailure == nil)

        // Picks alone still count as something.
        let picksOnly = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) }, recommended: { [x] },
                                  patience: .milliseconds(10))
        await picksOnly.load()
        #expect(await eventually { picksOnly.phase == .loaded })
        await picksOnly.refresh()
        #expect(picksOnly.refreshFailure == nil)
        #expect(ids(picksOnly.cards) == ["x"])
    }

    @Test func refreshedFurtherDownTheReaderKeepsThePagesRead() async {
        // VoiceOver's Refresh on a card of the third page of the latest: the cards round it stay.
        let (a, b, c, x) = (a, b, c, x)
        let n = Fixture.card("n"), y = Fixture.card("y")
        let refreshed = Flag(), failing = Flag()
        let model = FeedModel(feed: { after in
            if failing.on { throw URLError(.notConnectedToInternet) }
            switch after {
            case nil: return refreshed.on ? Fixture.page([n, a], token: "t1") : Fixture.page([a], token: "t1")
            case .token("t1"): return Fixture.page([b], token: "t2")
            default: return Fixture.page([c])
            }
        }, recommended: {
            if failing.on { throw URLError(.notConnectedToInternet) }
            return refreshed.on ? [y] : [x]
        }, patience: .seconds(5))
        await model.load()
        await model.loadMore()
        await model.loadMore()
        await model.loadMore()
        #expect(ids(model.cards) == ["x", "a", "b", "c"])

        refreshed.on = true
        await model.refreshInPlace()
        // The new card on top of the pages read, all of them still there; the latest still showing.
        #expect(model.latestVisible)
        #expect(ids(model.cards) == ["y", "n", "a", "b", "c"])
        #expect(model.refreshFailure == nil)

        // Nothing back: the feed as it was, and why, quietly.
        failing.on = true
        await model.refreshInPlace()
        #expect(ids(model.cards) == ["y", "n", "a", "b", "c"])
        #expect(model.refreshFailure == .offline)
    }

    @Test func aPullWhileOfflineSaysSo() async {
        let a = a
        let offline = Flag()
        let model = FeedModel(feed: { _ in
            if offline.on { throw URLError(.notConnectedToInternet) }
            return Fixture.page([a])
        }, recommended: {
            if offline.on { throw URLError(.notConnectedToInternet) }
            return []
        }, patience: .milliseconds(10))
        await model.load()
        offline.on = true
        await model.refresh()
        #expect(ids(model.cards) == ["a"])
        #expect(model.refreshFailure == .offline)
        #expect(model.refreshFailure?.message == L10n.Native.offline)
    }

    @Test func aPullWithNothingOnScreenIsAnOrdinaryLoad() async {
        let model = FeedModel(feed: { _ in throw APIFailure.unexpected(status: 502) },
                              recommended: { throw APIFailure.unexpected(status: 502) }, patience: .milliseconds(10))
        await model.load()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
        // Nothing to keep: the page's own error and retry, not the quiet line.
        await model.refresh()
        try? await Task.sleep(for: .milliseconds(50))
        #expect(model.phase == .failed("HTTP 502"))
        #expect(model.refreshFailure == nil)
    }

    @Test func picksThatMissThePullsPatienceGoOnTopOfTheLatest() async {
        let (a, b, x) = (a, b, x)
        let pulled = Gate<[FeedCard]>()
        let asked = Calls<Int>()
        let model = FeedModel(feed: { _ in Fixture.page([a]) }, recommended: {
            await asked.record(1)
            return await asked.all.count == 1 ? [] : await pulled.wait()
        }, patience: .milliseconds(20))
        await model.load()
        #expect(ids(model.cards) == ["a"])

        await model.refresh()
        // The latest came and the picks didn't in time: the feed is the latest's.
        #expect(model.refreshFailure == nil)
        await pulled.open([x, b])
        // Late for the pull, they go on top of the latest card on screen, as late picks do.
        #expect(await eventually { model.picksOnTop })
        #expect(ids(model.cards) == ["x", "b", "a"])
        #expect(model.leadingPicks == 2)
        #expect(model.picksLanded == 1)
    }

    /// A kept feed on a cold start, its picks coming behind it (revalidate): one landing — and a pull
    /// whose picks come in time leads with them, landing nothing.
    @Test func picksForAKeptFeedLandOnceAndAPullsInTimeLandNone() async {
        let (a, b, x) = (a, b, x)
        let picks = Gate<[FeedCard]>()
        let keeping = FeedKeeping(latest: { Fixture.page([a, b]) }, picks: { [] }, keepLatest: { _ in }, keepPicks: { _ in })
        let model = FeedModel(feed: { _ in Fixture.page([a, b]) }, recommended: { await picks.wait() },
                              patience: .milliseconds(20), keeping: keeping)
        let loading = Task { await model.load() }
        #expect(await eventually { model.phase == .loaded })
        await picks.open([x])
        await loading.value
        #expect(model.picksOnTop)
        #expect(model.picksLanded == 1)

        // A pull whose picks are there in time: they head the feed as a fresh load's do, landing nothing.
        let pulled = FeedModel(feed: { _ in Fixture.page([a]) }, recommended: { [x] }, patience: .seconds(5))
        await pulled.load()
        await pulled.refresh()
        #expect(ids(pulled.cards) == ["x"])
        #expect(pulled.picksLanded == 0)
    }
}

/// 今天的推薦來了 · 往上看 (round 7 §2): told to a reader down the list when picks land above them,
/// never at the top; taken down once the top is reached by hand or the feed leaves the screen; picks
/// that landed while the feed was out of sight told of once it is back, the reader still down the list.
@MainActor @Suite struct PicksNoticeTests {
    @Test func toldDownTheListNeverAtTheTop() {
        var notice = PicksNotice()
        let atTheTop = notice.landed(atTop: true, inView: true)
        #expect(!atTheTop)
        let down = notice.landed(atTop: false, inView: true)
        #expect(down)
        notice.shown(7)
        #expect(notice.toast == 7)
        // The top reached by hand: its job is done.
        let reached = notice.reachedTop()
        #expect(reached == 7)
        #expect(notice.toast == nil)
        let again = notice.reachedTop()
        #expect(again == nil)
    }

    @Test func landedOutOfSightIsToldOnceTheFeedIsBack() {
        var notice = PicksNotice()
        let away = notice.landed(atTop: false, inView: false)
        #expect(!away)
        #expect(notice.owed)
        let back = notice.back(atTop: false)
        #expect(back)
        #expect(!notice.owed)
        // Told once only.
        let twice = notice.back(atTop: false)
        #expect(!twice)
        // Back at the top already: the picks are in view, nothing to tell.
        _ = notice.landed(atTop: false, inView: false)
        let atTheTop = notice.back(atTop: true)
        #expect(!atTheTop)
        // The top reached meanwhile: nothing owed.
        _ = notice.landed(atTop: false, inView: false)
        _ = notice.reachedTop()
        let afterTop = notice.back(atTop: false)
        #expect(!afterTop)
    }

    @Test func theFeedLeavingTakesTheToastDown() {
        var notice = PicksNotice()
        notice.shown(3)
        let first = notice.takeDown()
        #expect(first == 3)
        let second = notice.takeDown()
        #expect(second == nil)
    }

    /// The shell's toast with its action: the arrow, 往上看 after the words, the whole pill named by
    /// both, the time a toast with an action has — and a tap takes the list up.
    @Test func theToastIsTheWayUp() {
        final class Taps { var up = 0 }
        let taps = Taps()
        let toasts = ToastCenter(sleep: { _ in try await Task.sleep(for: .seconds(60)) }, assistive: { false }, announce: { _ in })
        toasts.show(L10n.Home.Recommended.arrived, action: PicksNotice.action { taps.up += 1 })
        let toast = toasts.current
        #expect(toast?.message == L10n.Home.Recommended.arrived)
        #expect(toast?.action?.label == L10n.Home.Recommended.arrivedAction)
        #expect(toast?.action?.icon == .arrowUp)
        #expect(toast?.action?.accessibilityLabel == "\(L10n.Home.Recommended.arrived) · \(L10n.Home.Recommended.arrivedAction)")
        #expect(toast?.duration == ToastCenter.actionDuration)
        toasts.act()
        #expect(taps.up == 1)
        #expect(toasts.current == nil)
    }
}
