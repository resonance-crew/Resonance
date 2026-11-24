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
        #expect(row.contains("await TapDialog.prepare(made)"))
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

    // MARK: §Q3 — the way out floats, coloured, over the fade

    /// 略過 and 關閉 are the family's tonal small pill floating over the region's bottom fade — no foot under the list.
    @Test func theWayOutFloatsAsTheTonalSmallPill() throws {
        let dialog = try source("TapDialog.swift")
        #expect(dialog.contains("OrganicButton(label, variant: .tonal, size: .sm, action: action)"))
        #expect(dialog.contains(".overlay(alignment: .bottomTrailing)"))
        #expect(dialog.contains(".padding(.bottom, -ModalPaper.insetV)"))
        #expect(TapDialog.exitGap == 16)
        #expect(TapDialog.exitRoom(button: 44) == 60)
        for (file, id) in [("TapPassages.swift", "tap-passage-skip"), ("PickedPeople.swift", "tap-picked-close"),
                           ("TapFaces.swift", "tap-list-close"), ("TapFaces.swift", "author-taps-close")] {
            let text = try source(file)
            #expect(text.contains("id: \"\(id)\""), "\(file): \(id)")
            #expect(!text.contains("ModalCloseButton(") && !text.contains("QuietTextButton("), "\(file)")
        }
    }

    /// A short list: the dialog is as short as its rows and the pill's room — the region's room under the last row is
    /// the pill's height and 16, the paper's bottom inset given back (so the paper's foot is the room itself).
    @Test func aShortListIsItsRowsAndThePillsRoom() async {
        let list = await loaded(["gus", "bob"])
        let body = VStack(spacing: 0) {
            TapListBody(people: list, loadingRows: 2, cap: 420, line: { _ in nil }, press: { _ in })
        }
        .floatingExit("關閉", id: "close", action: {})
        let size = dialogSize(body, width: 400)
        let rows = 2 * TapListMetrics.dialogRow
        // Laid out: the rows, the room (≥ 44 + 16), less the paper's bottom inset the region reaches into.
        #expect(size.height >= rows + 60 - ModalPaper.insetV - 0.5, "\(size.height)")
        #expect(size.height <= rows + 80 - ModalPaper.insetV, "\(size.height)")
    }
}
