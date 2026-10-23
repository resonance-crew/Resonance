import Foundation
import Testing
@testable import Resonance

/// A note's unsent words stay on the device (小紙條, the owner's ask): per account and card, as typed,
/// through the app being closed — until the note is sent, the words are emptied, or the account signs
/// out — at most 50 of them, none older than 30 days.
@MainActor @Suite struct NoteDraftsTests {
    final class Clock {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    private let root = FileManager.default.temporaryDirectory
        .appending(path: "NoteDraftsTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    private let clock = Clock()

    /// The device's drafts as a launch of the app reads them.
    private func launch() -> NoteDrafts {
        let clock = clock
        return NoteDrafts(root: root, now: { clock.now })
    }

    private func files() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
    }

    @Test func wordsAreKeptPerAccountAndCardAndOutliveTheApp() {
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = launch()
        drafts.keep("謝謝你寫下這張", uid: "alice", cardId: "letter")
        #expect(drafts.text(uid: "alice", cardId: "letter") == "謝謝你寫下這張")
        #expect(drafts.text(uid: "alice", cardId: "rain-walk") == nil)
        #expect(drafts.text(uid: "bob", cardId: "letter") == nil)
        // The next launch finds them on the disk, as typed — line breaks and a trailing space too.
        drafts.keep("第一行\n\n第二行 ", uid: "alice", cardId: "letter")
        #expect(launch().text(uid: "alice", cardId: "letter") == "第一行\n\n第二行 ")
        // No uid is ever a file name.
        #expect(!files().isEmpty)
        #expect(!files().contains { $0.contains("alice") })
    }

    @Test func sentOrEmptiedTheDraftGoes() {
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = launch()
        drafts.keep("寄出去了", uid: "alice", cardId: "letter")
        drafts.keep("還在寫", uid: "alice", cardId: "rain-walk")
        // Sent (the server's 201): gone, the other card's kept.
        drafts.clear(uid: "alice", cardId: "letter")
        #expect(drafts.text(uid: "alice", cardId: "letter") == nil)
        #expect(launch().text(uid: "alice", cardId: "letter") == nil)
        #expect(launch().text(uid: "alice", cardId: "rain-walk") == "還在寫")
        // Emptied (nothing but spaces left): gone too, and with nothing kept no file is left behind.
        drafts.keep(" \n ", uid: "alice", cardId: "rain-walk")
        #expect(launch().text(uid: "alice", cardId: "rain-walk") == nil)
        #expect(files().isEmpty)
    }

    @Test func atMostFiftyAreKeptTheOldestGoingFirst() {
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = launch()
        for i in 0...NoteDrafts.limit {
            clock.now += 60
            drafts.keep("note \(i)", uid: "alice", cardId: "card-\(i)")
        }
        let read = launch()
        #expect(read.text(uid: "alice", cardId: "card-0") == nil)
        #expect(read.text(uid: "alice", cardId: "card-1") == "note 1")
        #expect(read.text(uid: "alice", cardId: "card-\(NoteDrafts.limit)") == "note \(NoteDrafts.limit)")
        // Typing again on an old one makes it the newest: the next to go is the one after it.
        clock.now += 60
        read.keep("note 1, again", uid: "alice", cardId: "card-1")
        clock.now += 60
        read.keep("one more", uid: "alice", cardId: "card-new")
        #expect(launch().text(uid: "alice", cardId: "card-1") == "note 1, again")
        #expect(launch().text(uid: "alice", cardId: "card-2") == nil)
    }

    @Test func noneIsKeptPastThirtyDays() {
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = launch()
        drafts.keep("old words", uid: "alice", cardId: "letter")
        clock.now += NoteDrafts.maxAge - 1
        #expect(launch().text(uid: "alice", cardId: "letter") == "old words")
        clock.now += 2
        #expect(launch().text(uid: "alice", cardId: "letter") == nil)
        // Gone from the disk as well, not only unread.
        #expect(files().isEmpty)
    }

    @Test func signingOutTakesTheAccountsDraftsWithIt() {
        defer { try? FileManager.default.removeItem(at: root) }
        let drafts = launch()
        drafts.keep("alice's words", uid: "alice", cardId: "letter")
        drafts.keep("bob's words", uid: "bob", cardId: "letter")
        // Switched to bob: only his stay on the device.
        drafts.retainOnly("bob")
        #expect(drafts.text(uid: "alice", cardId: "letter") == nil)
        #expect(launch().text(uid: "alice", cardId: "letter") == nil)
        #expect(launch().text(uid: "bob", cardId: "letter") == "bob's words")
        // Signed out: nobody's.
        drafts.retainOnly(nil)
        #expect(files().isEmpty)
        #expect(drafts.text(uid: "bob", cardId: "letter") == nil)
    }
}
