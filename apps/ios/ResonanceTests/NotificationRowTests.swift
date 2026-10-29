import DesignSystem
import FirebaseFirestore
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A bell row (round 21): the sender's face, the sentence — their pen name apart — then a note's own
/// words under it and when, and the card on the right. The unread dot ends the first line, beside who
/// it is from — on a note's row too, never after the note's words (the web's BellRow and Android's
/// NotificationRow put it there). VoiceOver hears "Unread", never the dot's glyph.
@MainActor @Suite(.serialized) struct NotificationRowTests {
    private func row(_ handle: String = "Mei", type: String = "note", preview: String? = nil, unread: Bool,
                     face: BellFace = .pending, card: BellCard = .none, when: String = "3 min ago") -> NotificationRowLabel {
        NotificationRowLabel(sentence: BellSentence.of(type: type, handle: handle, count: 0), preview: preview, unread: unread,
                             face: face, card: card, when: when)
    }

    /// What VoiceOver reads of the row as the bell's list draws it: a button around the label.
    private func elements(_ row: NotificationRowLabel) async throws -> [NSObject] {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.rootViewController = UIHostingController(rootView: VStack {
            Button {} label: { row }.buttonStyle(.plain)
            Spacer()
        })
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var found: [NSObject] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window).filter { !($0.accessibilityLabel ?? "").isEmpty }
            return found.contains { ($0.accessibilityLabel ?? "").contains(row.sentence.whole) }
        }
        return found
    }

    @Test func voiceOverHearsUnreadNeverTheDotsGlyph() async throws {
        let note = row(preview: "謝謝你寫這篇。", unread: true)
        let found = try await elements(note)
        let element = try #require(found.first { ($0.accessibilityLabel ?? "").contains(note.sentence.whole) })
        #expect(element.accessibilityValue == L10n.App.Notifications.unread)
        // The note's own words, as written: no 「」 round them any more (C's quote).
        #expect(found.contains { ($0.accessibilityLabel ?? "").contains("謝謝你寫這篇。") })
        #expect(!found.contains { ($0.accessibilityLabel ?? "").contains("「謝謝你寫這篇。」") })
        #expect(!found.contains { "\($0.accessibilityLabel ?? "")\($0.accessibilityValue ?? "")".contains("\u{25CF}") })
    }

    @Test func aReadRowSaysNothingOfIt() async throws {
        let message = row(type: "message", unread: false)
        let found = try await elements(message)
        let element = try #require(found.first { ($0.accessibilityLabel ?? "").contains(message.sentence.whole) })
        #expect((element.accessibilityValue ?? "").isEmpty)
        #expect(!found.contains { ($0.accessibilityLabel ?? "").contains("\u{25CF}") })
    }

    /// `view` drawn at 2x, as RGBA bytes, rows top down.
    private func bitmap(_ view: some View) throws -> (pixels: [UInt8], width: Int, height: Int) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        let image = try #require(renderer.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return (pixels, width, height)
    }

    /// The colour `fill` takes on the page's paper as the same drawing renders it (a token may be see-through).
    private func swatch(_ fill: Color) throws -> [UInt8] {
        let swatch = try bitmap(Rectangle().fill(fill).frame(width: 8, height: 8).background(Tokens.cream))
        let i = ((swatch.height / 2) * swatch.width + swatch.width / 2) * 4
        return Array(swatch.pixels[i ..< i + 3])
    }

    /// Where `ink` is in the row (in points), and the row's size.
    private func find(_ ink: [UInt8], in row: NotificationRowLabel, tolerance: Int = 30) throws -> (ink: CGRect?, size: CGSize) {
        let (pixels, width, height) = try bitmap(row.frame(width: 402).background(Tokens.cream))
        var found: CGRect?
        for y in 0..<height {
            for x in 0..<width {
                let i = (y * width + x) * 4
                let distance = (0..<3).reduce(0) { $0 + abs(Int(pixels[i + $1]) - Int(ink[$1])) }
                guard distance < tolerance else { continue }
                let point = CGRect(x: CGFloat(x) / 2, y: CGFloat(y) / 2, width: 0.5, height: 0.5)
                found = found.map { $0.union(point) } ?? point
            }
        }
        return (found, CGSize(width: CGFloat(width) / 2, height: CGFloat(height) / 2))
    }

    /// Where the row's terracotta ink is (the dot is the only thing drawn in it on a row with a sender).
    private func dot(_ row: NotificationRowLabel) throws -> (ink: CGRect?, size: CGSize) {
        try find(swatch(Tokens.terracotta), in: row)
    }

    @Test func anUnreadNotesDotEndsItsFirstLineNotTheNotesWords() throws {
        let (ink, size) = try dot(row(preview: "謝謝你寫這篇。我讀了三遍，每一遍都想起那一盞燈。", unread: true))
        let mark = try #require(ink)
        // A dot, about the web's 6px.
        #expect(mark.width > 3 && mark.width < 9)
        #expect(mark.height > 3 && mark.height < 9)
        // On the first line, beside who it is from — not under it, after the note's words; past the 40 face.
        #expect(mark.midY < size.height / 2)
        #expect(mark.minX > 60 && mark.maxX < size.width - 40)
    }

    @Test func aReadRowHasNoDot() throws {
        #expect(try dot(row(preview: "謝謝你寫這篇。", unread: false)).ink == nil)
        #expect(try dot(row(type: "message", unread: true)).ink != nil)
    }

    /// The colour at `point` (in points) of the row drawn 402 across on the page's paper.
    private func colour(at point: CGPoint, in row: NotificationRowLabel) throws -> [UInt8] {
        let (pixels, width, _) = try bitmap(row.frame(width: 402).background(Tokens.cream))
        let i = (Int(point.y * 2) * width + Int(point.x * 2)) * 4
        return Array(pixels[i ..< i + 3])
    }

    private func distance(_ a: [UInt8], _ b: [UInt8]) -> Int {
        (0..<3).reduce(0) { $0 + abs(Int(a[$1]) - Int(b[$1])) }
    }

    /// The face stands at the row's start (40, a quiet tile while the sender is read, 10 under the row's
    /// top), and a card the row is about at its end (46): the words between them. A row about no card has
    /// nothing at its end — the words take the room.
    @Test func theFaceLeadsAndTheCardEndsTheRow() throws {
        let tile = try swatch(Tokens.skeletonBase)
        let paper = try swatch(Tokens.cream)
        let both = row(unread: false, face: .pending, card: .pending)
        #expect(distance(try colour(at: CGPoint(x: 20, y: 30), in: both), tile) < 12)
        #expect(distance(try colour(at: CGPoint(x: 402 - 23, y: 33), in: both), tile) < 12)
        // Above the tiles: the row's own air.
        #expect(distance(try colour(at: CGPoint(x: 20, y: 4), in: both), paper) < 12)
        let alone = row(unread: false, face: .pending, card: .none)
        #expect(distance(try colour(at: CGPoint(x: 402 - 23, y: 33), in: alone), paper) < 12)
    }

    /// A row with nobody behind it wears its glyph's tile, terracotta-light under a terracotta glyph.
    @Test func aRowWithNobodyBehindItWearsItsGlyph() throws {
        let summary = NotificationRowLabel(sentence: BellSentence.of(type: "resonance_summary", handle: "", count: 3), preview: nil,
                                           unread: false, face: .glyph(BellSentence.glyph("resonance_summary")))
        #expect(summary.sentence.handle == nil)
        let (glyph, _) = try find(swatch(Tokens.terracotta), in: summary)
        let mark = try #require(glyph)
        #expect(mark.minX >= 0 && mark.maxX <= 40)
    }
}

/// The bell's parts and times keep step (the web's bellTime.test.ts): a row under 這週 never says
/// 「2 小時前」, whatever the clock says.
@MainActor @Suite struct BellTimeTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei")!
        return calendar
    }

    private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    private var now: Date { at(2026, 10, 29, 0, 30) }
    private let zh = Locale(identifier: "zh-Hant-TW")
    private let en = Locale(identifier: "en")

    @Test func partsTheListByTheViewersCalendarDaysNotBy24HourSpans() {
        #expect(BellTime.group(at(2026, 10, 29, 0, 10), now: now, calendar: calendar) == .today)
        // An hour ago, but yesterday: this week, and said as yesterday.
        #expect(BellTime.group(at(2026, 10, 28, 23, 30), now: now, calendar: calendar) == .thisWeek)
        #expect(BellTime.when(at(2026, 10, 28, 23, 30), now: now, locale: zh, justNow: "剛剛", calendar: calendar) == "昨天")
        #expect(BellTime.group(at(2026, 10, 23), now: now, calendar: calendar) == .thisWeek)
        #expect(BellTime.group(at(2026, 10, 22), now: now, calendar: calendar) == .earlier)
    }

    @Test func saysTheMinutesAndHoursTodayTheDaysThisWeekThenTheDate() {
        #expect(BellTime.when(now, now: now, locale: zh, justNow: "剛剛", calendar: calendar) == "剛剛")
        let minutes = BellTime.when(at(2026, 10, 29, 0, 10), now: now, locale: zh, justNow: "剛剛", calendar: calendar)
        #expect(minutes.contains("20") && minutes.contains("分"))
        let hours = BellTime.when(at(2026, 10, 29, 9).addingTimeInterval(-2 * 3600 - 60), now: at(2026, 10, 29, 9), locale: en,
                                  justNow: "Just now", calendar: calendar)
        #expect(hours.contains("2") && hours.contains("hr"))
        #expect(BellTime.when(at(2026, 10, 26), now: now, locale: en, justNow: "Just now", calendar: calendar) == "3 days ago")
        #expect(BellTime.when(at(2026, 10, 20), now: now, locale: zh, justNow: "剛剛", calendar: calendar) == "10/20")
        let lastYear = BellTime.when(at(2025, 12, 20), now: now, locale: en, justNow: "Just now", calendar: calendar)
        #expect(lastYear.contains("2025") && lastYear.contains("12") && lastYear.contains("20"))
        // A clock a little behind the server's: never "in 1 minute".
        #expect(BellTime.when(now.addingTimeInterval(30), now: now, locale: en, justNow: "Just now", calendar: calendar) == "Just now")
        #expect(BellTime.when(now.addingTimeInterval(600), now: now, locale: en, justNow: "Just now", calendar: calendar) == "Just now")
    }

    @Test func thePartsKeepTheListsOrderEachUnderItsHeading() {
        func item(_ id: String, _ date: Date?) -> NotificationsStore.Item {
            var data: [String: Any] = ["type": "message", "payload": ["fromHandle": "mei"]]
            if let date { data["createdAt"] = Timestamp(date: date) }
            return NotificationsStore.item(id: id, data: data)
        }
        let items = [item("a", at(2026, 10, 29, 0, 20)), item("b", at(2026, 10, 28, 9)), item("c", at(2026, 10, 25)),
                     item("d", at(2026, 9, 1)), item("e", nil)]
        let parts = BellTime.parts(items, now: now, calendar: calendar)
        #expect(parts.map(\.group) == [.today, .thisWeek, .earlier])
        #expect(parts.map { $0.items.map(\.id) } == [["a", "e"], ["b", "c"], ["d"]])
    }
}

/// A row's sentence, its pen name apart wherever the language puts it (the web's `bellSentence`).
@MainActor @Suite struct BellSentenceTests {
    @Test func theNameIsSetApartWhereverTheSentencePutsIt() {
        for type in ["invite", "invite_accepted", "message", "resonance", "note", "card_link"] {
            let sentence = BellSentence.of(type: type, handle: "海鹽", count: 0)
            #expect(sentence.handle == "海鹽", "\(type)")
            #expect(!sentence.whole.contains(BellSentence.mark), "\(type)")
            #expect(BellSentence.namesSomeone(type))
        }
        let note = BellSentence.of(type: "note", handle: "海鹽", count: 0)
        #expect(note.whole == L10n.App.Notifications.note(handle: "海鹽"))
        #expect(NotificationsScreen.text(for: NotificationsStore.item(id: "n", data: ["type": "note", "payload": ["fromHandle": "海鹽"]]))
            == L10n.App.Notifications.note(handle: "海鹽"))
    }

    @Test func aRowWithNobodyBehindItIsAllWords() {
        let summary = BellSentence.of(type: "resonance_summary", handle: "", count: 3)
        #expect(summary.handle == nil && summary.after.isEmpty)
        #expect(summary.before == L10n.App.Notifications.resonanceSummary(count: 3))
        #expect(BellSentence.of(type: "translation_done", handle: "", count: 0).before == L10n.App.Notifications.translationDone)
        #expect(!BellSentence.namesSomeone("invite_expired"))
        #expect(BellSentence.glyph("resonance_summary") == .sparkle)
        #expect(BellSentence.glyph("translation_done") == .globe)
        #expect(BellSentence.glyph("invite_expired") == .users)
        #expect(BellSentence.glyph("whatever") == .bell)
    }

    @Test func aGoneSendersFaceIsTheInitialsOfThePenNameTheRowKept() {
        #expect(BellFace.initials("haiyan") == "HA")
        #expect(BellFace.initials("海鹽") == "海鹽")
        #expect(BellFace.initials("") == "?")
        let seed = BellFace.seed(uid: "uid-1", handle: "x")
        #expect(seed >= 1 && seed <= 50)
        #expect(BellFace.seed(uid: nil, handle: "x") == BellFace.seed(uid: "", handle: "x"))
    }
}

/// The bell's extras: each sender and card asked for once, people Messages already knows taken from
/// there; a sender whose profile is gone settles on the pen name's initials.
@MainActor @Suite struct BellExtrasTests {
    @Test func readsEachSenderAndCardOnceAndSettlesTheGone() async {
        let asked = Asked()
        let cards = CardSummaries { keys in
            await asked.cards(keys)
            return []
        }
        let extras = BellExtras(cards: cards) { id in
            await asked.person(id)
            return id == "gone" ? .gone : .failed
        }
        func item(_ id: String, from: String, card: String?) -> NotificationsStore.Item {
            var payload: [String: Any] = ["fromHandle": from, "fromUserId": from]
            if let card { payload["cardId"] = card }
            return NotificationsStore.item(id: id, data: ["type": "note", "payload": payload])
        }
        let items = [item("1", from: "gone", card: "c1"), item("2", from: "known", card: "c1"), item("3", from: "gone", card: nil)]
        #expect(extras.person("gone") == .pending)
        await extras.load(items) { $0 == "known" ? Person(id: "known", data: ["handle": "known"]) : nil }
        #expect(extras.person("gone") == .settled)
        if case .found = extras.person("known") {} else { Issue.record("a person Messages knows is taken from there") }
        #expect(await asked.people == ["gone"])
        #expect(await asked.cardKeys == [["c1"]])
        // Shown again: nothing new to ask for (the gone stay gone; the card's answer is kept).
        await extras.load(items) { _ in nil }
        #expect(await asked.people == ["gone"])
        #expect(await asked.cardKeys == [["c1"]])
        // A card the answer left out is one the viewer can't read any more.
        #expect(extras.cards.lookup("c1") == .hidden)
    }

    actor Asked {
        var people: [String] = []
        var cardKeys: [[String]] = []
        func person(_ id: String) { people.append(id) }
        func cards(_ keys: [String]) { cardKeys.append(keys) }
    }
}
