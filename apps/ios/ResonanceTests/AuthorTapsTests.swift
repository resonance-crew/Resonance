import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// What the author sees (round 26 §U3): on their own card, one line of who resonated — nothing at all before anyone
/// has, no number ever — opening a list of everyone, thirty a page, where a person who left a note on the card leads to
/// that conversation and one who only resonated to their page (a tap is no way to be written to).
@MainActor @Suite struct AuthorTapsTests {
    private func person(_ id: String, note: String? = nil) -> TapPerson {
        TapPerson(author: Fixture.author(id), note: note.map { .init(value1: .init(excerpt: $0)) })
    }

    @Test func theLineShowsOnlyOnceSomeoneResonated() {
        let card = Fixture.card("c1", by: "alice")
        #expect(!AuthorTaps.shows(Fixture.detail(card, tap: Fixture.tap(), isOwner: true)))
        #expect(!AuthorTaps.shows(Fixture.detail(card, tap: nil, isOwner: true)))
        #expect(AuthorTaps.shows(Fixture.detail(card, tap: Fixture.tap(faces: ["gus"]), isOwner: true)))
        // A reader's page has the row, never this line.
        #expect(!AuthorTaps.shows(Fixture.detail(card, tap: Fixture.tap(faces: ["gus"]), isOwner: false)))
    }

    @Test func theAuthorHearsTheNamesNeverACount() {
        let faces = ["gus", "hana", "bob"].map { Fixture.author($0) }
        #expect(TapState.spokenForAuthor(faces, more: true, language: .zhTW)
            == L10n.Card.Tap.facesAuthor(names: "gus、hana、bob，" + L10n.Card.Tap.more))
        #expect(TapState.spokenForAuthor(faces, more: false, language: .en) == L10n.Card.Tap.facesAuthor(names: "gus, hana, bob"))
    }

    @Test func aNoteLeadsToItsConversationATapAloneToTheirPage() {
        #expect(TapPersonRow.route(for: person("carol", note: "謝謝你寫下這段")) == .thread(handle: "carol", uid: "carol", note: nil))
        #expect(TapPersonRow.route(for: person("gus")) == .author("gus"))
    }

    @Test func showMoreAddsTheNextPageUnderTheFirst() async {
        let pages: [String?: TapList] = [
            nil: TapList(people: (0..<30).map { person("p\($0)") }, nextPageToken: "two"),
            "two": TapList(people: [person("p29"), person("p30"), person("p31")], nextPageToken: nil),
        ]
        let people = TapPeople { token in pages[token]! }
        await people.load()
        #expect(people.phase == .loaded && people.people.count == 30 && people.next == "two")
        await people.more()
        // One already shown is never there twice; the last page leaves nothing to show more of.
        #expect(people.people.map(\.author.id) == (0..<32).map { "p\($0)" })
        #expect(people.next == nil)
    }

    @Test func aListThatCantBeReadSaysSo() async {
        struct Down: Error {}
        let people = TapPeople { _ in throw Down() }
        await people.load()
        #expect(people.phase == .failed)
        #expect(people.people.isEmpty)
    }

    @Test func theAuthorsListIsADialogOnEveryDevice() {
        // 480 wide (a reader's phone list is 400, a wide window's reader popover 280).
        #expect(TapListMetrics.authorWidth == 480)
        #expect(TapListMetrics.dialogWidth == 400)
        #expect(TapListMetrics.popoverWidth == 280)
        #expect(TapListMetrics.popoverRows == 6)
    }
}
