import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 10 (2026-10-25): the thought map opens every card of mine in the writer, the thread no longer
/// freezes after a picture is sent, a tap on the thread puts the keyboard away, and the composer's foot.
@MainActor @Suite struct RoundTenTests {
    // MARK: §1 — the thought map: every card of mine opens the writer

    @Test func everyCardOfMineOnTheMapOpensTheWriterAndOthersTheirPage() {
        func card(_ id: String, author: String, published: Date?, visibility: String) -> MapCard {
            MapCard(id: id, authorId: author, slug: published == nil ? nil : id, title: id, story: "", tags: [],
                    visibility: visibility, publishedAt: published, mediaURL: nil, accentHue: nil)
        }
        let neverPublished = card("draft", author: "me", published: nil, visibility: "private")
        let keptPrivate = card("kept", author: "me", published: Date(), visibility: "private")
        let shared = card("shared", author: "me", published: Date(), visibility: "public")
        let forConnections = card("close", author: "me", published: Date(), visibility: "connections")
        let theirs = card("theirs", author: "them", published: Date(), visibility: "public")
        // A 私人卡 opens the writer exactly as a shared card does (round 9 sent it to its page).
        for mine in [neverPublished, keptPrivate, shared, forConnections] {
            #expect(ThoughtMapScreen.opensWriter(mine, viewer: "me"), "\(mine.id)")
        }
        // Someone else's card (one I resonated with) opens its page; nobody signed in opens nothing in the writer.
        #expect(!ThoughtMapScreen.opensWriter(theirs, viewer: "me"))
        #expect(!ThoughtMapScreen.opensWriter(shared, viewer: nil))
        // The lock still marks a 私人卡 on the map and in the tray.
        #expect(ThoughtMapScreen.trayIcon(keptPrivate, resonated: false) == .lock)
    }

    // MARK: §4 — a tap on the thread puts the keyboard away

    @Test func theThreadsTapLeavesAMessagesOwnGesturesTheirTouch() {
        // It waits for a message's hold (its menu), a tap on a picture, a quote or a card, and a tap on a link in its words.
        #expect(KeyboardTapAwayView.yields(to: UILongPressGestureRecognizer()))
        #expect(KeyboardTapAwayView.yields(to: PartTapRecognizer()))
        let words = ChatTextView(), onWords = UITapGestureRecognizer()
        words.addGestureRecognizer(onWords)
        #expect(KeyboardTapAwayView.yields(to: onWords))
        // The list's own scrolling isn't one of them: a drag takes the keyboard down interactively instead.
        #expect(!KeyboardTapAwayView.yields(to: UIPanGestureRecognizer()))
        // It never holds a touch back from what is under it, and it is put on the list it is drawn in.
        let away = KeyboardTapAwayView()
        #expect(!away.tap.cancelsTouchesInView && !away.tap.delaysTouchesEnded)
        let list = UIScrollView()
        away.attach(to: list)
        #expect(list.gestureRecognizers?.contains(away.tap) == true)
        let other = UIScrollView()
        away.attach(to: other)
        #expect(list.gestureRecognizers?.contains(away.tap) != true && other.gestureRecognizers?.contains(away.tap) == true)
    }

    // MARK: §5 — the thread no longer freezes after a picture is sent

    @Test func aThreadSetAsideGoesBackToItsEdgeInUIKitKeepingItsPlace() {
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 402, height: 800))
        scroll.contentSize = CGSize(width: 402, height: 3000)
        let lock = SidewaysLockView()
        scroll.addSubview(lock)
        lock.hold(scroll)
        // Set 16 aside (what the owner saw): straight back to the edge, the vertical place untouched.
        scroll.contentOffset = CGPoint(x: 16, y: 240)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 240))
        scroll.contentOffset = CGPoint(x: -9, y: 300)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 300))
        // Scrolling up and down is left alone, and a rounding's worth is no drift.
        scroll.contentOffset = CGPoint(x: 0, y: 1200)
        #expect(scroll.contentOffset == CGPoint(x: 0, y: 1200))
        #expect(!ReplySwipeMath.drifted(offsetX: 0.3) && ReplySwipeMath.drifted(offsetX: 0.6))
        // The edge is where the leading inset puts it.
        scroll.contentInset = UIEdgeInsets(top: 0, left: 10, bottom: 0, right: 0)
        scroll.contentOffset = CGPoint(x: 6, y: 80)
        #expect(scroll.contentOffset == CGPoint(x: -10, y: 80))
        #expect(!scroll.alwaysBounceHorizontal)
    }
}
