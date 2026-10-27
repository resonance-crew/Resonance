import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 16 (2026-10-27): the phone's tab bar of glyphs alone (the chosen one its solid twin) that the home
/// feed scrolls out of the way.
@MainActor @Suite struct RoundSixteenTabBarTests {
    @Test func theChosenTabIsItsSolidTwinAndThePenHasNone() {
        let items = MainTabView.tabItems(notifications: 0, messages: 0)
        let chosen = items.map { $0.glyph(selected: true) }
        #expect(chosen == [.sparkleFill, .chatFill, .pen, .bellFill, .cardsFill])
        #expect(items.map { $0.glyph(selected: false) } == [.sparkle, .chat, .pen, .bell, .cards])
        // A 52 bar (it was 60), and a toast still 12 over it.
        #expect(OrganicTabBar<AppTab>.height == 52)
        #expect(ToastPlacement.bottom(.compact, tabBar: true) == 52 + HeaderEdge.height + 12)
    }

    /// Steps the list down (or up) by `steps`, from where it is, and answers whether the bar is hidden after.
    private func scroll(_ rule: inout TabBarScroll, from start: CGFloat, by steps: [CGFloat], limit: CGFloat = 5000) -> Bool {
        var y = start
        var hidden = rule.hidden
        for step in steps {
            y += step
            hidden = rule.scrolled(to: y, limit: limit)
        }
        return hidden
    }

    @Test func itHidesOnlyAfter24OfDownwardScrollPastTheFirst80() {
        var rule = TabBarScroll()
        rule.scrolled(to: 0, limit: 5000)
        // 70 of scroll, all of it within the first 80: still shown.
        #expect(!scroll(&rule, from: 0, by: [10, 10, 10, 10, 10, 10, 10]))
        // Past 80, 23 more is not yet 24…
        var past = TabBarScroll()
        past.scrolled(to: 200, limit: 5000)
        #expect(!scroll(&past, from: 200, by: [10, 10, 3]))
        // …one more is.
        #expect(scroll(&past, from: 223, by: [1]))
    }

    @Test func twelveBackUpBringsItBackAndAFlickerDoesNot() {
        var rule = TabBarScroll()
        rule.scrolled(to: 300, limit: 5000)
        #expect(scroll(&rule, from: 300, by: [30]))
        // 11 up: still away; a step down again starts the count afresh.
        #expect(scroll(&rule, from: 330, by: [-5, -6]))
        #expect(scroll(&rule, from: 319, by: [2, -11]))
        #expect(!scroll(&rule, from: 310, by: [-1]))
    }

    @Test func theTopAndTheEndBringItBack() {
        var rule = TabBarScroll()
        rule.scrolled(to: 300, limit: 1000)
        #expect(scroll(&rule, from: 300, by: [40], limit: 1000))
        // The end of the list (nothing more to read): back.
        #expect(!scroll(&rule, from: 340, by: [660], limit: 1000))
        #expect(scroll(&rule, from: 1000, by: [-500, 40], limit: 1000))
        // The top (a status-bar tap's glide ends there): back.
        #expect(!scroll(&rule, from: 540, by: [-540], limit: 1000))
        // A list shorter than its screen never hides it.
        var short = TabBarScroll()
        short.scrolled(to: 0, limit: 0)
        #expect(!short.scrolled(to: 0, limit: 0))
    }

    @Test func showingItAgainForgetsTheRun() {
        let hiding = TabBarHiding()
        hiding.scrolled(to: 200, limit: 5000)
        hiding.scrolled(to: 240, limit: 5000)
        #expect(hiding.hidden)
        hiding.show()
        #expect(!hiding.hidden)
        hiding.scrolled(to: 250, limit: 5000)
        #expect(!hiding.hidden)
    }
}

/// Round 16 §3: the press layer keeps its reactions directly over the message and its actions directly
/// under it, moving the message, never the menus.
@MainActor @Suite struct RoundSixteenPressTests {
    /// An iPhone's window: 874 tall, 62 of status bar, 34 of home indicator (no keyboard).
    let height: CGFloat = 874, top: CGFloat = 62, bottom: CGFloat = 34
    let list = PressMetrics.listHeight(rows: 3, footer: true)

    @Test func theTrayIs232By52AndTheListGrowsByItsRows() {
        #expect(PressMetrics.trayWidth == 232 && PressMetrics.trayHeight == 52)
        #expect(PressMetrics.listHeight(rows: 3, footer: true) == 3 * 44 + 6 + 32 + 12)
    }

    @Test func aMessageWithRoomRoundItStaysWhereItIs() {
        let frame = CGRect(x: 60, y: 300, width: 200, height: 44)
        let place = PressPlacement.of(frame: frame, windowHeight: height, safeTop: top, safeBottom: bottom, tray: true, listHeight: list)
        #expect(place.shift == 0 && !place.clipped)
        #expect(place.trayY == 300 - 8 - 52)
        #expect(place.listY == 300 + 44 + 10)
    }

    @Test func nearTheFootItGlidesUpJustEnoughForTheList() {
        let frame = CGRect(x: 60, y: 700, width: 200, height: 44)
        let place = PressPlacement.of(frame: frame, windowHeight: height, safeTop: top, safeBottom: bottom, tray: true, listHeight: list)
        // The list's foot rests 12 over the home indicator.
        #expect(place.listY + list == height - bottom - 12)
        #expect(place.shift < 0)
    }

    @Test func nearTheTopItGlidesDownJustEnoughForTheTray() {
        let frame = CGRect(x: 60, y: 90, width: 200, height: 44)
        let place = PressPlacement.of(frame: frame, windowHeight: height, safeTop: top, safeBottom: bottom, tray: true, listHeight: list)
        #expect(place.trayY == top + 12)
        #expect(place.shift == top + 12 + 52 + 8 - 90)
        // Without reactions (a letter, a message still sending) there is no tray to make room for.
        let bare = PressPlacement.of(frame: frame, windowHeight: height, safeTop: top, safeBottom: bottom, tray: false, listHeight: list)
        #expect(bare.shift == 0)
    }

    @Test func aMessageTallerThanTheRoomShowsItsTopPart() {
        let frame = CGRect(x: 60, y: 100, width: 300, height: 2000)
        let place = PressPlacement.of(frame: frame, windowHeight: height, safeTop: top, safeBottom: bottom, tray: true, listHeight: list)
        #expect(place.clipped)
        #expect(place.trayY == top + 12)
        #expect(place.listY + list == height - bottom - 12)
        #expect(place.shownHeight == height - bottom - 12 - list - 10 - (top + 12) - 52 - 8)
        // Lifted no more than 4 at either end.
        #expect(PressPlacement.lift(height: 44) == 1.03)
        #expect(abs(PressPlacement.lift(height: 400) - 1.02) < 0.0001)
    }

    @Test func theSheetsLineUpWithTheMessagesSideInsideTheWindow() {
        let mine = CGRect(x: 180, y: 300, width: 200, height: 44)
        #expect(PressPlacement.x(width: 232, frame: mine, mine: true, windowWidth: 402) == 380 - 232)
        let theirs = CGRect(x: 50, y: 300, width: 120, height: 44)
        #expect(PressPlacement.x(width: 232, frame: theirs, mine: false, windowWidth: 402) == 50)
        // Never closer than 12 to a side.
        let wide = CGRect(x: 4, y: 300, width: 396, height: 44)
        #expect(PressPlacement.x(width: 232, frame: wide, mine: false, windowWidth: 402) == 12)
        #expect(PressPlacement.x(width: 232, frame: wide, mine: true, windowWidth: 402) == 402 - 12 - 232)
    }

    @Test func reactionsAreSummedInTheStickersOrderAndUnknownOnesAreLeftOut() {
        let at = Date()
        let message = ChatMessage(id: "m1", senderId: "bob", text: "hi", sentAt: at,
                                  reactions: ["alice": "heart", "bob": "heart", "carol": "wave"])
        let summary = ReactionSummary.of(message, me: "alice")
        #expect(summary.entries == [ReactionChips.Entry(id: .heart, count: 2)])
        #expect(summary.mine == .heart)
        let two = ReactionSummary.of(ChatMessage(id: "m2", senderId: "bob", text: "x", sentAt: at,
                                                 reactions: ["alice": "thumbs", "bob": "moved"]), me: "alice")
        #expect(two.entries.map(\.id) == [.moved, .thumbs])
        #expect(two.mine == .thumbs && two.theirs == .moved)
    }

    @Test func theMessagesListSaysWhoUnsentTheLastOne() {
        let unsentPreview = ConversationsStore.unsent(["senderId": "bob", "sentAt": 1, "unsent": true])
        #expect(unsentPreview)
        // A preview written over an older unsent one keeps new words: they win.
        #expect(!ConversationsStore.unsent(["senderId": "bob", "text": "hi", "unsent": true]))
        #expect(ConversationsScreen.preview(text: nil, image: false, fromMe: true, unsent: true) == L10n.Messages.unsentByYou)
        #expect(ConversationsScreen.preview(text: nil, image: false, fromMe: false, unsent: true, handle: "bob")
                == L10n.Messages.unsentByThem(handle: "bob"))
    }
}

/// Round 16 §6: the writer's link sheet and what the island says of the selection's link.
@MainActor @Suite struct RoundSixteenLinkTests {
    @Test func theIslandsStateNamesTheSelectionsLinkAndWhetherACardCanStand() {
        let editor = StoryEditorBridge(placeholder: "Write", layout: .canvas, locale: "zh-TW")
        editor.handle("state", ["active": [:], "canUndo": false,
                                "link": ["href": "https://example.com/rain", "display": "card", "standalone": true, "words": "https://example.com/rain"],
                                "canCard": true])
        #expect(editor.link == .init(href: "https://example.com/rain", display: .card, standalone: true, words: "https://example.com/rain"))
        #expect(editor.canCard)
        editor.handle("state", ["active": [:], "canUndo": false, "link": NSNull(), "canCard": false])
        #expect(editor.link == nil && !editor.canCard)
        // A link card tapped: the host opens its sheet.
        var tapped: String?
        editor.onLinkTap = { tapped = $0 }
        editor.handle("linkTap", ["href": "https://example.com/rain"])
        #expect(tapped == "https://example.com/rain")
    }

    @Test func theSheetStartsOnTheLinksOwnWayElseCardOnAnEmptyLineElseWords() {
        // An empty line (a caret, 卡片 offered): 卡片.
        let empty = StoryLinkRequest.of(link: nil, canCard: true, caret: true)
        #expect(empty.offersCard && empty.display == .card)
        // A whole paragraph selected: offered, starting on 文字.
        let selected = StoryLinkRequest.of(link: nil, canCard: true, caret: false)
        #expect(selected.offersCard && selected.display == .text)
        // Words in a sentence: no choice, words.
        let inline = StoryLinkRequest.of(link: .init(href: "https://example.com/b", display: .text, standalone: false, words: "看這篇"),
                                         canCard: false, caret: true)
        #expect(!inline.offersCard && inline.display == .text)
        // A card tapped: its own way.
        #expect(StoryLinkRequest.card("https://example.com/rain").display == .card)
    }

    @Test func aLiveCardsStoredPreviewsReachTheWriter() {
        let previews = DraftService.linkPreviews([["url": "https://example.com/rain", "title": "Rain", "image": "/api/link-image?u=x&s=y"],
                                                  ["url": "https://example.com/none"], "odd"])
        #expect(previews == [.init(url: "https://example.com/rain", title: "Rain", image: "/api/link-image?u=x&s=y")])
    }
}
