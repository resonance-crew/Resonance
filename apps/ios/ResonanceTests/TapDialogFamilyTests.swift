import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 33, the tap lists' family — who resonated (a reader's, the author's), who picked a sentence, the passages'
/// dialog. The owner (2026-11-24): 「谁共振了弹窗仍有高度闪动 … 请一并排查这个弹窗（以及同家族其他弹窗）的根因」,
/// 「高亮区块应延伸到左右边缘…左右 padding 稍微再收窄（28→24）」, 「按钮固定浮在滚动区底部渐变之上…用有颜色的浮动按钮」.
@MainActor @Suite struct TapDialogFamilyTests {
    private func person(_ id: String, note: String? = nil) -> TapPerson {
        TapPerson(author: Fixture.author(id), note: note.map { .init(value1: .init(excerpt: $0)) })
    }

    private static let card = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("../Resonance/Features/Card").standardized
    private func source(_ file: String) throws -> String {
        try String(contentsOf: Self.card.appendingPathComponent(file), encoding: .utf8)
    }

    private func loaded(_ ids: [String]) async -> TapPeople {
        let page = TapList(people: ids.map { person($0) }, nextPageToken: nil)
        let people = TapPeople { _ in page }
        await people.load()
        return people
    }

    // MARK: §Q1 — every list opens at its final height

    /// The cause on iOS (the reader's and the author's lists, as round 32 found in who-picked): the dialog opened before
    /// its list was asked for, drawing two loading rows whatever the count — one person's list opened a row too tall and
    /// shrank, three grew. Now the press asks, waits at most 300 ms (the family's one constant) and hands the list over.
    @Test func aPressWaitsForTheFirstPageAtMostThreeHundredMilliseconds() async {
        #expect(TapDialog.firstPageWait == .milliseconds(300))
        #expect(PickedPeople.firstPageWait == TapDialog.firstPageWait)
        // Within the wait: read when the dialog opens.
        let page = TapList(people: [person("gus")], nextPageToken: nil)
        let quick = TapPeople { _ in page }
        await TapDialog.prepare(quick)
        #expect(quick.phase == .loaded && quick.people.count == 1)
        // Slower: the dialog opens at the wait, the read still on its way (and it carries on).
        let slow = TapPeople { _ in
            try await Task.sleep(for: .milliseconds(900))
            return TapList(people: [], nextPageToken: nil)
        }
        let start = ContinuousClock.now
        await TapDialog.prepare(slow)
        let waited = ContinuousClock.now - start
        #expect(slow.phase == .loading)
        #expect(waited >= .milliseconds(280) && waited < .milliseconds(700), "\(waited)")
    }

    /// Opened with the list read, the dialog's first layout is its settled one — the same height as the rows alone, with
    /// no loading row before them — for one, two and three people. Read slower, its loading rows are the faces' count
    /// and lay out as tall as plain rows.
    @Test func theFirstFrameIsTheSettledHeightForOneTwoAndThree() async {
        for n in 1...3 {
            let ids = Array(["gus", "bob", "hana"].prefix(n))
            let list = await loaded(ids)
            let body = TapListBody(people: list, loadingRows: TapDialog.loadingRows(knownFaces: n), cap: 420,
                                   line: { _ in nil }, press: { _ in })
            let first = dialogSize(body, width: 400)
            let rows = dialogSize(TapRows(people: list.people, line: { _ in nil }, press: { _ in }), width: 400)
            #expect(first.height == rows.height, "\(n): \(first.height) vs \(rows.height)")
            #expect(abs(rows.height - CGFloat(n) * TapListMetrics.dialogRow) < 0.5)
            let loading = dialogSize(TapListState(people: nil, loadingRows: TapDialog.loadingRows(knownFaces: n)), width: 400)
            #expect(loading.height == rows.height, "\(n) loading: \(loading.height)")
        }
        // The count: the faces known (three at most), never none, never a default.
        #expect((0...5).map { TapDialog.loadingRows(knownFaces: $0) } == [1, 1, 2, 3, 3, 3])
    }

    /// Each opener asks at the press and hands the dialog the list and the faces' count.
    @Test func everyOpenerAsksAtThePressAndPassesTheFacesCount() throws {
        let row = try source("CardEndRow.swift")
        // Round 34 §8: the reader's list is read ahead; a press waits at most the 300 ms for a read still on its way.
        #expect(row.contains("_ = await firstAnswer(within: TapDialog.firstPageWait) { await ahead.reading.value }"))
        #expect(row.contains("preloaded: listPeople, knownFaces: tap.shownFaces.count"))
        #expect(row.contains("{ openList() }"))
        #expect(!row.contains("{ listOpen = true }"))
        let faces = try source("TapFaces.swift")
        #expect(faces.contains("AuthorTapList(cardId: cardId, preloaded: people, knownFaces: shown.count)"))
        #expect(faces.contains("Button(action: openList)"))
        // No list draws a default count any more.
        #expect(!faces.contains("var loadingRows = 2"))
        #expect(faces.components(separatedBy: "private var list: TapPeople? { people ?? preloaded }").count == 3)
    }

    // MARK: §Q2 — rows' ink edge to edge, a narrower inset

    @Test func theFamilyStandsTwentyFourInAndItsRowsReachThePapersEdges() throws {
        #expect(ModalPaper.listInset == 24 && ModalPaper.inset == 28)
        // The family's paper: 24 at the top and the sides, none at the bottom (the floating pill's room is its foot).
        #expect(ModalPaper.top(inset: ModalPaper.listInset) == 24 && ModalPaper.top(inset: ModalPaper.inset) == ModalPaper.insetV)
        // A row stands the inset and the wobble's swing out on each side, clipped by the paper, its band uncut.
        #expect(TapDialog.reach(clipped: true) == ModalPaper.listInset + ModalPaper.bleed)
        #expect(TapDialog.overhang(reach: TapDialog.reach(clipped: true)) == ModalPaper.bleed)
        #expect(TapDialog.reach(clipped: false) == 12)
        // All four open clipped to their paper at 24.
        let opens = try [source("CardEndRow.swift"), source("TapFaces.swift"), source("CardScreen.swift")].joined()
        #expect(opens.components(separatedBy: "clipsToPaper: true, paperInset: ModalPaper.listInset").count - 1 == 4)
        let faces = try source("TapFaces.swift")
        // The rows: no inset card — the band uncut where the paper clips, the words at the dialog's inset.
        #expect(faces.contains(".buttonStyle(BandWashStyle(top: top, bottom: bottom, cut: !clips))"))
        #expect(faces.contains(".padding(.horizontal, reach)"))
        #expect(!faces.contains(".padding(.horizontal, -12)"))
    }

    /// The paper's inset reaches the dialog's children, and only these dialogs change it.
    @Test func thePapersInsetIsTheModalsOwn() throws {
        let modal = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Packages/DesignSystem/Sources/DesignSystem/Components/OrganicModal.swift").standardized, encoding: .utf8)
        #expect(modal.contains("paperInset: CGFloat = ModalPaper.inset,"))
        #expect(modal.contains(".environment(\\.modalPaperInset, inset)"))
        #expect(modal.contains(".padding(.horizontal, inset)"))
    }

    // MARK: §Q3, final (round 34) — the footer while it fits, floating once it scrolls, one place for the pill

    /// 略過 and 關閉 are the family's tonal small pill, handed to the region; no dialog draws a foot of its own.
    @Test func theWayOutIsTheTonalSmallPillTheRegionDraws() throws {
        let dialog = try source("TapDialog.swift")
        #expect(dialog.contains("OrganicButton(exit.label, variant: .tonal, size: .sm, action: exit.action)"))
        #expect(dialog.contains("ViewThatFits(in: .vertical)"))
        #expect(dialog.contains("TapDialogFoot(budget:"))
        // Decided in the layout, never by a measure taken after it.
        #expect(!dialog.contains("onGeometryChange"))
        #expect(TapDialog.exitInset == 24 && TapDialog.exitAbove == 18 && TapDialog.exitButton == 44)
        #expect(TapDialog.exitDrop == 24 - ModalPaper.insetV)
        #expect(TapDialog.footer() == 54)
        #expect(TapDialog.exitRoom() == CGFloat(24 + 44 + 18))
        #expect(TapDialog.below(clipped: true) == ModalPaper.bleed && TapDialog.below(clipped: false) == 0)
        for (file, id) in [("TapPassages.swift", "tap-passage-skip"), ("PickedPeople.swift", "tap-picked-close"),
                           ("TapFaces.swift", "tap-list-close"), ("TapFaces.swift", "author-taps-close")] {
            let text = try source(file)
            #expect(text.contains("id: \"\(id)\""), "\(file): \(id)")
            #expect(text.contains(".dialogExit("), "\(file)")
            #expect(!text.contains("ModalCloseButton(") && !text.contains("QuietTextButton("), "\(file)")
        }
    }

    private static let width: CGFloat = 400
    private static let cap: CGFloat = 300

    /// The family's paper as ``OrganicModalCard`` lays it out (24 at the top and the sides, ``ModalPaper/insetV`` under,
    /// clipped), at the window's top left: its frame is (0, 0, 400, its height).
    private func paper(_ ids: [String]) async -> some View {
        let list = await loaded(ids)
        return VStack(alignment: .leading, spacing: 0) {
            TapListBody(people: list, loadingRows: 1, cap: Self.cap, line: { _ in nil }, press: { _ in })
        }
        .dialogExit("OUT", id: "close", action: {})
        .environment(\.modalPaperClips, true)
        .environment(\.modalPaperInset, ModalPaper.listInset)
        .padding(.horizontal, ModalPaper.listInset)
        .padding(.top, ModalPaper.top(inset: ModalPaper.listInset))
        .padding(.bottom, ModalPaper.insetV)
        .frame(width: Self.width)
    }

    /// The paper shown in a window: its height measured once, fresh (the first layout), and the pill's frame and the
    /// scroll views once VoiceOver's tree (the pill's frame there is its wobbly outline's, a point or so past the button's
    /// 44 above and below, so its centre is what the tests hold: 22 above its bottom) is up and the run loop has turned (any later layout has happened by then).
    private func shown(_ ids: [String]) async throws -> (first: CGFloat, settled: CGFloat, pill: CGRect, scrolls: [UIScrollView]) {
        let view = await paper(ids)
        let first = dialogSize(view, width: Self.width).height
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 1200)
        let host = UIHostingController(rootView: VStack(alignment: .leading, spacing: 0) { view; Spacer(minLength: 0) }
            .frame(maxWidth: .infinity, alignment: .leading).ignoresSafeArea())
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        var pill: CGRect?
        _ = await eventually {
            pill = AccessibilityOn.elements(in: window).first { $0.accessibilityLabel == "OUT" }?.accessibilityFrame
            return pill != nil
        }
        try? await Task.sleep(for: .milliseconds(200))
        let settled = dialogSize(view, width: Self.width).height
        var scrolls: [UIScrollView] = []
        func walk(_ v: UIView) {
            if let s = v as? UIScrollView, s !== host.view { scrolls.append(s) }
            v.subviews.forEach(walk)
        }
        walk(host.view)
        return (first, settled, try #require(pill), scrolls)
    }

    /// Two people and the foot fit the cap (2 × 60 + 86 ≤ 300): the classic footer — the rows, 18, the pill, the paper's 24 — with no scroll region and
    /// no fade; the pill's right edge 24 in from the paper's, its bottom 24 above the paper's.
    @Test func rowsThatFitEndInTheFooter() async throws {
        let got = try await shown(["gus", "bob"])
        let rows = 2 * TapListMetrics.dialogRow
        let paper = 24 + rows + TapDialog.footer() + ModalPaper.insetV
        #expect(abs(got.first - paper) < 0.5, "\(got.first) vs \(paper)")
        #expect(got.first == got.settled)
        #expect(got.scrolls.isEmpty, "no scroll region: \(got.scrolls)")
        #expect(abs(Self.width - got.pill.maxX - 24) < 0.5, "\(got.pill)")
        #expect(abs(got.first - got.pill.midY - 24 - 22) < 0.5, "\(got.pill) in \(got.first)")
        #expect(abs(got.pill.midY - (24 + rows + 18 + 22)) < 0.5, "the pill under the rows: \(got.pill)")
    }

    /// Twelve people pass the cap: one scroll region, the cap tall, down to the paper's bottom edge and the wobble's 16 past it (the
    /// fade's clear end there), ending in 24 + 44 + 18 and that 16; the pill floats at the very same place.
    @Test func rowsThatScrollFloatThePillAtTheSamePlace() async throws {
        let ids = (0..<12).map { "p\($0)" }
        let got = try await shown(ids)
        let paper = 24 + Self.cap
        #expect(abs(got.first - paper) < 0.5, "\(got.first) vs \(paper)")
        #expect(got.first == got.settled)
        let scroll = try #require(got.scrolls.first)
        let rows = CGFloat(ids.count) * TapListMetrics.dialogRow
        // Round 34 §5: the region reaches the top border too, the paper's 24 (and the 16 past it) its content's own top.
        let top = ModalPaper.top(inset: ModalPaper.listInset) + ModalPaper.bleed
        #expect(abs(scroll.contentSize.height - (top + rows + TapDialog.exitRoom() + ModalPaper.bleed)) < 1, "\(scroll.contentSize)")
        #expect(abs(scroll.bounds.height - (top + Self.cap + ModalPaper.bleed)) < 1, "\(scroll.bounds)")
        #expect(abs(Self.width - got.pill.maxX - 24) < 0.5, "\(got.pill)")
        #expect(abs(got.first - got.pill.midY - 24 - 22) < 0.5, "\(got.pill) in \(got.first)")
        #expect(TapDialog.bottomFade(below: ModalPaper.bleed) == ScrollEdgeFades.length + ModalPaper.bleed)
    }

    /// The switch is the web's: the footer while content + 18 + 44 + 24 ≤ the cap, floating past it — one row short
    /// of the line keeps the footer, one row past floats, and neither is ever taller than the cap.
    @Test func theSwitchIsTheContentAndItsFootAgainstTheCap() async throws {
        // 300 − 86 = 214: three rows (180) fit, four (240) don't.
        let three = try await shown(["a", "b", "c"])
        #expect(three.scrolls.isEmpty)
        #expect(three.first - 24 <= Self.cap)
        let four = try await shown(["a", "b", "c", "d"])
        #expect(!four.scrolls.isEmpty)
        #expect(abs(four.first - 24 - Self.cap) < 0.5)
        #expect(abs(three.first - three.pill.midY - (four.first - four.pill.midY)) < 0.5)
    }

    // MARK: Round 34 — the family's type on a tablet and the Mac

    /// 「iPad 上…名单弹窗里面的字体太小」: two points more past compact (Android's step), a phone's sizes unchanged, the
    /// pills and the rows' measures kept; each size still follows the person's text size.
    @Test func theFamilysTypeStepsUpTwoPastCompact() throws {
        let phone = TapListMetrics.wide(.phone), iPad = TapListMetrics.wide(WindowLayout(width: 820, height: 1180))
        #expect(!phone && iPad)
        #expect(!TapListMetrics.wide(WindowLayout(width: 599, height: 900)) && TapListMetrics.wide(WindowLayout(width: 600, height: 900)))
        #expect([false, true].map { TapListMetrics.titleSize(wide: $0) } == [20, 22])
        #expect([false, true].map { TapListMetrics.nameSize(wide: $0) } == [15, 17])
        #expect([false, true].map { TapListMetrics.lineSize(wide: $0) } == [13, 15])
        #expect([false, true].map { TapListMetrics.sentenceSize(wide: $0) } == [16, 18])
        #expect(TapPassageRules.textSize(wide: true) == 18 && TapPassageRules.textSize == 16)
        #expect(TapListMetrics.dialogRow == 60 && TapListMetrics.dialogFace == 36)
        // The sentence's face grows with it (and with the person's text size, along the reading curve).
        let small = PickedPeople.sentenceFont(script: .cjk), large = PickedPeople.sentenceFont(script: .cjk, wide: true)
        #expect(abs(large.pointSize / small.pointSize - 18.0 / 16.0) < 0.01, "\(small.pointSize) → \(large.pointSize)")
        // Every element of the family reads it: no fixed phone size left in the rows or the titles.
        let faces = try source("TapFaces.swift")
        #expect(!faces.contains("AppFonts.body(15, weight: .semibold)") && !faces.contains(".font(AppFonts.body(13))"))
        #expect(faces.contains("ModalTitle(L10n.Card.ResonatorsModal.title,") && faces.contains("size: TapListMetrics.titleSize(wide: TapListMetrics.wide(window))"))
        #expect(try source("PickedPeople.swift").contains("ModalTitle(L10n.Card.Tap.pickedTitle, size: TapListMetrics.titleSize(wide: wide))"))
        #expect(try source("TapPassages.swift").contains("ModalTitle(L10n.Card.Tap.passageTitle, size: TapListMetrics.titleSize("))
    }

    // MARK: Round 34 §5 — the region reaches the paper's top border

    /// The titles head the region (no fixed band above its fade), and the region's top is the paper's: its scroll
    /// stands 24 + 16 above the content and pads as much back in.
    @Test func theHeadsScrollInTheRegionThatReachesTheTop() throws {
        let faces = try source("TapFaces.swift"), picked = try source("PickedPeople.swift")
        #expect(faces.contains("head: AnyView(ModalTitle(L10n.Card.ResonatorsModal.title"))
        #expect(picked.contains("head: AnyView(head(wide: wide))"))
        let dialog = try source("TapDialog.swift")
        #expect(dialog.contains("content.padding(.top, top + up)"))
        #expect(dialog.contains(".padding(.top, -(top + up))"))
        #expect(dialog.contains(".scrollEdgeFades(ScrollEdgeFades.length + up, bottom:"))
    }

    // MARK: Round 34 §8 — the reader's list opens complete

    /// The cause: the first page took longer than the press's 300 ms, so the dialog opened on its loading rows (a disc
    /// and a bar each, 60 tall) and the rows came with their quotes later, taller. Now it is read ahead, once the faces'
    /// line can open it and the tap's own request has answered, and again only when the tap as shown changes.
    @Test func theReadersListIsReadAheadOfThePress() throws {
        let row = try source("CardEndRow.swift")
        #expect(row.contains(".task(id: listOpens && !tap.working ? listKey : \"\")"))
        #expect(row.contains("if let ahead = listAhead, ahead.key == key, ahead.people.phase != .failed { return }"))
        // A read already in hand opens at once.
        #expect(row.contains("if ahead.people.phase != .loaded {"))
        let key = { (on: Bool, passage: String?, faces: [String], more: Bool) in
            TapDialog.listKey(card: "c", on: on, passage: passage, faces: faces, more: more)
        }
        #expect(key(true, "p1", ["me", "gus"], false) == key(true, "p1", ["me", "gus"], false))
        #expect(key(true, "p1", ["me", "gus"], false) != key(false, "p1", ["gus"], false))
        #expect(key(true, "p1", ["me"], false) != key(true, "p2", ["me"], false))
        #expect(key(true, nil, ["me", "gus"], false) != key(true, nil, ["me", "gus"], true))
    }

    /// The first drawn rows carry their quotes: a list read when the dialog opens lays out its quote lines in its first
    /// measure (a quote of two lines takes a row past the 60 of a name alone, which is what grew when the rows came in).
    @Test func theFirstDrawnRowsCarryTheirQuotes() async throws {
        let people = ["gus", "bob"].map { TapPerson(author: Fixture.author($0), note: nil, passage: .init(value1: .init(text: "\($0)：" + String(repeating: "那一段讓我想起搬家的那個晚上，", count: 4)))) }
        let list = TapPeople { _ in TapList(people: people, nextPageToken: nil) }
        await list.load()
        let line = { (p: TapPerson) in TapRowLine.of(p, authorList: false, viewer: "dora", offersPassages: true) }
        #expect(line(people[0]) == people[0].passage.map { .quote($0.value1.text) })
        let body = TapListBody(people: list, loadingRows: 2, cap: 600, line: line, press: { _ in })
        let first = dialogSize(body, width: 400)
        #expect(first.height > 2 * TapListMetrics.dialogRow + 10, "\(first.height)")
        let bare = dialogSize(TapListBody(people: list, loadingRows: 2, cap: 600, line: { _ in nil }, press: { _ in }), width: 400)
        #expect(first.height > bare.height, "\(first.height) vs \(bare.height)")
    }

    // MARK: Round 34 §9 — the reader's face rises out of 共振

    /// On turning 共振 on, the reader's face comes up out of the segment (cut by its top edge — the faces' line's foot)
    /// and goes back down into it on turning it off, in the house's short ease; nothing under Reduce Motion.
    @Test func theReadersFaceRisesOutOfTheSegment() throws {
        #expect(TapFaces.rise() == 36)
        #expect(TapFaces.rise() >= TapFaces.rowHeight - (TapFaces.rowHeight - FaceStack.size) / 2)
        let faces = try source("TapFaces.swift"), row = try source("CardEndRow.swift")
        #expect(faces.contains("FaceStack(faces: faces.map(Self.face), transition: Self.riseTransition)"))
        #expect(faces.contains(".asymmetric(insertion: .offset(y: rise()), removal: .offset(y: rise()))"))
        // Cut at the line's foot only (the faces' drawing, round 34 §12).
        #expect(TapFaces.riseMask.bottom == -8 && TapFaces.riseMask.top == -TapFaces.rowHeight)
        #expect(row.contains("withAnimation(reduceMotion ? nil : TapFaces.slide) { tap.flip(viewer: viewer) }"))
        // The line keeps its 44 whatever comes and goes.
        let empty = dialogSize(EndRowTwo(facesCentre: 100, faceCount: 0) { EmptyView() }, width: 400)
        #expect(empty.height == TapFaces.rowHeight)
    }

    // MARK: Round 34 §10 — no note's excerpt in the rows

    /// A row is its face, its pen name and (in the who-resonated lists) the quote: a note the answer still carries is
    /// not drawn — a row with a note and no quote is the 60 of a name alone — and it still leads to that conversation.
    @Test func aRowDrawsNoNote() async throws {
        let withNote = TapPerson(author: Fixture.author("carol"), note: .init(value1: .init(excerpt: String(repeating: "謝謝你寫下這段，", count: 8))))
        let list = TapPeople { _ in TapList(people: [withNote], nextPageToken: nil) }
        await list.load()
        let size = dialogSize(TapRows(people: list.people, line: { _ in nil }, press: { _ in }), width: 400)
        #expect(abs(size.height - TapListMetrics.dialogRow) < 0.5, "\(size.height)")
        #expect(TapPersonRow.route(for: withNote) == .thread(handle: "carol", uid: "carol", note: nil))
        #expect(!(try source("TapFaces.swift")).contains("person.note?.value1.excerpt"))
    }

    // MARK: Round 34 §11 — no ink on the people's rows or the faces

    /// The faces' buttons — a reader's over 共振 and the author's line — show nothing of a press or a pointer (the
    /// owner's correction: only they); the people's rows
    /// keep round 33's band, uncut to the paper's edges, and the passages' rows theirs.
    @Test func theFacesDrawNoWashTheRowsKeepTheirBand() throws {
        let faces = try source("TapFaces.swift")
        #expect(faces.contains(".buttonStyle(BandWashStyle(top: top, bottom: bottom, cut: !clips))"))
        #expect(faces.components(separatedBy: ".buttonStyle(QuietPressStyle())\n").count - 1 == 2)
        #expect(faces.components(separatedBy: ".hoverEffectDisabled()").count - 1 == 2)
        #expect(!faces.contains("OrganicPressStyle("))
        #expect(try source("TapPassages.swift").contains(".buttonStyle(BandWashStyle("))
        #expect(try source("PickedPeople.swift").contains("TapListBody("))
    }

    // MARK: Round 34 §12 — the whole group of faces takes the press

    /// 「头像群组只有某一小块可以点击」: the faces' button is the whole group — every face, the overlaps and its pads,
    /// a finger's 44 at the least — with no mask or clip around it (the rise's cut is on the drawing alone), and the
    /// line stands over the capsule's row in the hit order.
    @Test func theWholeGroupOfFacesTakesThePress() async throws {
        let faces = ["gus", "bob", "hana"].map { Fixture.author($0) }
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 400)
        let row = EndRowTwo(facesCentre: 120, faceCount: 3) {
            TapFaces(faces: faces, spoken: "FACES", isButton: true) {}
        }
        window.rootViewController = UIHostingController(rootView: VStack(spacing: 0) { row.frame(width: 360); Spacer() }
            .frame(maxWidth: .infinity, alignment: .leading).ignoresSafeArea())
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var button: CGRect?
        _ = await eventually {
            button = AccessibilityOn.elements(in: window).first { $0.accessibilityLabel == "FACES" }?.accessibilityFrame
            return button != nil
        }
        let frame = try #require(button)
        let lead = RowTwo.facesLead(centre: 120, count: 3)
        let group = CGRect(x: lead + TapFaces.buttonPad, y: (TapFaces.rowHeight - FaceStack.size) / 2,
                           width: FaceStack.width(count: 3, size: FaceStack.size), height: FaceStack.size)
        // Every face inside the button, and the button a finger's at the least.
        #expect(frame.insetBy(dx: -0.5, dy: -0.5).contains(group), "\(frame) vs \(group)")
        #expect(frame.width >= TapFaces.rowHeight && frame.height >= TapFaces.rowHeight, "\(frame)")
        #expect(abs(frame.width - (group.width + 2 * TapFaces.buttonPad)) < 0.5, "\(frame)")
        // Nothing masks or clips the button: the cut is on the faces' drawing, inside the label, before the hit shape.
        let tapFaces = try source("TapFaces.swift"), endRow = try source("CardEndRow.swift")
        let cut = try #require(tapFaces.range(of: ".mask { Rectangle().padding(Self.riseMask) }"))
        let shape = try #require(tapFaces.range(of: ".contentShape(Rectangle())"))
        #expect(cut.lowerBound < shape.lowerBound)
        let lineBody = try #require(endRow.range(of: "struct EndRowTwo<Faces: View>: View {")).upperBound
        #expect(!String(endRow[lineBody...].prefix(1200)).contains(".mask"))
        #expect(endRow.contains("if facesLine { faces.zIndex(1) }"))
    }
}
