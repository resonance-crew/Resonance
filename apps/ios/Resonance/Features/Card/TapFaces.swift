import DesignSystem
import ResonanceKit
import SwiftUI

/// The faces of who resonated (round 26 §U2; the owner: 「避免直接使用文字說…不要寫這樣的文字，直接放那個頭像就好。然後點擊可能就
/// 會出現那個名單」): ``FaceStack`` at 28 (the Mac's 77 % makes it 21.6) — at most three faces and nothing after them
/// (round 29 §S5: no blank disc; who else there is, the list says) — the whole group one button with a 44 hit area
/// opening the list — except when the only face is the reader's own, which is no button, read as 「你共振了」. What a
/// screen reader hears names them (with 等人 when there are more); nothing on screen does.
struct TapFaces: View {
    let faces: [Author]
    let spoken: String
    let isButton: Bool
    let onOpen: () -> Void

    /// Row 2 under the capsule: always this tall, faces or none, so a face coming in never moves the page.
    static let rowHeight: CGFloat = 44
    /// The reader's own face sliding in or out (none under Reduce Motion): the house's short ease.
    static let slide = Animation.easeOut(duration: 0.15)
    /// Round 34 §9 (the owner: the face rises out of the 共振 segment instead of flipping in): a face comes up from under
    /// the faces' line — the capsule's top edge, which cuts it (``EndRowTwo``) — and goes back down into it. The
    /// distance: from the face's top in the 44 line (centred) to the line's foot, so it starts wholly inside the segment.
    static func rise(size: CGFloat = FaceStack.size) -> CGFloat { rowHeight - (rowHeight - size) / 2 }
    /// The rise's cut, from the faces' own box: far out above and at the sides, down to the line's foot below (the
    /// faces stand centred in the 44 line).
    static let riseMask = EdgeInsets(top: -rowHeight, leading: -rowHeight, bottom: -(rowHeight - FaceStack.size) / 2,
                                     trailing: -rowHeight)
    static var riseTransition: AnyTransition {
        .asymmetric(insertion: .offset(y: rise()), removal: .offset(y: rise()))
    }
    /// The button's pad at each side of the faces, the web's 6 (TapFaces.module.css `.faces`): after row 2's line
    /// (``RowTwo/facesLine``), the first face's rim stands ``RowTwo/faceInset`` in.
    static let buttonPad: CGFloat = RowTwo.faceInset - RowTwo.facesLine

    var body: some View {
        let stack = FaceStack(faces: faces.map(Self.face), transition: Self.riseTransition)
            // Cut at the line's foot — the capsule's top edge (round 34 §9): a face rising in comes up out of the 共振
            // segment. Only the drawing is cut (round 34 §12): no mask or clip wraps the button's hit area.
            .mask { Rectangle().padding(Self.riseMask) }
            .padding(.horizontal, Self.buttonPad)
            // A finger's 44 at the least, the faces at its start (the web's `min-width: 44px`).
            .frame(minWidth: Self.rowHeight, minHeight: Self.rowHeight, alignment: .leading)
            // The whole group takes the press — every face, the overlaps, the pads (round 34 §12).
            .contentShape(Rectangle())
        if isButton {
            // Round 34 §11: no press or hover wash on the faces (the Mac's pointer and an iPad's trackpad included).
            Button(action: onOpen) { stack }
                .buttonStyle(QuietPressStyle())
                .hoverEffectDisabled()
                .accessibilityLabel(spoken)
                // The name the interaction flows find it by (maestro/flows/tap.yaml).
                .accessibilityIdentifier("tap-faces")
        } else {
            stack
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
                .accessibilityIdentifier("tap-faces")
        }
    }

    static func face(_ author: Author) -> FaceStack.Face {
        FaceStack.Face(id: author.id, initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                       color: author.accent, seed: author.avatarSeedValue)
    }
}

// MARK: - Who resonated, read

/// The people a card's list shows, read from `GET /cards/{id}/taps`: the author's pages of 30 (``more()`` the next), a
/// reader's one page. A read that fails says so, with a way to ask again.
@MainActor @Observable
final class TapPeople {
    enum Phase: Equatable { case loading, loaded, failed }

    private(set) var phase: Phase = .loading
    private(set) var people: [TapPerson] = []
    private(set) var next: String?
    private(set) var loadingMore = false
    @ObservationIgnored private let fetch: @Sendable (String?) async throws -> TapList

    init(fetch: @escaping @Sendable (String?) async throws -> TapList) {
        self.fetch = fetch
    }

    func load() async {
        phase = .loading
        do {
            let page = try await fetch(nil)
            people = page.people
            next = page.nextPageToken
            phase = .loaded
        } catch {
            phase = .failed
        }
    }

    /// The next page (the author's 顯示更多), added under the rows shown; one already shown is never twice.
    func more() async {
        guard let token = next, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        guard let page = try? await fetch(token) else { return }
        let shown = Set(people.map(\.author.id))
        people += page.people.filter { !shown.contains($0.author.id) }
        next = page.nextPageToken
    }
}

/// The lists' measures (§U2.5, §U3.2). Both lists — a reader's, the author's — are a centred dialog on every device
/// (the owner, 2026-11-19, of the reader's popover under the faces on a tablet and the Mac: 「我在想这个直接做成这个 model
/// 会不会好一点呢」), rows 60 with faces 36. The author's is 480 wide at most everywhere; a reader's keeps a phone's 400
/// (「手机上已经是这个 model 的设计了，所以可能只有平板和电脑网页和 Mac APP 需要更改哦」) and is 480 on a tablet and the Mac,
/// as the web's `TAP_LIST_DIALOG_WIDTH` and Android's `readerListWidth`.
nonisolated enum TapListMetrics {
    static let dialogWidth: CGFloat = 480
    static func readerWidth(compact: Bool) -> CGFloat { compact ? 400 : dialogWidth }
    static let dialogRow: CGFloat = 60
    static let dialogFace: CGFloat = 36
    /// A row's quote: two lines at most, on every platform (round 27 §U2, S9).
    static let lineLimit = 2
    /// Above and below a row's content: within 60 for a name and one line.
    static let rowPad: CGFloat = 8

    /// The family's type (round 34, the owner on the iPad: 「里面的字体太小…像是直接沿用手机版小字号」): a phone's sizes,
    /// and two points more on a tablet and the Mac (any window wider than compact, as Android's tablets) — the title
    /// 20 → 22, a pen name 15 → 17, a quote, 選一段 and a note's excerpt 13 → 15, the picked sentence and the passages
    /// 16 → 18. The pills (關閉, 略過, 顯示更多) keep the small pill's 14; the rows' 60 and faces' 36 stay. Each still
    /// grows with the person's text size (the sentence and the passages along the reading curve, with the Mac's boost).
    static func wide(_ window: WindowLayout) -> Bool { window.layoutClass != .compact }
    static func titleSize(wide: Bool) -> CGFloat { wide ? 22 : 20 }
    static func nameSize(wide: Bool) -> CGFloat { wide ? 17 : 15 }
    static func lineSize(wide: Bool) -> CGFloat { wide ? 15 : 13 }
    static func sentenceSize(wide: Bool) -> CGFloat { wide ? 18 : 16 }
}

/// One person of a list: their face and pen name, banded (the curves show as a press's wash), leading to their page —
/// or, on the author's list when they left a note on the card, to that conversation (an unconnected reader's is the
/// letter; replying connects, as today). Under the name (round 27 §U2, §U3): the passage they picked, quoted (``TapRowLine``),
/// muted, two lines at most, or 選一段 on a reader's own row — and nothing more: round 34 §10 (the owner: the note
/// arrives as a message, read it there) took the note's excerpt away, though the answer still carries it and a row
/// with a note still opens that conversation. A row with no quote is 60 tall.
///
/// Round 33 §Q2 (the owner: 「高亮区块应延伸到左右边缘…不要有弹窗里又包了一张缩进去的小卡片的感觉」): in a dialog clipped to
/// its paper the row stands ``TapDialog/reach(clipped:inset:)`` out on each side and pads as much back in, so its press
/// ink runs from the paper's left edge to its right under the pen line, uncut, while the face and the words keep the
/// dialog's inset (the face's left edge on the title's, the words' right edge on the floating pill's).
struct TapPersonRow: View {
    let person: TapPerson
    let line: TapRowLine?
    let top: String
    let bottom: String
    let action: () -> Void
    @Environment(\.modalPaperClips) private var clips
    @Environment(\.modalPaperInset) private var inset
    @Environment(\.window) private var window

    var body: some View {
        let author = person.author
        let wide = TapListMetrics.wide(window)
        let reach = TapDialog.reach(clipped: clips, inset: inset)
        Button(action: action) {
            HStack(spacing: 12) {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: TapListMetrics.dialogFace, seed: author.avatarSeedValue)
                VStack(alignment: .leading, spacing: 2) {
                    Text(author.handle)
                        .font(AppFonts.body(TapListMetrics.nameSize(wide: wide), weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .lineLimit(1)
                    if let line {
                        Text(line.words)
                            .font(AppFonts.body(TapListMetrics.lineSize(wide: wide)))
                            .foregroundStyle(line == .pick ? Tokens.buttonOnTonal : Tokens.textMuted)
                            .lineLimit(TapListMetrics.lineLimit)
                            .truncationMode(.tail)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // `reach` a side, which the list (-reach) takes back: the face at the dialog's inset, the band to the paper's
            // edges. 8 above and below: a row of a name and one line stays 60, and one with a two-line quote grows past
            // it with air at both ends. No note's excerpt (round 34 §10: the note arrives as a message, read there).
            .padding(.horizontal, reach)
            .padding(.vertical, TapListMetrics.rowPad)
            .frame(minHeight: TapListMetrics.dialogRow)
            // Pressed on the paper only: what reaches past its frame is clipped from sight, and is the backdrop's.
            .contentShape(SidesIn(by: TapDialog.overhang(reach: reach, inset: inset)))
        }
        // Round 34 §11 (the owner: no ink band on the people's rows): pressed, hovered or not, a row draws nothing — it
        // still opens its page. Its band keys (`top`, `bottom`) stay for the list's order; the passages keep their wash.
        .buttonStyle(QuietPressStyle())
        .hoverEffectDisabled()
        .accessibilityElement(children: .combine)
    }

    /// Where a row leads: the conversation of the note they left on the card, else their page — a tap alone is no
    /// way to be written to (§U3.2, S3).
    static func route(for person: TapPerson) -> Route {
        let author = person.author
        return person.note == nil ? .author(author.handle) : .thread(handle: author.handle, uid: author.id, note: nil)
    }
}

/// A button that shows nothing of a press (round 34 §11): its label as it is — no wash, no dimming.
struct QuietPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
}

/// The rows of a list, banded, each curve keyed by the row under it (``ListBands``); `line` gives each its second line.
struct TapRows: View {
    let people: [TapPerson]
    let line: (TapPerson) -> TapRowLine?
    let press: (TapPerson) -> Void

    var body: some View {
        let ids = people.map { "tap:\($0.author.id)" }
        let below = ListBands.below(ids, after: ListBands.endKey)
        VStack(spacing: 0) {
            ForEach(Array(people.enumerated()), id: \.element.author.id) { i, person in
                TapPersonRow(person: person, line: line(person), top: ids[i], bottom: below[i]) { press(person) }
            }
        }
    }
}

/// While the list is read: rows' shapes, as many as the caller knows are coming (`loadingRows`: the faces already
/// shown, round 33 §Q1 — never a default); when it couldn't be, a line and 重試. A list not asked for yet (`people`
/// nil) is one on its way.
struct TapListState: View {
    let people: TapPeople?
    let loadingRows: Int
    @Environment(\.modalPaperClips) private var clips
    @Environment(\.modalPaperInset) private var inset

    var body: some View {
        let reach = TapDialog.reach(clipped: clips, inset: inset)
        switch people?.phase ?? .loading {
        case .loading:
            VStack(spacing: 0) {
                ForEach(0..<max(1, loadingRows), id: \.self) { i in
                    HStack(spacing: 12) {
                        SkeletonBlock(width: TapListMetrics.dialogFace, circle: true)
                        SkeletonBlock(width: i % 2 == 0 ? 112 : 88, height: 14)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, reach)
                    .frame(height: TapListMetrics.dialogRow)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.Home.moreLoading)
            .skeletonTimeline()
        case .failed:
            VStack(alignment: .leading, spacing: 8) {
                ModalError(L10n.Native.loadError)
                OrganicButton(L10n.Native.retry, variant: .tonal, size: .sm) { Task { await people?.load() } }
            }
            .padding(.horizontal, reach)
            .padding(.vertical, 8)
        case .loaded:
            EmptyView()
        }
    }
}

/// A family dialog's list (round 33, round 34): the rows — the loading rows standing for them from the first frame
/// (§Q1), 顯示更多 under them — reaching the paper's edges (§Q2), in the family's region (``TapDialogRegion``): the
/// classic footer under them while they and its foot (18 + 44 + 24) fit `cap` (the region's height at most, to the
/// paper's bottom edge, as the web's), else one scroll region `cap` tall down to that edge with the way out floating
/// over its fade.
struct TapListBody: View {
    let people: TapPeople?
    let loadingRows: Int
    let cap: CGFloat
    /// What heads the region (round 34 §5: the author's title, who-picked's title and sentence), scrolling with the
    /// rows, at the dialog's inset.
    var head: AnyView? = nil
    let line: (TapPerson) -> TapRowLine?
    let press: (TapPerson) -> Void
    @Environment(\.modalPaperClips) private var clips
    @Environment(\.modalPaperInset) private var inset

    var body: some View {
        TapDialogRegion(cap: cap) {
            VStack(spacing: 0) {
                if let head {
                    head
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, TapDialog.reach(clipped: clips, inset: inset))
                }
                if let people {
                    TapRows(people: people.people, line: line, press: press)
                }
                TapListState(people: people, loadingRows: loadingRows)
                if let people, people.next != nil {
                    OrganicButton(L10n.Home.moreBtn, variant: .tonal, size: .sm) { Task { await people.more() } }
                        .loading(people.loadingMore)
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)
                }
            }
        }
    }
}

/// A reader's list of who resonated (§U2.5): a centred dialog on every device — a phone's, a tablet's, the Mac's — with
/// no visible title, the rows banded, 60 tall with faces of 36 — since Wave 2 #3b everyone who resonated, newest first,
/// each with the sentence they picked, paged with 顯示更多 — each leading to that person's page; then 關閉 at its foot's
/// end (round 34: under rows that fit, floating over rows that scroll).
struct ReaderTapList: View {
    let cardId: String
    /// The card offers passages (round 27 §U3): the reader's own row says their pick or 選一段, and opens the dialog.
    var offersPassages = false
    /// The reader's pick as the page holds it (a pick just made shows at once, before the list knows it).
    var pagePick: TapRowLine.PagePick?
    /// The people as the page asked for them at the press (round 33 §Q1: read, or still on their way after
    /// ``TapDialog/firstPageWait``): taken as they are, never asked for twice.
    var preloaded: TapPeople?
    /// The faces the page shows over the capsule (at most three): the loading rows' count while the list is read.
    var knownFaces = 1
    var onPick: () -> Void = {}
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?
    /// The list drawn: the one read here, or from the first frame the page's (`preloaded`).
    private var list: TapPeople? { people ?? preloaded }

    /// The rows' cap: at most 420, and 55 % of the window.
    static func listCap(window: CGFloat) -> CGFloat { min(420, window * 0.55) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TapListBody(people: list, loadingRows: TapDialog.loadingRows(knownFaces: knownFaces),
                        cap: Self.listCap(window: window.height)) { person in
                TapRowLine.of(person, authorList: false, viewer: session.uid, offersPassages: offersPassages, pagePick: pagePick)
            } press: { person in
                onClose()
                if offersPassages, person.author.id == session.uid { return onPick() }
                openRoute(TapPersonRow.route(for: person))
            }
        }
        .dialogExit(L10n.Native.close, id: "tap-list-close", action: onClose)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tap-list")
        .task {
            if let preloaded {
                people = preloaded
                return
            }
            let api = session.reading, id = cardId
            let made = TapPeople { try await api.taps(id, pageToken: $0) }
            people = made
            await made.load()
        }
    }
}

// MARK: - What the author sees

/// On the author's own published card, where a reader's row would be (§U3): one line — the 16 wave in the muted ink,
/// ``facesGap`` before the three newest faces, and nothing after them (round 29 §S5: no blank disc) — the whole of it
/// one button opening who resonated. Nothing when no one has; no number anywhere.
struct AuthorTaps: View {
    let cardId: String
    let faces: [Author]
    let more: Bool
    @State private var open = false
    /// The list asked for at the press (round 33 §Q1), handed to the dialog.
    @State private var people: TapPeople?
    @State private var opening: Task<Void, Never>?
    @Environment(SessionStore.self) private var session

    /// From the wave's box to the first face's: the line's 8 and the 3 a face's paper pad stood in before it went
    /// (2026-11-19), so the first face's rim stays where it stood.
    static let facesGap: CGFloat = 11

    /// The author's line shows once someone has resonated — nothing at all before (no 「還沒有人共振」).
    static func shows(_ detail: CardDetail) -> Bool {
        detail.isOwner && !(detail.tap?.value1.faces.isEmpty ?? true)
    }

    var body: some View {
        let shown = Array(faces.prefix(FaceStack.maxFaces))
        Button(action: openList) {
            HStack(spacing: Self.facesGap) {
                OrganicIcon(.wave, size: 16, color: Tokens.textMuted, strokeWidth: Tokens.ink)
                FaceStack(faces: shown.map(TapFaces.face))
            }
            .frame(minHeight: TapFaces.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(TapState.spokenForAuthor(shown, more: more || faces.count > FaceStack.maxFaces))
        .accessibilityIdentifier("author-taps")
        .organicModal(isPresented: $open, seed: 31, maxWidth: TapListMetrics.dialogWidth, closeLabel: L10n.Native.close,
                      clipsToPaper: true, paperInset: ModalPaper.listInset) {
            AuthorTapList(cardId: cardId, preloaded: people, knownFaces: shown.count) { open = false }.withSession(session)
        }
        #if DEBUG
        // The release screenshots' `taps-author-list`: `-visualTaps author` opens the list.
        .task {
            guard UserDefaults.standard.string(forKey: "visualTaps") == "author" else { return }
            try? await Task.sleep(for: .milliseconds(600))
            openList()
        }
        #endif
    }

    /// The list is asked for at the press, and the dialog waits for it at most ``TapDialog/firstPageWait`` (§Q1): come
    /// by then, it opens at its final height; not yet, with a loading row for each face shown.
    private func openList() {
        opening?.cancel()
        let api = session.reading, id = cardId
        let made = TapPeople { try await api.taps(id, pageToken: $0) }
        opening = Task {
            await TapDialog.prepare(made)
            guard !Task.isCancelled else { return }
            people = made
            open = true
        }
    }
}

/// The author's list of who resonated (§U3.2): a centred dialog on every device — the title 「與這張卡片共振的人」, then
/// thirty people a page (顯示更多 the next), each a face of 36 and their pen name; one who left a note on the card has its
/// first line muted under the name and opens that conversation; one who only resonated opens their page (a tap is no
/// way to be written to). Round 27 §U2: the passage each picked, quoted under the name, before the note's excerpt. An
/// anonymous card's list has no note (the server sends none). 關閉 floats at its foot's end (round 33 §Q3).
struct AuthorTapList: View {
    let cardId: String
    /// The people as the line asked for them at the press (round 33 §Q1).
    var preloaded: TapPeople?
    /// The faces on the author's line (at most three): the loading rows' count while the list is read.
    var knownFaces = 1
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?
    private var list: TapPeople? { people ?? preloaded }

    /// The rows' cap: at most 520, and 60 % of the window.
    static func listCap(window: CGFloat) -> CGFloat { min(520, window * 0.6) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The title heads the region (round 34 §5), scrolling with the rows.
            TapListBody(people: list, loadingRows: TapDialog.loadingRows(knownFaces: knownFaces),
                        cap: Self.listCap(window: window.height),
                        head: AnyView(ModalTitle(L10n.Card.ResonatorsModal.title,
                                                 size: TapListMetrics.titleSize(wide: TapListMetrics.wide(window)))
                            .padding(.bottom, 10))) { person in
                TapRowLine.of(person, authorList: true, viewer: session.uid, offersPassages: false)
            } press: { person in
                onClose()
                openRoute(TapPersonRow.route(for: person))
            }
        }
        .dialogExit(L10n.Native.close, id: "author-taps-close", action: onClose)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("author-tap-list")
        .task {
            if let preloaded {
                people = preloaded
                return
            }
            let api = session.reading, id = cardId
            let made = TapPeople { try await api.taps(id, pageToken: $0) }
            people = made
            await made.load()
        }
    }
}
