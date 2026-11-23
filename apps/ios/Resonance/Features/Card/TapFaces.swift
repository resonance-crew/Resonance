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
    /// The reader's own face sliding in or out (none under Reduce Motion).
    static let slide = Animation.easeOut(duration: 0.15)
    /// The button's pad at each side of the faces, the web's 6 (TapFaces.module.css `.faces`): after row 2's line
    /// (``RowTwo/facesLine``), the first face's rim stands ``RowTwo/faceInset`` in.
    static let buttonPad: CGFloat = RowTwo.faceInset - RowTwo.facesLine

    var body: some View {
        let stack = FaceStack(faces: faces.map(Self.face))
            .padding(.horizontal, Self.buttonPad)
            // A finger's 44 at the least, the faces at its start (the web's `min-width: 44px`).
            .frame(minWidth: Self.rowHeight, minHeight: Self.rowHeight, alignment: .leading)
            .contentShape(Rectangle())
        if isButton {
            Button(action: onOpen) { stack }
                .buttonStyle(OrganicPressStyle(inset: 2))
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
enum TapListMetrics {
    static let dialogWidth: CGFloat = 480
    static func readerWidth(compact: Bool) -> CGFloat { compact ? 400 : dialogWidth }
    static let dialogRow: CGFloat = 60
    static let dialogFace: CGFloat = 36
    /// A row's quote and its note's excerpt: two lines each at most, on every platform (round 27 §U2, S9).
    static let lineLimit = 2
    /// Above and below a row's content: within 60 for a name and one line.
    static let rowPad: CGFloat = 8
}

/// One person of a list: their face and pen name, banded (the curves show as a press's wash), leading to their page —
/// or, on the author's list when they left a note on the card, to that conversation (an unconnected reader's is the
/// letter; replying connects, as today). Under the name (round 27 §U2, §U3): the passage they picked, quoted (``TapRowLine``),
/// muted, two lines at most, or 選一段 on a reader's own row; then the note's excerpt, muted, two lines at most (as
/// Android's). A row with neither is 60 tall, as before.
struct TapPersonRow: View {
    let person: TapPerson
    let line: TapRowLine?
    let top: String
    let bottom: String
    let action: () -> Void

    var body: some View {
        let author = person.author
        let note = person.note?.value1.excerpt
        Button(action: action) {
            HStack(spacing: 12) {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: TapListMetrics.dialogFace, seed: author.avatarSeedValue)
                VStack(alignment: .leading, spacing: 2) {
                    Text(author.handle)
                        .font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .lineLimit(1)
                    if let line {
                        Text(line.words)
                            .font(AppFonts.body(13))
                            .foregroundStyle(line == .pick ? Tokens.buttonOnTonal : Tokens.textMuted)
                            .lineLimit(TapListMetrics.lineLimit)
                            .truncationMode(.tail)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let note {
                        Text(note)
                            .font(AppFonts.body(13))
                            .foregroundStyle(Tokens.textMuted)
                            .lineLimit(TapListMetrics.lineLimit)
                            .truncationMode(.tail)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // 12 a side, which the dialog's scroll (-12) pulls back to its own padding: a face stands at the dialog's
            // padding and the bands reach nearer its paper's edges. 8 above and below: a row of a name and one line
            // stays 60, and one with a quote and a note grows past it with air at both ends.
            .padding(.horizontal, 12)
            .padding(.vertical, TapListMetrics.rowPad)
            .frame(minHeight: TapListMetrics.dialogRow)
            .contentShape(Rectangle())
        }
        .buttonStyle(BandWashStyle(top: top, bottom: bottom, cut: true))
        .accessibilityElement(children: .combine)
    }

    /// Where a row leads: the conversation of the note they left on the card, else their page — a tap alone is no
    /// way to be written to (§U3.2, S3).
    static func route(for person: TapPerson) -> Route {
        let author = person.author
        return person.note == nil ? .author(author.handle) : .thread(handle: author.handle, uid: author.id, note: nil)
    }
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

/// While the list is read: rows' shapes (two, or as many as the caller knows are coming — `loadingRows`); when it
/// couldn't be, a line and 重試. A list not asked for yet (`people` nil) is one on its way.
struct TapListState: View {
    let people: TapPeople?
    var loadingRows = 2

    var body: some View {
        switch people?.phase ?? .loading {
        case .loading:
            VStack(spacing: 0) {
                ForEach(0..<max(1, loadingRows), id: \.self) { i in
                    HStack(spacing: 12) {
                        SkeletonBlock(width: TapListMetrics.dialogFace, circle: true)
                        SkeletonBlock(width: i % 2 == 0 ? 112 : 88, height: 14)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
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
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        case .loaded:
            EmptyView()
        }
    }
}

/// A reader's list of who resonated (§U2.5): a centred dialog on every device — a phone's, a tablet's, the Mac's — with
/// no visible title, the rows banded, 60 tall with faces of 36 — since Wave 2 #3b everyone who resonated, newest first,
/// each with the sentence they picked, paged with 顯示更多 — each leading to that person's page; then the dialog's 關閉 at
/// its foot's end.
struct ReaderTapList: View {
    let cardId: String
    /// The card offers passages (round 27 §U3): the reader's own row says their pick or 選一段, and opens the dialog.
    var offersPassages = false
    /// The reader's pick as the page holds it (a pick just made shows at once, before the list knows it).
    var pagePick: TapRowLine.PagePick?
    var onPick: () -> Void = {}
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let people {
                ScrollView {
                    TapRows(people: people.people) { person in
                        TapRowLine.of(person, authorList: false, viewer: session.uid, offersPassages: offersPassages, pagePick: pagePick)
                    } press: { person in
                        onClose()
                        if offersPassages, person.author.id == session.uid { return onPick() }
                        openRoute(TapPersonRow.route(for: person))
                    }
                    TapListState(people: people)
                    // Wave 2 #3b: everyone who resonated, paged as the author's list is.
                    if people.next != nil {
                        OrganicButton(L10n.Home.moreBtn, variant: .tonal, size: .sm) { Task { await people.more() } }
                            .loading(people.loadingMore)
                            .fixedSize()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 12)
                    }
                }
                .scrollIndicators(.hidden)
                .scrollBounceBehavior(.basedOnSize)
                .scrollEdgeFades()
                .frame(maxHeight: min(420, window.height * 0.55))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, -12)
            }
            ModalCloseButton(L10n.Native.close, action: onClose)
        }
        .task {
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
    @Environment(SessionStore.self) private var session

    /// From the wave's box to the first face's: the line's 8 and the 3 a face's paper pad stood in before it went
    /// (2026-11-19), so the first face's rim stays where it stood.
    static let facesGap: CGFloat = 11

    /// The author's line shows once someone has resonated — nothing at all before (no 「還沒有人共振」).
    static func shows(_ detail: CardDetail) -> Bool {
        detail.isOwner && !(detail.tap?.value1.faces.isEmpty ?? true)
    }

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: Self.facesGap) {
                OrganicIcon(.wave, size: 16, color: Tokens.textMuted, strokeWidth: Tokens.ink)
                FaceStack(faces: faces.prefix(FaceStack.maxFaces).map(TapFaces.face))
            }
            .frame(minHeight: TapFaces.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(TapState.spokenForAuthor(Array(faces.prefix(FaceStack.maxFaces)),
                                                     more: more || faces.count > FaceStack.maxFaces))
        .accessibilityIdentifier("author-taps")
        .organicModal(isPresented: $open, seed: 31, maxWidth: TapListMetrics.dialogWidth, closeLabel: L10n.Native.close) {
            AuthorTapList(cardId: cardId) { open = false }.withSession(session)
        }
        #if DEBUG
        // The release screenshots' `taps-author-list`: `-visualTaps author` opens the list.
        .task {
            guard UserDefaults.standard.string(forKey: "visualTaps") == "author" else { return }
            try? await Task.sleep(for: .milliseconds(600))
            open = true
        }
        #endif
    }
}

/// The author's list of who resonated (§U3.2): a centred dialog on every device — the title 「與這張卡片共振的人」, then
/// thirty people a page (顯示更多 the next), each a face of 36 and their pen name; one who left a note on the card has its
/// first line muted under the name and opens that conversation; one who only resonated opens their page (a tap is no
/// way to be written to). Round 27 §U2: the passage each picked, quoted under the name, before the note's excerpt. An
/// anonymous card's list has no note (the server sends none).
struct AuthorTapList: View {
    let cardId: String
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Card.ResonatorsModal.title).padding(.bottom, 10)
            if let people {
                ScrollView {
                    TapRows(people: people.people) { person in
                        TapRowLine.of(person, authorList: true, viewer: session.uid, offersPassages: false)
                    } press: { person in
                        onClose()
                        openRoute(TapPersonRow.route(for: person))
                    }
                    TapListState(people: people)
                    if people.next != nil {
                        OrganicButton(L10n.Home.moreBtn, variant: .tonal, size: .sm) { Task { await people.more() } }
                            .loading(people.loadingMore)
                            .fixedSize()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 12)
                    }
                }
                .scrollIndicators(.hidden)
                .scrollBounceBehavior(.basedOnSize)
                .scrollEdgeFades()
                .frame(maxHeight: min(520, window.height * 0.6))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, -12)
            }
            ModalCloseButton(L10n.Native.close, action: onClose)
        }
        .task {
            let api = session.reading, id = cardId
            let made = TapPeople { try await api.taps(id, pageToken: $0) }
            people = made
            await made.load()
        }
    }
}
