import DesignSystem
import ResonanceKit
import SwiftUI

/// The faces of who resonated (round 26 §U2; the owner: 「避免直接使用文字說…不要寫這樣的文字，直接放那個頭像就好。然後點擊可能就
/// 會出現那個名單」): ``FaceStack`` at 28 (the Mac's 77 % makes it 21.6), the whole group one button with a 44 hit area
/// opening the list — except when the only face is the reader's own, which is no button, read as 「你共振了」. What a
/// screen reader hears names them; nothing on screen does.
struct TapFaces: View {
    let faces: [Author]
    let more: Bool
    let spoken: String
    let isButton: Bool
    let onOpen: () -> Void

    /// Row 2 under the capsule: always this tall, faces or none, so a face coming in never moves the page.
    static let rowHeight: CGFloat = 44
    /// The reader's own face sliding in or out (none under Reduce Motion).
    static let slide = Animation.easeOut(duration: 0.15)
    /// The button's pad at each side of the faces, the web's 6 (TapFaces.module.css `.faces`) less the faces' own pad
    /// (``FaceStack/padGrow`` / 2, drawn inside the stack's width here, around it on the web): after row 2's line
    /// (``RowTwo/facesLine``), a face stands ``RowTwo/faceInset`` in.
    static let buttonPad: CGFloat = RowTwo.faceInset - RowTwo.facesLine - FaceStack.padGrow / 2

    var body: some View {
        let stack = FaceStack(faces: faces.map(Self.face), more: more)
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

/// The lists' measures (§U2.5, §U3.2).
enum TapListMetrics {
    /// A phone's reader list: a centred dialog, min(column, 400).
    static let dialogWidth: CGFloat = 400
    static let dialogRow: CGFloat = 60
    static let dialogFace: CGFloat = 36
    /// A tablet's, the Mac's: a popover 8 under the faces, 280 wide, rows 52 with faces 28, six rows then it scrolls.
    static let popoverWidth: CGFloat = 280
    static let popoverGap: CGFloat = 8
    static let popoverRow: CGFloat = 52
    static let popoverFace: CGFloat = 28
    static let popoverRows = 6
    /// The author's list: a centred dialog on every device, 480 wide, 30 rows a page.
    static let authorWidth: CGFloat = 480
}

/// A list row's measures: how tall, its face, the pad from the list's edge to the face (and from the name to the other
/// edge), the gap from the face to the name, and the name's type size.
struct TapRowMeasure: Equatable {
    let height: CGFloat
    let face: CGFloat
    let inset: CGFloat
    let gap: CGFloat
    let name: CGFloat

    /// A dialog's (60, faces 36): the rows pad 12 and the dialog's scroll runs 12 past its padding, so a face stands at
    /// the dialog's own padding and the bands reach nearer its paper's edges.
    static let dialog = TapRowMeasure(height: TapListMetrics.dialogRow, face: TapListMetrics.dialogFace, inset: 12, gap: 12, name: 15)
    /// The popover's (52, faces 28): 20 in from the sheet's pen line, 10 to the name, the name at 14 — a menu sheet's
    /// rows, as the web's (TapPeople.module.css `.list[data-size='popover']`). Its scroll runs to the sheet's edges, so
    /// nothing cancels it.
    static let popover = TapRowMeasure(height: TapListMetrics.popoverRow, face: TapListMetrics.popoverFace, inset: 20, gap: 10, name: 14)
}

/// One person of a list: their face and pen name, banded (the curves show as a press's wash), leading to their page —
/// or, on the author's list when they left a note on the card, its first line muted under the name, leading to that
/// conversation (an unconnected reader's is the letter; replying connects, as today).
struct TapPersonRow: View {
    let person: TapPerson
    let measure: TapRowMeasure
    let top: String
    let bottom: String
    let open: (Route) -> Void

    var body: some View {
        let author = person.author
        let note = person.note?.value1.excerpt
        Button { open(Self.route(for: person)) } label: {
            HStack(spacing: measure.gap) {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: measure.face, seed: author.avatarSeedValue)
                VStack(alignment: .leading, spacing: 2) {
                    Text(author.handle)
                        .font(AppFonts.body(measure.name, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .lineLimit(1)
                    if let note {
                        Text(note)
                            .font(AppFonts.body(13))
                            .foregroundStyle(Tokens.textMuted)
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, measure.inset)
            .frame(minHeight: measure.height)
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

/// The rows of a list, banded, each curve keyed by the row under it (``ListBands``).
private struct TapRows: View {
    let people: [TapPerson]
    let measure: TapRowMeasure
    let open: (Route) -> Void

    var body: some View {
        let ids = people.map { "tap:\($0.author.id)" }
        let below = ListBands.below(ids, after: ListBands.endKey)
        VStack(spacing: 0) {
            ForEach(Array(people.enumerated()), id: \.element.author.id) { i, person in
                TapPersonRow(person: person, measure: measure, top: ids[i], bottom: below[i], open: open)
            }
        }
    }
}

/// While the list is read: two rows' shapes; when it couldn't be, a line and 重試.
private struct TapListState: View {
    let people: TapPeople
    let measure: TapRowMeasure

    var body: some View {
        switch people.phase {
        case .loading:
            VStack(spacing: 0) {
                ForEach(0..<2, id: \.self) { i in
                    HStack(spacing: measure.gap) {
                        SkeletonBlock(width: measure.face, circle: true)
                        SkeletonBlock(width: i == 0 ? 112 : 88, height: 14)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, measure.inset)
                    .frame(height: measure.height)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(L10n.Home.moreLoading)
            .skeletonTimeline()
        case .failed:
            VStack(alignment: .leading, spacing: 8) {
                ModalError(L10n.Native.loadError)
                OrganicButton(L10n.Native.retry, variant: .tonal, size: .sm) { Task { await people.load() } }
            }
            .padding(.horizontal, measure.inset)
            .padding(.vertical, 8)
        case .loaded:
            EmptyView()
        }
    }
}

/// A phone's list of who resonated, for a reader (§U2.5): a centred dialog with no visible title — the reader sees
/// only their own connections, and a title would claim everyone — the rows banded, 60 tall with faces of 36, each
/// leading to that person's page; then the dialog's close.
struct ReaderTapList: View {
    let cardId: String
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let people {
                ScrollView {
                    TapRows(people: people.people, measure: .dialog) { route in
                        onClose()
                        openRoute(route)
                    }
                    TapListState(people: people, measure: .dialog)
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

// MARK: - A wide window's popover

/// The faces asking for their popover on a wide window: where they are, and how it closes.
struct TapsPopoverRequest {
    let anchor: Anchor<CGRect>
    let cardId: String
    let close: () -> Void
}

struct TapsPopoverKey: PreferenceKey {
    static let defaultValue: TapsPopoverRequest? = nil
    static func reduce(value: inout TapsPopoverRequest?, nextValue: () -> TapsPopoverRequest?) {
        value = value ?? nextValue()
    }
}

/// A tablet's or the Mac's list of who resonated (§U2.5): a sheet of the menus' paper inside their pen line, no
/// shadow, hanging 8 under the faces from their start, 280 wide, six rows of 52 (faces 28) and then it scrolls inside.
/// Laid by the card page over its own content (so it scrolls with the faces); a tap beside it or Escape closes it.
struct TapsPopover: View {
    let request: TapsPopoverRequest
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?
    @State private var shown = false

    var body: some View {
        GeometryReader { geo in
            let faces = geo[request.anchor]
            let x = max(0, min(faces.minX, geo.size.width - TapListMetrics.popoverWidth))
            ZStack(alignment: .topLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: request.close)
                    .accessibilityHidden(true)
                sheet
                    .opacity(shown ? 1 : 0)
                    .padding(.leading, x)
                    .padding(.top, faces.maxY + TapListMetrics.popoverGap)
            }
        }
        .accessibilityAction(.escape, request.close)
        .onEscapeKey(request.close)
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.18)) { shown = true } }
        .task {
            let api = session.reading, id = request.cardId
            let made = TapPeople { try await api.taps(id, pageToken: $0) }
            people = made
            await made.load()
        }
    }

    private var sheet: some View {
        let shape = MenuSheetShape(seed: 37)
        let rows = min(TapListMetrics.popoverRows, max(2, people?.people.count ?? 2))
        return ScrollView {
            TapsPopoverRows(people: people) { route in
                request.close()
                openRoute(route)
            }
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .frame(width: TapListMetrics.popoverWidth, height: CGFloat(rows) * TapListMetrics.popoverRow + 2 * TapsPopoverRows.edge)
        .background { shape.fill(MenuSheetColors.paper(hue: nil)) }
        .overlay {
            shape.stroke(MenuSheetColors.pen(hue: nil), style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
                .allowsHitTesting(false)
        }
        .clipShape(shape)
    }
}

/// The popover's rows, as its sheet scrolls them: 8 above and below (the web's `.popoverBody`), each face 20 in from
/// the sheet's pen line and 10 before the name (``TapRowMeasure/popover``).
struct TapsPopoverRows: View {
    /// The paper above the first row and below the last.
    static let edge: CGFloat = 8
    let people: TapPeople?
    let open: (Route) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let people {
                TapRows(people: people.people, measure: .popover, open: open)
                TapListState(people: people, measure: .popover)
            }
        }
        .padding(.vertical, Self.edge)
    }
}

// MARK: - What the author sees

/// On the author's own published card, where a reader's row would be (§U3): one line — the 16 wave in the muted ink, 8
/// before the three newest faces (and the blank disc when there are more) — the whole of it one button opening who
/// resonated. Nothing when no one has; no number anywhere.
struct AuthorTaps: View {
    let cardId: String
    let faces: [Author]
    let more: Bool
    @State private var open = false
    @Environment(SessionStore.self) private var session

    /// The author's line shows once someone has resonated — nothing at all before (no 「還沒有人共振」).
    static func shows(_ detail: CardDetail) -> Bool {
        detail.isOwner && !(detail.tap?.value1.faces.isEmpty ?? true)
    }

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 8) {
                OrganicIcon(.wave, size: 16, color: Tokens.textMuted, strokeWidth: Tokens.ink)
                FaceStack(faces: faces.prefix(FaceStack.maxFaces).map(TapFaces.face), more: more || faces.count > FaceStack.maxFaces)
            }
            .frame(minHeight: TapFaces.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(TapState.spokenForAuthor(Array(faces.prefix(FaceStack.maxFaces)),
                                                     more: more || faces.count > FaceStack.maxFaces))
        .accessibilityIdentifier("author-taps")
        .organicModal(isPresented: $open, seed: 31, maxWidth: TapListMetrics.authorWidth, closeLabel: L10n.Native.close) {
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
/// way to be written to). An anonymous card's list has faces and names only (the server sends no note).
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
                    TapRows(people: people.people, measure: .dialog) { route in
                        onClose()
                        openRoute(route)
                    }
                    TapListState(people: people, measure: .dialog)
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
