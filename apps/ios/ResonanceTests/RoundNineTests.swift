import DesignSystem
import FirebaseFirestore
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 9 (2026-10-24): the reading and people heads, the story's end row, the floating composer, the
/// trash's row, tables, the cover controls in the card's colours, the resonances as full cards, the
/// card picker, the menu's anchor and the thought map's 私人卡.
@MainActor @Suite struct RoundNineTests {
    // MARK: §2, §9 — the heads, from the bar's pen line

    @Test func theHeadsAreMeasuredFromTheBarsPenLine() {
        // The pen line rests 3.2 over the bar's foot, where a page's content starts.
        #expect(abs(HeaderEdge.lineDepth - 3.2) < 0.001)
        #expect(abs(PenLineGap.fromFoot(48) - 44.8) < 0.001)
        #expect(abs(PenLineGap.fromFoot(64) - 60.8) < 0.001)
        #expect(PenLineGap.fromFoot(2) == 0, "never a negative pad")
        // The people head: 40 on a phone, 56 on a tablet; the avatar → the pen name 16.
        #expect(PenLineGap.people(compact: true) == 40 && PenLineGap.people(compact: false) == 56)
        #expect(Tokens.peopleNameGap == 16)
        // A phone's byline is found under the reading head before it is measured.
        #expect(ReadingMeter.bylineBottomGuess > PenLineGap.fromFoot(48) + 44)
    }

    // MARK: §3 — the story's end row

    @Test func theResponseBarGivesWayInThreeStepsAndNeverOverflows() {
        let verb = SegmentSpec.verb(id: "resonate", icon: .wave, label: "Resonated") {}
        let note = SegmentSpec(id: "note", icon: .note, label: "Send a note", collapsesAt: 2) {}
        let bookmark = SegmentSpec(id: "bookmark", icon: .bookmark, label: "Save", collapsible: true) {}
        let bar = [verb, note, bookmark]
        // The bookmark goes first, then the note: only the verb keeps its words.
        #expect(SegmentedActionBar.steps(bar) == [1, 2])
        #expect(SegmentedActionBar.iconOnly(bookmark, through: 1) && !SegmentedActionBar.iconOnly(note, through: 1))
        #expect(SegmentedActionBar.iconOnly(bookmark, through: 2) && SegmentedActionBar.iconOnly(note, through: 2))
        #expect(!SegmentedActionBar.iconOnly(verb, through: 2))
        // A segment without a glyph never loses its words.
        #expect(!SegmentedActionBar.iconOnly(SegmentSpec(id: "x", label: "Words", collapsesAt: 1) {}, through: 1))
        // Past the last step the row is exactly as wide as it is offered, shared by what each asked.
        let squeezed = SegmentWidths.fit(ideal: [160, 52, 52], flexible: [true, false, false], total: 240)
        #expect(abs(squeezed.reduce(0, +) - 240) < 0.001)
        #expect(squeezed[0] > squeezed[1])
        // While they fit, the even share as before.
        #expect(SegmentWidths.fit(ideal: [80, 100, 60], flexible: [true, true, true], total: 360) == [120, 120, 120])
    }

    // MARK: §4 — the composer

    @Test func oneLineSitsCentredInFortyEightAtEveryTextSizeUpToTheCap() {
        for scale in [0.82, 0.9, 1.0, 1.075, 1.15, 1.25] as [CGFloat] {
            let text = ComposerText.at(scale: scale)
            // The tallest line the field draws (a line of Chinese), padded to exactly the capsule's 48.
            #expect(text.lineHeight + 2 * text.padding <= ComposerMetrics.height + 0.001, "scale \(scale)")
            #expect(abs(text.lineHeight + 2 * text.padding - ComposerMetrics.height) < 0.001 || text.padding == 0)
            #expect(text.padding > 0, "a line of the field's text fits the 48 at \(scale)")
            #expect(text.font.pointSize == (16 * scale).rounded())
        }
        #expect(ComposerMetrics.textPadding(lineHeight: 24) == 12)
        #expect(ComposerMetrics.textPadding(lineHeight: 60) == 0)
        #expect(ComposerMetrics.maxLines == 5 && ComposerMetrics.sendWidth == 52 && ComposerMetrics.attachWidth == 44)
        // The halo: 4 of paper past a pen line's outer edge.
        #expect(abs(ComposerMetrics.haloStroke(pen: Tokens.ink) - (Tokens.ink + 8)) < 0.001)
    }

    @Test func theThreadKeepsClearOfWhatFloatsOverItsFoot() {
        // The thread runs 90 past what shows over the foot: the newest message stands 90 + 12 up.
        #expect(ThreadFoot.room(threadBottom: 812, shownHeight: 722) == 90)
        // Nothing measured yet, or a thread that ends above the room: nothing.
        #expect(ThreadFoot.room(threadBottom: 0, shownHeight: 700) == 0)
        #expect(ThreadFoot.room(threadBottom: 700, shownHeight: 0) == 0)
        #expect(ThreadFoot.room(threadBottom: 600, shownHeight: 700) == 0)
        // A measure taken mid-layout never runs past half the thread.
        #expect(ThreadFoot.room(threadBottom: 800, shownHeight: 100) == 400)
    }

    // MARK: §6 — tables

    @Test func everyCellStartsAtTheStartEdgeAndTheRulesStayCalm() {
        for alignment in [TableAlignment.start, .left, .center, .right] {
            #expect(StoryTable.alignment(alignment) == .natural)
        }
        #expect(StoryTable.ruleSteps(100) == 3 && StoryTable.ruleSteps(450) == 5 && StoryTable.ruleSteps(900) == 10)
        let seed = StoryTable.ruleSeed(table: seedFromString("路線|距離"), row: 0)
        #expect(seed == StoryTable.ruleSeed(table: seedFromString("路線|距離"), row: 0), "the same story draws the same pen")
        #expect(seed != StoryTable.ruleSeed(table: seedFromString("路線|距離"), row: 1))
        for amp in [StoryTable.headRuleAmp, StoryTable.rowRuleAmp, 5] {
            let pts = StoryTable.rulePoints(start: -1.5, length: 400, y: 10, amp: amp, seed: seed)
            #expect(pts.allSatisfy { abs($0.y - 10) <= StoryTable.maxRuleAmp + 0.0001 })
            #expect(abs(pts.first!.x + 1.5) < 0.001 && abs(pts.last!.x - 398.5) < 0.001)
        }
        #expect(StoryTable.headRule == Tokens.inkLight && StoryTable.headRuleInk == 0.6 && StoryTable.rowRuleInk == 0.3)
    }

    // MARK: §8 — the cover's controls in the card's colours

    @Test func aCoverlessPreviewTakesItsFamilyFromItsId() {
        #expect(CardPalette.family(id: "m1") == Int(seedFromId("m1")) % 6)
        #expect(CardPalette.family(id: "card-77") == CardPalette.family(id: "card-77"))
        let families = Set(["a", "b", "c", "d", "e", "f", "g", "h", "draft-1", "draft-2", "x9"].map(CardPalette.family(id:)))
        #expect(families.count > 1, "not the first family on every card")
        // No id yet: the first family; a cover: its hue's family, whatever the id.
        #expect(PublishStep.previewPalette(accentHue: nil, cardId: nil).index == 0)
        #expect(PublishStep.previewPalette(accentHue: nil, cardId: "m1").index == CardPalette.family(id: "m1"))
        #expect(PublishStep.previewPalette(accentHue: 140, cardId: "m1").index == 2)
        // The faces: the family's deep pen with its paper's words, its tonal step when it can't be pressed,
        // its fill with its deep pen's words on the picture.
        let palette = CardPalette(index: 4)
        #expect(OrganicButtonFace.cardDeep(palette).fill == palette.deep)
        #expect(OrganicButtonFace.cardDeep(palette).label == palette.interior)
        #expect(OrganicButtonFace.cardDeepDisabled(palette).fill == palette.accent)
        #expect(OrganicButtonFace.cardChip(palette).fill == palette.fill)
        #expect(OrganicButtonFace.cardChip(palette).label == palette.deep)
        #expect(CardPalette(index: 0).deep == Tokens.cardBorder0Dark && CardPalette(index: 5).deep == Tokens.cardBorder5Dark)
    }

    // MARK: C1 — resonances as full cards, three and then 查看全部

    @Test func threeResonancesShowThenTheRestInPlace() {
        let five = (1...5).map { summary("r\($0)") }
        #expect(CardScreen.shownResonances(five, all: false).map(\.id) == ["r1", "r2", "r3"])
        #expect(CardScreen.resonancesHidden(five, all: false))
        #expect(CardScreen.shownResonances(five, all: true).count == 5)
        #expect(!CardScreen.resonancesHidden(five, all: true))
        let three = Array(five.prefix(3))
        #expect(!CardScreen.resonancesHidden(three, all: false))
        #expect(L10n.Card.ResonanceSection.showAll(count: 5).contains("5"))
    }

    // MARK: C2 — the card picker

    @Test func thePickerOffersPublishedPublicCardsOnly() {
        let cards = [summary("pub"), summary("draft", published: nil), summary("kept", visibility: "private"),
                     summary("friends", visibility: "connections")]
        #expect(CardPickerContent.pickable(cards).map(\.id) == ["pub"])
    }

    // MARK: C3 — a menu never hangs from a frame that isn't one

    @Test func aMenuNeverOpensFromAZeroOrStaleAnchor() {
        let screen = CGRect(x: 0, y: 0, width: 402, height: 874)
        let trigger = CGRect(x: 280, y: 600, width: 120, height: 44)
        // The trigger rebuilt a moment ago reported `.zero`: the frame read off the trigger at the tap wins.
        #expect(MenuAnchor.resolve(live: trigger, stored: .zero, screen: screen) == trigger)
        // A stale stored frame (mid-slide) gives way to the live one.
        #expect(MenuAnchor.resolve(live: trigger, stored: trigger.offsetBy(dx: 16, dy: 0), screen: screen) == trigger)
        // No live frame yet: the layout's report, when it is one.
        #expect(MenuAnchor.resolve(live: nil, stored: trigger, screen: screen) == trigger)
        // Neither is a frame: no panel yet (it waits a layout pass and asks again) — never the top-left corner.
        #expect(MenuAnchor.resolve(live: nil, stored: .zero, screen: screen) == nil)
        #expect(MenuAnchor.resolve(live: .zero, stored: .zero, screen: screen) == nil)
        #expect(MenuAnchor.resolve(live: CGRect(x: -500, y: -500, width: 40, height: 40), stored: .zero, screen: screen) == nil)
        // Placed from the trigger: its trailing edge on the trigger's, 8 under it — or over it near the foot.
        let under = MenuDrop.place(face: CGRect(x: 280, y: 100, width: 120, height: 44), screen: screen, panelHeight: 126)
        #expect(!under.above && under.vertical == 152 && under.trailing == 12)
        let over = MenuDrop.place(face: CGRect(x: 200, y: 800, width: 100, height: 44), screen: screen, panelHeight: 126)
        #expect(over.above && over.vertical == 874 - 800 + 8 && over.trailing == 102)
    }

    // MARK: C4 — the thought map's 私人卡

    @Test func theMapReadsTheMostRecentlyEditedPrivateCardsAndLocksThem() {
        func doc(_ id: String, minutesAgo: Double?, trashed: Bool = false) -> (id: String, data: [String: Any]) {
            var data: [String: Any] = ["authorId": "me", "thoughtCore": id, "story": "", "visibility": "private"]
            if let minutesAgo { data["updatedAt"] = Timestamp(date: Date(timeIntervalSinceNow: -minutesAgo * 60)) }
            if trashed { data["trashedAt"] = Timestamp(date: Date()) }
            return (id, data)
        }
        let docs = [doc("old", minutesAgo: 600), doc("new", minutesAgo: 1), doc("undated", minutesAgo: nil),
                    doc("mid", minutesAgo: 60), doc("binned", minutesAgo: 2, trashed: true)]
        #expect(ThoughtMapService.newestDrafts(docs, keep: 40).map(\.id) == ["new", "mid", "old", "undated"])
        #expect(ThoughtMapService.newestDrafts(docs, keep: 2).map(\.id) == ["new", "mid"])
        #expect(ThoughtMapService.ownLimit == 40 && ThoughtMapService.draftScan == 200)
        // A 私人卡 wears the lock, published or not; a shared card its audience's glyph.
        let draft = MapCard(id: "d", authorId: "me", slug: nil, title: "", story: "", tags: [], visibility: "public",
                            publishedAt: nil, mediaURL: nil, accentHue: nil)
        let kept = MapCard(id: "k", authorId: "me", slug: "k", title: "", story: "", tags: [], visibility: "private",
                           publishedAt: Date(), mediaURL: nil, accentHue: nil)
        let shared = MapCard(id: "s", authorId: "me", slug: "s", title: "", story: "", tags: [], visibility: "public",
                             publishedAt: Date(), mediaURL: nil, accentHue: nil)
        #expect(MapNodeView.metaIcon(draft) == .lock && MapNodeView.metaIcon(kept) == .lock && MapNodeView.metaIcon(shared) == .globe)
        #expect(ThoughtMapScreen.isPrivate(draft) && ThoughtMapScreen.isPrivate(kept) && !ThoughtMapScreen.isPrivate(shared))
        // The tray marks them the same way: the lock for a 私人卡, never the pen.
        #expect(ThoughtMapScreen.trayIcon(draft, resonated: false) == .lock && ThoughtMapScreen.trayIcon(kept, resonated: false) == .lock)
        #expect(ThoughtMapScreen.trayIcon(shared, resonated: false) == .cards && ThoughtMapScreen.trayIcon(shared, resonated: true) == .wave)
    }

    // MARK: Icon buttons

    @Test func aRestingIconButtonDrawsAtInk() {
        #expect(OrganicIconButton.restingStroke == Tokens.ink)
        #expect(Tokens.ink == 1.8 && Tokens.inkStrong == 2.2)
    }

    // MARK: Helpers

    private func summary(_ id: String, published: String? = "2026-10-01T08:00:00.000Z", visibility: String = "public") -> FeedCard {
        let json = """
        {"id":"\(id)","slug":"\(id)","title":"Card \(id)","excerpt":"…","tags":[],
         "publishedAt":\(published.map { "\"\($0)\"" } ?? "null"),"author":null,"anonymous":false,"visibility":"\(visibility)",
         "imageUrl":null,"imageLabel":null,"accentHue":null,"readMinutes":1,"referenceCardId":null,"reason":null}
        """
        return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
    }
}
