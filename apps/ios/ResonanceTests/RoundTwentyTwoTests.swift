import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 22: the composer's panels in the keyboard's place (which one, grown or not, when the keyboard takes
/// over again), the keyboard's height remembered per orientation, how many stickers play at once, a
/// conversation's unsent message kept on the device, the bundled stickers, and the list's line for a sticker.
@MainActor @Suite struct RoundTwentyTwoTests {
    // MARK: Panels

    @Test func smileOpensTheStickerPanelAndTheKeyboardTakesOverOnlyOnceItIsUp() {
        var panels = ComposerPanels()
        #expect(!panels.isOpen && !panels.ignoresKeyboard)
        // ☺: the panel, laid out where the keyboard is (the thread ignores the keyboard while it shows).
        #expect(panels.toggleStickers() == false)
        #expect(panels.shown == .stickers && panels.stickersOpen && panels.ignoresKeyboard)
        // ⌨: the keyboard is asked for; the panel stays under it until it is up — nothing dips between them.
        #expect(panels.toggleStickers() == true)
        #expect(panels.isOpen && panels.awaitingKeyboard && !panels.stickersOpen)
        panels.keyboardShown()
        #expect(!panels.isOpen && !panels.ignoresKeyboard)
        // A keyboard coming up with no panel waiting changes nothing.
        panels.keyboardShown()
        #expect(!panels.isOpen)
    }

    @Test func aTapOnTheFieldWhileAPanelShowsWaitsForTheKeyboardToo() {
        var panels = ComposerPanels()
        panels.open(.attach)
        #expect(panels.attachOpen)
        panels.keyboardRequested()
        #expect(panels.isOpen && !panels.attachOpen)
        panels.keyboardShown()
        #expect(panels.shown == .none)
        // ＋ again closes the attach panel without asking for the keyboard.
        panels.toggleAttach()
        #expect(panels.attachOpen)
        panels.toggleAttach()
        #expect(!panels.isOpen)
    }

    @Test func upGrowsTheStickerPanelOnlyWithNothingToSend() {
        var panels = ComposerPanels()
        #expect(panels.sendFace(canSend: false) == .send)
        panels.open(.stickers)
        #expect(panels.sendFace(canSend: false) == .expand)
        #expect(panels.sendFace(canSend: true) == .send)
        panels.setExpanded(true)
        #expect(panels.sendFace(canSend: false) == .collapse)
        // Written in: Send again, the panel still grown.
        #expect(panels.sendFace(canSend: true) == .send && panels.expanded)
        // Another panel starts short; the attach panel never shows ↑ / ↓.
        panels.open(.attach)
        #expect(!panels.expanded && panels.sendFace(canSend: false) == .send)
        panels.close()
        panels.setExpanded(true)
        #expect(!panels.expanded)
    }

    // MARK: Keyboard height

    @Test func theKeyboardsHeightIsRememberedPerOrientationAcrossLaunches() throws {
        var memory = KeyboardHeightMemory()
        #expect(memory.height(landscape: false, phone: true) == KeyboardHeightMemory.fallback)
        memory.record(height: 336, docked: true, landscape: false)
        // A floating keyboard, or a hardware keyboard's strip, is no height to remember.
        memory.record(height: 260, docked: false, landscape: false)
        memory.record(height: 55, docked: true, landscape: false)
        #expect(memory.height(landscape: false, phone: true) == 336)
        #expect(memory.height(landscape: true, phone: false) == KeyboardHeightMemory.fallback)
        memory.record(height: 398, docked: true, landscape: true)
        #expect(memory.height(landscape: true, phone: false) == 398)
        // A phone on its side keeps the panel to about 200.
        #expect(memory.height(landscape: true, phone: true) == KeyboardHeightMemory.landscapePhoneCap)
        let defaults = try #require(UserDefaults(suiteName: "RoundTwentyTwoTests-\(UUID().uuidString)"))
        memory.save(defaults)
        #expect(KeyboardHeightMemory.load(defaults) == memory)
    }

    // MARK: Playback

    @Test func atMostThreeStickersPlayTheNewestTakingTheLongestPlayingsPlace() {
        var limiter = StickerPlaybackLimiter()
        #expect(limiter.autoplays("a"))
        #expect(limiter.start("a").isEmpty)
        #expect(limiter.start("b").isEmpty)
        #expect(limiter.start("c").isEmpty)
        #expect(limiter.start("d") == ["a"])
        #expect(limiter.playing == ["b", "c", "d"])
        // Played once on its own: it doesn't again as it comes back on screen (a tap still replays it).
        #expect(!limiter.autoplays("a"))
        limiter.end("c")
        #expect(limiter.playing == ["b", "d"])
        // Replaying one already playing moves it to the newest, stopping nothing.
        #expect(limiter.start("b").isEmpty)
        #expect(limiter.playing == ["d", "b"])
    }

    // MARK: Drafts

    final class Clock {
        var now = Date(timeIntervalSince1970: 1_800_000_000)
    }

    @Test func aConversationsUnsentMessageIsKeptWithItsReplyNoteAndCard() {
        let root = FileManager.default.temporaryDirectory.appending(path: "ChatDraftsTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = Clock()
        let launch = { ChatDrafts(root: root, now: { clock.now }) }
        let drafts = launch()
        let quote = ReplyQuote(id: "m1", senderId: "bob", text: "嗨")
        let note = MessagingAPI.NoteRef(cardId: "letter", noteId: "n1")
        let before = drafts.revision
        drafts.keep(text: "寫到一半\n第二行", replyTo: quote, noteRef: note, cardId: "rain-walk", uid: "alice", pair: "alice_bob")
        #expect(drafts.revision > before)
        // The next launch finds it all, per account and conversation.
        let read = launch().draft(uid: "alice", pair: "alice_bob")
        #expect(read?.text == "寫到一半\n第二行")
        #expect(read?.replyTo == quote && read?.noteRef == note && read?.cardId == "rain-walk")
        #expect(launch().draft(uid: "alice", pair: "alice_carol") == nil)
        #expect(launch().draft(uid: "bob", pair: "alice_bob") == nil)
        // The list's line: one line of its words.
        #expect(drafts.preview(uid: "alice", pair: "alice_bob") == "寫到一半 第二行")
        // A reply alone is still a draft (no words to show on the row); emptied of everything, it goes.
        drafts.keep(text: " ", replyTo: quote, noteRef: nil, cardId: nil, uid: "alice", pair: "alice_bob")
        #expect(drafts.draft(uid: "alice", pair: "alice_bob") != nil && drafts.preview(uid: "alice", pair: "alice_bob") == nil)
        drafts.keep(text: "", replyTo: nil, noteRef: nil, cardId: nil, uid: "alice", pair: "alice_bob")
        #expect(launch().draft(uid: "alice", pair: "alice_bob") == nil)
    }

    @Test func draftsAreSentClearedPrunedAndGoWithTheAccount() {
        let root = FileManager.default.temporaryDirectory.appending(path: "ChatDraftsTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: root) }
        let clock = Clock()
        let drafts = ChatDrafts(root: root, now: { clock.now })
        for i in 0..<55 {
            clock.now += 1
            drafts.keep(text: "draft \(i)", replyTo: nil, noteRef: nil, cardId: nil, uid: "alice", pair: "p\(i)")
        }
        // The newest 50 stay, the oldest going first.
        #expect(drafts.draft(uid: "alice", pair: "p0") == nil)
        #expect(drafts.draft(uid: "alice", pair: "p54")?.text == "draft 54")
        // Sent: cleared.
        drafts.clear(uid: "alice", pair: "p54")
        #expect(drafts.draft(uid: "alice", pair: "p54") == nil)
        // Thirty days on, unsent drafts are gone.
        clock.now += ChatDrafts.maxAge + 1
        #expect(ChatDrafts(root: root, now: { clock.now }).draft(uid: "alice", pair: "p53") == nil)
        // Another account signs in: alice's file goes.
        drafts.keep(text: "x", replyTo: nil, noteRef: nil, cardId: nil, uid: "alice", pair: "p1")
        drafts.retainOnly("bob")
        #expect(ChatDrafts(root: root, now: { clock.now }).draft(uid: "alice", pair: "p1") == nil)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        #expect(!files.contains { $0.contains("alice") })
    }

    // MARK: Stickers

    @Test func theAppCarriesEveryStickerOfTheCatalog() throws {
        let library = StickerLibrary(defaults: try #require(UserDefaults(suiteName: "RoundTwentyTwoTests-\(UUID().uuidString)")))
        #expect(library.catalog.packs.map(\.id) == ["tuck", "twine", "nod", "pip", "hush"])
        for sticker in library.catalog.all {
            #expect(library.bundled(sticker) != nil)
            #expect(library.bundled(sticker, thumb: true) != nil)
        }
        #expect(library.catalog.packs.allSatisfy { library.icon($0) != nil })
        // One from a pack this build doesn't carry: not in the bundle, and a name only its words give.
        let later = StickerRef(pack: "later", id: "wave")
        #expect(library.bundled(later) == nil && library.name(later) == nil)
        #expect(library.label(later) == L10n.Messages.stickerUnknown)
    }

    @Test func recentsArePerAccountAndForgottenForAnother() throws {
        let defaults = try #require(UserDefaults(suiteName: "RoundTwentyTwoTests-\(UUID().uuidString)"))
        let library = StickerLibrary(defaults: defaults)
        library.use(account: "alice")
        library.sent(StickerRef(pack: "pip", id: "hi"))
        library.sent(StickerRef(pack: "nod", id: "hug"))
        #expect(library.shownRecents.map(\.id) == ["hug", "hi"])
        // Read again on the next launch.
        let next = StickerLibrary(defaults: defaults)
        next.use(account: "alice")
        #expect(next.recents.map(\.id) == ["hug", "hi"])
        // Another account: none, and alice's are gone from the device.
        next.use(account: "bob")
        #expect(next.recents.isEmpty)
        let again = StickerLibrary(defaults: defaults)
        again.use(account: "alice")
        #expect(again.recents.isEmpty)
    }

    @Test func theListSaysASticker() {
        #expect(ConversationsScreen.preview(text: "〔貼圖：謝謝〕", image: false, fromMe: false, sticker: true) == L10n.Messages.stickerShared)
        #expect(ConversationsScreen.preview(text: "〔貼圖：謝謝〕", image: false, fromMe: true, sticker: true)
            == L10n.Messages.youPrefix + L10n.Messages.stickerShared)
        // An album's last picture: how many were sent (`lastMessage.album.count`).
        #expect(ConversationsScreen.preview(text: "", image: true, fromMe: false, album: 3) == L10n.Messages.albumShared(count: 3))
        #expect(ConversationsScreen.preview(text: "", image: true, fromMe: false) == L10n.Messages.imageShared)
        // Unsent still reads as unsent.
        #expect(ConversationsScreen.preview(text: nil, image: false, fromMe: true, unsent: true, sticker: true) == L10n.Messages.unsentByYou)
    }

    @Test func theComposersLinesAreCountedFromItsHeight() {
        let metrics = ComposerText.at(scale: 1)
        for lines in 1...8 {
            #expect(ComposerTextView.lines(height: ComposerTextView.height(lines: lines, metrics: metrics), metrics: metrics) == lines)
        }
    }
}
