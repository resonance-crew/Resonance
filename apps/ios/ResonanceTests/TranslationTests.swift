import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Translating a story (round 25 §F, the reader's side): which cards get the translate line, what it says in each of
/// its states, the auto rule (swap when the line is in view, the toast when it isn't, 顯示原文 for the rest of the
/// visit), the switch's default and where it is kept, and the feed cards' translated titles and excerpts.
@MainActor @Suite struct TranslationTests {
    private static let zhTitle = "雨停之後的散步"
    private static let zhStory = "雨停了，我們沿著河堤慢慢走，聽見遠處的鐘聲。"
    private static let enTitle = "A walk after the rain"
    private static let enStory = "The rain stopped and we walked along the river, slowly, hearing bells far off."

    private func detail(title: String = zhTitle, story: String = zhStory, isOwner: Bool = false,
                        visibility: String = "public", anonymous: Bool = false) -> CardDetail {
        Fixture.detail(Fixture.card("c1", slug: "rain-walk", title: title, anonymous: anonymous, visibility: visibility),
                       story: story, isOwner: isOwner)
    }

    // MARK: §F3 — which stories get the line

    @Test func theTargetsFollowTheStorysScript() {
        #expect(StoryTranslationRule.targets(title: Self.zhTitle, story: Self.zhStory) == [.en])
        #expect(StoryTranslationRule.targets(title: Self.enTitle, story: Self.enStory) == [.zhTW])
        #expect(StoryTranslationRule.targets(title: "雨の後", story: "雨がやんで、川沿いをゆっくり歩いた。") == [.en, .zhTW])
        #expect(StoryTranslationRule.targets(title: "", story: "").isEmpty)
    }

    @Test func onlySomeoneElsesPublishedPublicStoryInAnotherLanguageGetsTheLine() {
        // A Chinese story under an English interface, an English one under 繁體中文 — anonymous ones too.
        #expect(StoryTranslationRule.offers(detail(), interface: .en))
        #expect(StoryTranslationRule.offers(detail(title: Self.enTitle, story: Self.enStory), interface: .zhTW))
        #expect(StoryTranslationRule.offers(detail(anonymous: true), interface: .en))
        // The interface's own language, the reader's own card, a card not public: no line.
        #expect(!StoryTranslationRule.offers(detail(), interface: .zhTW))
        #expect(!StoryTranslationRule.offers(detail(isOwner: true), interface: .en))
        #expect(!StoryTranslationRule.offers(detail(visibility: "private"), interface: .en))
        #expect(!StoryTranslationRule.offers(detail(visibility: "connections"), interface: .en))
        #expect(!StoryTranslationRule.offers(published: false, isPublic: true, trashed: false, isOwner: false,
                                             title: Self.zhTitle, story: Self.zhStory, interface: .en))
        #expect(!StoryTranslationRule.offers(published: true, isPublic: true, trashed: true, isOwner: false,
                                             title: Self.zhTitle, story: Self.zhStory, interface: .en))
        // At most 30 000 characters, as JavaScript counts them.
        let long = String(repeating: "雨", count: 30_001)
        #expect(!StoryTranslationRule.offers(published: true, isPublic: true, trashed: false, isOwner: false,
                                             title: Self.zhTitle, story: long, interface: .en))
        #expect(StoryTranslationRule.offers(published: true, isPublic: true, trashed: false, isOwner: false,
                                            title: Self.zhTitle, story: String(long.dropLast()), interface: .en))
    }

    // MARK: §F2 — the line's states

    @Test func theLineSaysWhatEachStateIs() {
        let idle = StoryTranslator.line(.idle)
        #expect(idle.lead == .globe && idle.words == nil && idle.control == L10n.Card.Translate.action)
        let working = StoryTranslator.line(.working)
        #expect(working.lead == .loader && working.words == L10n.Card.Translate.working && working.control == nil)
        let shown = StoryTranslator.line(.shown)
        #expect(shown.words == "\(L10n.Card.Translate.done) · " && shown.control == L10n.Card.Translate.showOriginal)
        #expect(StoryTranslator.line(.original).control == L10n.Card.Translate.showTranslation)
        #expect(StoryTranslator.line(.spent).words == L10n.Card.Translate.spent && StoryTranslator.line(.spent).control == nil)
        // 「沒有翻好，再試一次」 / "Couldn’t translate, try again".
        let zh = StoryTranslator.line(.failed, language: .zhTW)
        #expect(zh.words == L10n.Card.Translate.failed + "，")
        let en = StoryTranslator.line(.failed, language: .en)
        #expect(en.words == L10n.Card.Translate.failed + ", ")
        // In English the control runs on in the sentence, lower-case: "try again".
        let retry = L10n.Card.Translate.retry
        #expect(en.control == retry.prefix(1).lowercased() + retry.dropFirst())
        #expect(zh.control == retry)
        // No full stops, in any state.
        for phase in [StoryTranslator.Phase.idle, .working, .shown, .original, .failed, .spent] {
            let line = StoryTranslator.line(phase)
            for words in [line.words, line.control].compactMap({ $0 }) {
                #expect(!words.hasSuffix("。") && !words.hasSuffix("."), "\(phase): \(words)")
            }
        }
    }

    // MARK: §F4 — the auto rule

    private struct Failing: Error {}

    private func translator(_ answer: @escaping @Sendable () throws -> CardTranslation) -> StoryTranslator {
        StoryTranslator(key: "c1", language: .en) { _, _ in try answer() }
    }

    nonisolated private static let english = CardTranslation(to: "en", title: "The walk after the rain", story: "## Bells\n\nThe rain stopped.")

    @Test func aTapTranslatesAndTheLineTurnsBackAndForth() async {
        let t = translator { Self.english }
        #expect(t.phase == .idle && !t.showing)
        await t.request()
        #expect(t.phase == .shown && t.showing && t.title == "The walk after the rain")
        // Its own headings, for the contents rail.
        #expect(t.story?.toc.count == 1 && t.story?.type.lang == "en")
        t.showOriginal()
        #expect(t.phase == .original && !t.showing && t.keptOriginal)
        t.show()
        #expect(t.showing)
    }

    @Test func arrivingWithTheLineOutOfViewMovesNothingAndOffersTheToast() async {
        let t = translator { Self.english }
        var ready = 0
        await t.request(inView: { false }) { ready += 1 }
        #expect(ready == 1 && t.phase == .original && !t.showing)
        // The toast's 看譯文.
        t.show()
        #expect(t.showing)
    }

    @Test func showOriginalKeepsTheCardOriginalForTheVisit() async {
        let t = translator { Self.english }
        await t.request()
        t.showOriginal()
        #expect(t.keptOriginal && !t.showing)
        // Only the reader's own 顯示翻譯 brings it back; nothing is asked of the server again.
        final class Count: @unchecked Sendable { var asked = 0 }
        let count = Count()
        let counting = StoryTranslator(key: "c1", language: .en) { _, _ in count.asked += 1; return Self.english }
        await counting.request()
        counting.showOriginal()
        await counting.request()
        #expect(counting.showing && count.asked == 1)
    }

    @Test func aSpentBudgetAndAFailureSaySoAndAFailureMayBeTriedAgain() async {
        let spent = translator { throw APIFailure(code: "rate_limited", message: "", status: 429) }
        await spent.request()
        #expect(spent.phase == .spent)
        final class Flag: @unchecked Sendable { var fail = true }
        let flag = Flag()
        let flaky = translator {
            if flag.fail { throw APIFailure(code: "internal", message: "", status: 503) }
            return Self.english
        }
        await flaky.request()
        #expect(flaky.phase == .failed)
        flag.fail = false
        await flaky.request()
        #expect(flaky.phase == .shown)
        let offline = translator { throw Failing() }
        await offline.request()
        #expect(offline.phase == .failed)
    }

    /// The page went while the model answered (its request task cancelled when the page disappeared): the toast's
    /// 譯文好了 · 看譯文 is never offered, nor the translation swapped in and announced, over another screen.
    @Test func aRequestCutShortByThePageGoingNeverOffersOrShowsTheTranslation() async {
        final class Gate: @unchecked Sendable {
            var waiting: CheckedContinuation<Void, Never>?
            func wait() async { await withCheckedContinuation { waiting = $0 } }
        }
        for inView in [false, true] {
            let gate = Gate()
            let t = StoryTranslator(key: "c1", language: .en) { _, _ in
                // A slow model, and a fetch that answers though its task was cancelled.
                await gate.wait()
                return Self.english
            }
            var ready = 0
            let request = Task { await t.request(inView: { inView }) { ready += 1 } }
            #expect(await eventually { gate.waiting != nil }, "inView: \(inView)")
            #expect(t.phase == .working)
            request.cancel()
            gate.waiting?.resume()
            await request.value
            #expect(ready == 0 && !t.showing, "inView: \(inView)")
            // Kept for a return to the page: 顯示翻譯 brings it, nothing asked again.
            #expect(t.phase == .original && t.story != nil)
            t.show()
            #expect(t.showing)
        }
        // A fetch that gives up when cancelled: the line offers to translate again, not 再試一次.
        let gate = Gate()
        let t = StoryTranslator(key: "c1", language: .en) { _, _ in
            await gate.wait()
            try Task.checkCancellation()
            return Self.english
        }
        let request = Task { await t.request() }
        #expect(await eventually { gate.waiting != nil })
        request.cancel()
        gate.waiting?.resume()
        await request.value
        #expect(t.phase == .idle && !t.showing)
    }

    // MARK: §F4 — the switch

    @Test func theSwitchIsOffUntilTurnedOnAndKeptOnThisDevice() throws {
        let suite = "translation-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        #expect(!TranslationSettings(defaults: defaults).autoTranslate)
        TranslationSettings(defaults: defaults).setAutoTranslate(true)
        #expect(TranslationSettings(defaults: defaults).autoTranslate)
        #expect(defaults.bool(forKey: TranslationSettings.key))
        TranslationSettings(defaults: defaults).setAutoTranslate(false)
        #expect(!TranslationSettings(defaults: defaults).autoTranslate)
        #expect(TranslationSettings.key == "autoTranslateStories")
    }

    // MARK: §F7 — the feed's titles and excerpts

    private func translatedCard(by author: String = "bob") -> FeedCard {
        var card = Fixture.card("c1", slug: "rain-walk", title: Self.zhTitle, by: author)
        card.summaryTranslations = .init(value1: .init(en: .init(title: "A walk after the rain", excerpt: "The rain stopped…")))
        return card
    }

    @Test func aFeedCardShowsItsTranslationOnlyWithTheSwitchOnAndNeverTheReadersOwn() {
        let card = translatedCard()
        #expect(StoryTranslationRule.summary(card, on: false, interface: .en, viewer: "alice") == nil)
        let shown = StoryTranslationRule.summary(card, on: true, interface: .en, viewer: "alice")
        #expect(shown?.title == "A walk after the rain" && shown?.excerpt == "The rain stopped…")
        // No translation into the interface's language: as written.
        #expect(StoryTranslationRule.summary(card, on: true, interface: .zhTW, viewer: "alice") == nil)
        // The reader's own card: as they wrote it.
        #expect(StoryTranslationRule.summary(translatedCard(by: "alice"), on: true, interface: .en, viewer: "alice") == nil)
        // A card the server sent none for.
        #expect(StoryTranslationRule.summary(Fixture.card("c2"), on: true, interface: .en, viewer: "alice") == nil)
    }

    @Test func theFeedCardWearsTheMarkAndTheTranslationsLanguage() {
        let on = StoryCardList.content(translatedCard(), translate: true, viewer: "alice", interface: .en)
        #expect(on.title == "A walk after the rain" && on.excerpt == "The rain stopped…")
        #expect(on.translation?.language == "en" && on.translation?.mark == L10n.Card.Translate.mark)
        let off = StoryCardList.content(translatedCard(), translate: false, viewer: "alice", interface: .en)
        #expect(off.title == Self.zhTitle && off.translation == nil)
    }
}
