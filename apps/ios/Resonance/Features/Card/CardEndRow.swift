import DesignSystem
import ResonanceAPI
import ResonanceKit
import SwiftUI

/// The end of someone else's story (round 26 §U1, the web's CardViewerActions; the owner: 「三種回饋的操作，第一種是按共振的
/// 按鈕…第二種是用小紙條回應它，第三種是用自己的卡片跟它連接…那其他被動的就包括分享和收藏」):
///
/// 1. **The capsule**, the three kinds of feedback, all tonal at rest — 共振 (the tap: a switch, solid with
///    `wave-pair` once on, its words unchanged), 寄小紙條 (opens the note in place under row 2, its wash held while open, never
///    a dialog), 用卡片回應 (the picker: write a card in answer or pick one; 修改 with a draft, 已回應 once published).
///    The puppets measure this bar alone (`.readingMark(.respond)`): row 2 and the field never move their ground.
/// 2. **Row 2**, directly under it, 44 tall, as wide as it: the faces of who resonated (the reader first, then their
///    connections — no words, no number) at its start, under 共振, and 收藏 as a glyph at its end. Share is the
///    bar's or the byline's already. The row is always there, so the reader's face slides in without moving the page.
/// 3. **The note field** when 寄小紙條 opened it (``NoteField``) — or, while three notes wait for the author's answer,
///    one muted line in its place.
///
/// Tapping 共振 fills the segment and slides the face in; a failure flips it back with 「沒送出去，再試一次」. On a card
/// that offers passages (round 27 §U1), a press that turned it on opens ``TapPassages`` 240 ms later — the tap never
/// waits on it — unless the story on screen is its translation.
struct CardEndRow: View {
    let detail: CardDetail
    /// The story's script: the passages are set in its type.
    let script: StoryScript
    /// The translation shows in place of the story: no passages are offered (they are the author's own words).
    let translated: Bool
    /// Reads the card again (a pick refused because its passages changed or the tap went).
    let reload: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @Environment(\.window) private var window
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scrollCardTo) private var scrollCardTo
    /// Your card answering this one, as far as it is known (`.found(nil)`: none).
    @State private var lookup = ResonanceLookup()
    @State private var picking = false
    @State private var resonating = false
    @State private var bookmark = BookmarkState()
    @State private var tap: TapState
    @State private var noteOpen = false
    /// The field opened by the reader takes the focus; opened by a draft with the page, it doesn't.
    @State private var noteFocusOnOpen = true
    /// The screenshots' words in the note's field (`-visualNote lines`), kept nowhere.
    @State private var noteShownText: String?
    @State private var noteFocus = 0
    @State private var noteHasWords = false
    /// Why the last send failed, for the field opened again on its words.
    @State private var noteWhy: String?
    @State private var listOpen = false
    /// Which part stayed with the reader (round 27 §U1): the dialog of the card's passages.
    @State private var passagesOpen = false
    /// The dialog's one press (``TapPassageRules/OnePress``), taken again each time it opens.
    @State private var passagePress = TapPassageRules.OnePress()
    /// The tap's own request on its way, which a pick's waits for (`nil` once answered: failed).
    @State private var tapSend: Task<Bool?, Never>?
    /// The screenshots' `-visualTap picked`: the dialog held open on its pick, nothing sent.
    @State private var passagesHeld = false
    /// The story's column, which a wide window's note field spans up to 680.
    @State private var column: CGFloat = 0

    init(detail: CardDetail, script: StoryScript = .cjk, translated: Bool = false, reload: @escaping () -> Void = {}) {
        self.detail = detail
        self.script = script
        self.translated = translated
        self.reload = reload
        _tap = State(initialValue: TapState(detail.tap?.value1))
    }

    private var cardId: String { detail.card.id }
    private var compact: Bool { window.layoutClass == .compact }
    /// The block the note field's focus scrolls into view (12 above the keyboard).
    static let noteBlock = "card.end.note"
    /// The capsule's second line, when it takes two (寄小紙條 · 寫卡片): the web's and Android's 73; the first keeps the
    /// bar's own 71.
    static let secondLineSeed: Double = 73

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                capsule
                    .sensoryFeedback(.selection, trigger: tap.on)
                rowTwo
                if lookup.tapFailed {
                    Text(L10n.Native.loadError).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                }
            }
            // A phone spreads it across the column; wider, the capsule keeps its own width and row 2 is as wide.
            .frame(maxWidth: compact ? .infinity : nil, alignment: .leading)
            .fixedSize(horizontal: !compact, vertical: false)
            if noteOpen {
                noteBlock
                    .padding(.top, NoteInPlace.gapAbove)
                    .transition(reduceMotion ? .identity : .opacity.combined(with: .offset(y: -6)))
            }
        }
        .animation(reduceMotion ? nil : NoteInPlace.change, value: noteOpen)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { column = $0 }
        .organicModal(isPresented: $picking, seed: 53, maxWidth: 480, closeLabel: L10n.Card.ResonatePicker.cancel,
                      dismissible: !resonating) {
            ResonatePickerContent(targetId: cardId, targetReferenceId: detail.card.referenceCardId, busy: $resonating) {
                picking = false
                writer.open(.init(referenceCardId: cardId))
            } onResonated: { card in
                picking = false
                // This page lists it among the replies now, the segment says 已回應, the card box moves it.
                writer.noteChange(.init(cardId: card.id, referenceCardId: cardId))
            } onCancel: {
                picking = false
            }
            .withSession(session)
        }
        // The reader's list of who resonated: a centred dialog with no title (the reader sees only their connections),
        // a phone's, a tablet's and the Mac's alike.
        .organicModal(isPresented: $listOpen, seed: 29, maxWidth: TapListMetrics.readerWidth(compact: compact), closeLabel: L10n.Native.close) {
            ReaderTapList(cardId: cardId, offersPassages: offersPassages,
                          pagePick: .init(text: tap.passages.first { $0.id == tap.passage }?.text),
                          onPick: openPassagesFromList) { listOpen = false }
                .withSession(session)
        }
        // Which part stayed with the reader (round 27 §U1): centred, as wide as the reader's list; 略過, the backdrop and
        // Escape leave the tap on with no passage.
        .organicModal(isPresented: $passagesOpen, seed: 37, maxWidth: TapListMetrics.readerWidth(compact: compact),
                      closeLabel: L10n.Card.Tap.passageSkip) {
            TapPassages(passages: tap.passages, picked: tap.passage, script: script, onChoose: choosePassage) {
                passagesOpen = false
            }
        }
        .onChange(of: translated) { _, now in if now { passagesOpen = false } }
        .onChange(of: passagesOpen) { _, open in if open { passagePress.reopen() } }
        // The note field opens again, focused, on its words: the toast's 再寄一次, or a failure while the page is here.
        .onAppear {
            session.noteSends.host(cardId, true)
            openForDraft()
        }
        .onDisappear { session.noteSends.host(cardId, false) }
        .onChange(of: session.noteSends.reopening, initial: true) { _, request in
            guard let request, request.cardId == cardId else { return }
            session.noteSends.take(request)
            noteWhy = request.why
            openNote(focus: true)
        }
        .onChange(of: detail.tap) { _, new in
            // The card read again (an edit, a reply published): its tap as the server has it, unless one is on its way.
            if !tap.working { tap = TapState(new?.value1) }
        }
        .task(id: "\(cardId)#\(writer.changes)") {
            // Signed out: nothing to find. A failed lookup is tried again, then left to a tap — never a segment dimmed
            // for good (nor one that could begin a second answer unasked).
            guard let drafts = session.drafts else { return await lookup.look { nil } }
            await lookup.look { try await drafts.myResonance(to: cardId) }
        }
        .task(id: cardId) {
            bookmark.found((try? await session.bookmarks?.isBookmarked(cardId)) ?? false)
        }
        #if DEBUG
        .task { await visualState() }
        #endif
    }

    #if DEBUG
    /// The release screenshots' states of the story's end (round 26; scripts/visual/screens.ts, with `-visualEnd YES` on
    /// the page): `-visualTap on` shows the reader's tap on (here only — nothing is sent), `-visualNote open` the note
    /// field open (unfocused: no keyboard in the picture), `-visualNote lines` open on three lines of words
    /// (``NoteInPlace/visualLines``: 寄出 the block on the last row), `-visualNote wait` the line in its
    /// place while three notes wait, `-visualTaps list` the faces' list open.
    private func visualState() async {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: "visualTap") != nil || defaults.string(forKey: "visualNote") != nil
            || defaults.string(forKey: "visualTaps") != nil else { return }
        try? await Task.sleep(for: .milliseconds(600))
        let visualTap = defaults.string(forKey: "visualTap")
        if ["on", "passages", "picked"].contains(visualTap), !tap.on {
            let viewer = session.me.map(Author.viewer)
            _ = tap.flip(viewer: viewer)
            tap.settled(turningOn: true, result: true, viewer: viewer)
        }
        // `-visualTap passages`: the dialog open after the press (card-passages); `-visualTap picked`: its second row
        // pressed and held in its ink and check (card-passage-picked). Nothing is sent.
        if visualTap == "passages" || visualTap == "picked", offersPassages {
            if visualTap == "picked", tap.passages.count > 1 {
                passagesHeld = true
                tap.pick(tap.passages[1].id)
            }
            passagesOpen = true
        }
        switch defaults.string(forKey: "visualNote") {
        case "open":
            noteFocusOnOpen = false
            noteOpen = true
        case "lines":
            noteShownText = NoteInPlace.visualLines
            noteFocusOnOpen = false
            noteOpen = true
        case "wait":
            tap = TapState(CardTap(mine: tap.on, faces: tap.faces, more: tap.more, mayNote: false,
                                   passages: tap.passages, passage: tap.passage))
            noteFocusOnOpen = false
            noteOpen = true
        default: break
        }
        if defaults.string(forKey: "visualTaps") == "list" { listOpen = true }
    }
    #endif

    // MARK: Row 1, the capsule

    private var replyFace: EndRowLabels.Reply {
        if case let .found(mine?) = lookup.state { return mine.published ? .published : .draft }
        return .answer
    }

    /// The first set of words that fits on one line, else the capsule in two (共振 alone on the first).
    private var capsule: some View {
        let sets = EndRowLabels.candidates(language: Strings.shared.language, reply: replyFace, column: column)
        let short = sets[sets.count - 1]
        return ViewThatFits(in: .horizontal) {
            ForEach(Array(sets.enumerated()), id: \.offset) { _, words in
                SegmentedActionBar(segments(words)).readingMark(.respond)
            }
            // Still too wide (large text, a narrow window): two lines, 8 apart; the puppets stand on the first.
            VStack(alignment: .leading, spacing: 8) {
                SegmentedActionBar([tapSegment(short)]).readingMark(.respond)
                SegmentedActionBar([noteSegment(short), replySegment(short)], seed: Self.secondLineSeed)
            }
        }
    }

    private func segments(_ words: EndRowLabels.Words) -> [SegmentSpec] {
        [tapSegment(words), noteSegment(words), replySegment(words)]
    }

    /// 共振 — a switch: tonal at rest, solid with `wave-pair` once on; its words stay (the owner, 2026-11-20: 已共振
    /// moved the wave beside it), VoiceOver hearing it selected.
    private func tapSegment(_ words: EndRowLabels.Words) -> SegmentSpec {
        SegmentSpec(id: "tap", icon: tap.on ? .wavePairOrWave : .wave, label: words.tap,
                    fill: tap.on ? Tokens.buttonFill : nil, ink: tap.on ? Tokens.cream : Tokens.buttonOnTonal,
                    pressInk: tap.on ? Tokens.towardInk.opacity(0.14) : Tokens.terracotta.opacity(0.14),
                    selected: tap.on, action: flipTap)
    }

    /// 寄小紙條 — opens the note in place (and focuses it); open and empty, closes it; open with words, focuses it.
    private func noteSegment(_ words: EndRowLabels.Words) -> SegmentSpec {
        SegmentSpec(id: "note", icon: .note, label: words.note, accessibilityLabel: L10n.Card.Note.entry, held: noteOpen) {
            guard session.uid != nil else { return }
            switch NoteInPlace.segmentTap(open: noteOpen, text: noteHasWords ? "words" : "") {
            case .open: openNote(focus: true)
            case .close: noteOpen = false
            case .focus: noteFocus += 1
            }
        }
    }

    /// 用卡片回應 — or what answers this card already: 已回應 opens it, 修改 takes its draft back to the writer.
    private func replySegment(_ words: EndRowLabels.Words) -> SegmentSpec {
        let label = words.reply
        let name = replyFace == .answer ? L10n.Card.Reply.label : label
        switch lookup.state {
        case let .found(mine?) where mine.published:
            return SegmentSpec(id: "reply", icon: .check, label: label, accessibilityLabel: name) { openRoute(.card(mine.id)) }
        case let .found(mine?):
            return SegmentSpec(id: "reply", icon: .pen, label: label, accessibilityLabel: name) { writer.edit(mine.id) }
        default:
            return SegmentSpec(id: "reply", icon: .cards, label: label, accessibilityLabel: name,
                               working: lookup.asking || lookup.state == .looking) {
                // Signed out there is nothing to pick from: the writer, as before.
                guard let drafts = session.drafts else { return writer.open(.init(referenceCardId: cardId)) }
                if lookup.state == .failed {
                    // Not known whether this card is answered already: asked now, the picker once it isn't.
                    Task { if await lookup.askOnTap({ try await drafts.myResonance(to: cardId) }) { picking = true } }
                } else {
                    picking = true
                }
            }
        }
    }

    /// The tap: flipped at once (the reader's face slides in first, or out), then set to what the server answers —
    /// back as it was, with 「沒送出去，再試一次」, when it fails. Turned on, on a card with passages, the dialog opens
    /// 240 ms after the press (at once under Reduce Motion); the tap's failing closes it.
    private func flipTap() {
        guard !tap.working, session.uid != nil else { return }
        let viewer = session.me.map(Author.viewer)
        let turningOn = withAnimation(reduceMotion ? nil : TapFaces.slide) { tap.flip(viewer: viewer) }
        let api = session.reading, id = cardId, toasts = session.toasts
        let send = Task { try? await (turningOn ? api.tap(id) : api.untap(id)) }
        tapSend = send
        if TapPassageRules.opens(turningOn: turningOn, passages: tap.passages, translated: translated) {
            passagesHeld = false
            Task {
                try? await Task.sleep(for: TapPassageRules.delay(TapPassageRules.openDelay, reduceMotion: reduceMotion))
                if tap.on { passagesOpen = true }
            }
        }
        Task {
            let result = await send.value
            withAnimation(reduceMotion ? nil : TapFaces.slide) { tap.settled(turningOn: turningOn, result: result, viewer: viewer) }
            if result == nil {
                passagesOpen = false
                toasts.show(L10n.Card.Tap.failed)
            }
        }
    }

    /// The card offers passages to this reader (two at least).
    private var offersPassages: Bool { TapPassageRules.offers(tap.passages) && !translated }

    /// A press on a passage's row: shown chosen at once (or cleared), the dialog closing 300 ms later; the request goes
    /// once the tap's own has answered. Refused because the options changed or the tap went (400, 409): read the card
    /// again, quietly; any other failure: 「沒送出去，再試一次」, the tap still on, the pick as it was.
    private func choosePassage(_ choice: String?) {
        // One press per opening: a second inside the close delay neither clears the pick nor sends again.
        guard passagePress.take() else { return }
        let before = tap.passage
        tap.pick(choice)
        guard !passagesHeld else { return }
        Task {
            try? await Task.sleep(for: TapPassageRules.delay(TapPassageRules.closeDelay, reduceMotion: reduceMotion))
            passagesOpen = false
        }
        let api = session.reading, id = cardId, toasts = session.toasts, send = tapSend, reload = reload
        Task {
            // The tap's PUT first: a pick is only taken on a tap that is on.
            if let send, await send.value != true { return }
            do {
                _ = try await api.setTapPassage(id, passage: choice)
            } catch {
                if tap.passage == choice { tap.pick(before) }
                switch TapPassageRules.refusal(status: (error as? APIFailure)?.status) {
                case .readAgain:
                    passagesOpen = false
                    reload()
                case .failed:
                    toasts.show(L10n.Card.Tap.failed)
                }
            }
        }
    }

    /// The reader's own row in the list (§U3): the list closes, then the dialog opens on the pick as it stands.
    private func openPassagesFromList() {
        passagesHeld = false
        Task {
            // The list's cover goes first (its scrim lifts in 160 ms), so the two never stand at once.
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 200 : 360))
            if tap.on, offersPassages { passagesOpen = true }
        }
    }

    // MARK: Row 2, the faces and 收藏

    private var rowTwo: some View {
        EndRowTwo {
            if !tap.shownFaces.isEmpty {
                // With passages on offer, the reader's own face alone is a button too: their row picks one (§U3).
                TapFaces(faces: tap.shownFaces, more: tap.showsMore, spoken: tap.spoken(viewer: session.uid),
                         isButton: !tap.onlyMine(viewer: session.uid) || (tap.on && offersPassages)) { listOpen = true }
            }
        } end: {
            // 收藏: pressed while saved (filled), flipped at once; saving says 「收藏到卡片盒了」.
            RowTwoBookmark(saved: bookmark.active) {
                guard let bookmarks = session.bookmarks else { return }
                let saving = bookmark.flip()
                if saving { session.toasts.show(L10n.Card.saved) }
                Task { bookmark.settled(saving: saving, result: try? await bookmarks.toggle(cardId)) }
            }
            .sensoryFeedback(.selection, trigger: bookmark.active)
        }
    }

    // MARK: The note, in place

    @ViewBuilder private var noteBlock: some View {
        Group {
            if tap.mayNote {
                NoteField(cardId: cardId, focusOnAppear: noteFocusOnOpen, focusRequest: noteFocus, why: noteWhy, shownText: noteShownText,
                          hasWords: $noteHasWords, onClose: { noteOpen = false; noteWhy = nil }, onUpgrade: { words in
                    noteOpen = false
                    // The note's words become the card's story (the web drops them; the apps keep them).
                    writer.open(.init(referenceCardId: cardId, story: words))
                }, openCard: { [openRoute, cardId] in openRoute(.card(cardId)) })
                .onChange(of: noteFocus) { bringNoteIntoView() }
                .onAppear { if noteFocusOnOpen { bringNoteIntoView() } }
            } else {
                NoteWaitLine()
            }
        }
        .frame(maxWidth: NoteInPlace.width(compact: compact, column: column) ?? .infinity, alignment: .leading)
        // 12 above the keyboard once it has risen under the field (the page scrolls; nothing floats), with nothing added
        // under it in the layout: the page's 40 is all there is to the next section.
        .noteScrollTarget(Self.noteBlock)
    }

    private func openNote(focus: Bool) {
        noteFocusOnOpen = focus
        if noteOpen, focus { noteFocus += 1 } else { noteOpen = true }
    }

    /// A draft not yet sent opens the field with the page, its words in it (no keyboard).
    private func openForDraft() {
        guard !noteOpen, let uid = session.uid,
              NoteInPlace.opensOnArrival(draft: session.noteDrafts.text(uid: uid, cardId: cardId)) else { return }
        noteFocusOnOpen = false
        noteOpen = true
    }

    /// The field's block to just above the keyboard, once the keyboard has risen.
    private func bringNoteIntoView() {
        let scroll = scrollCardTo
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(420))
            scroll(Self.noteBlock)
        }
    }
}

// MARK: - Row 2

/// Row 2's measures (§U1.2), the web's: its faces' line pads 6 (CardViewerActions.module.css `.faces`) and their button
/// 6 more (TapFaces.module.css `.faces`), so a face stands 12 in from the row's start; 收藏 is a bare glyph of 20
/// (BareIconButton, `iconSize` 20) centred in a 44 to the finger flush with the row's end, so its glyph ends 12 in.
/// Android's `Row2FacesStart` / `Row2GlyphEnd` (EndRowTwoTest) stand the same; the Mac's 77 % scales them all alike.
nonisolated enum RowTwo {
    /// The faces' line, padded at its start (the web's `.faces` `padding-inline-start`).
    static let facesLine: CGFloat = 6
    /// Where a face stands in from row 2's start: the line, then the button's own 6.
    static let faceInset: CGFloat = 12
    /// 收藏's touch box: a finger's, flush with the row's end (never hung past it).
    static let touch: CGFloat = 44
    /// 收藏's glyph, centred in its touch box.
    static let glyph: CGFloat = 20
    /// How far in from the row's end 收藏's glyph box ends: (44 − 20) / 2.
    static var glyphEnd: CGFloat { (touch - glyph) / 2 }
}

/// Row 2 (§U1.2), laid out alone: as wide as the capsule above it (the caller gives the width), 44 tall, `faces` at its
/// start on their line ``RowTwo/facesLine`` in, `end` (收藏) at its end. Always there, faces or none, so a face coming
/// in never moves the page.
struct EndRowTwo<Faces: View, End: View>: View {
    @ViewBuilder let faces: Faces
    @ViewBuilder let end: End

    var body: some View {
        HStack(spacing: 0) {
            faces.padding(.leading, RowTwo.facesLine)
            Spacer(minLength: 12)
            end
        }
        .frame(height: TapFaces.rowHeight)
    }
}

/// 收藏 (§U1.2): a bare glyph at row 2's end, the web's BareIconButton — the muted text ink with the one pen (INK) at
/// rest and once saved, drawn filled in that ink then (never the story's text ink, never a heavier pen) — centred in a 44
/// square to the finger flush with the row's end, so its glyph ends ``RowTwo/glyphEnd`` in. Named by what a tap does
/// (收藏 / 取消收藏, what the flows say to it).
struct RowTwoBookmark: View {
    let saved: Bool
    let action: () -> Void

    /// The glyph as the web draws it: `--color-text-muted`, INK, filled in the same ink once saved.
    static func glyph(saved: Bool) -> some View {
        OrganicIcon(.bookmark, size: RowTwo.glyph, color: Tokens.textMuted, strokeWidth: Tokens.ink,
                    fill: saved ? Tokens.textMuted : nil)
    }

    var body: some View {
        Button(action: action) {
            Self.glyph(saved: saved)
                .frame(width: RowTwo.touch, height: RowTwo.touch)
                .contentShape(Rectangle())
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(saved ? L10n.Card.Bookmark.remove : L10n.Card.Bookmark.add)
        .accessibilityAddTraits(saved ? .isSelected : [])
    }
}

// MARK: - The capsule's words

/// The capsule's words (§U1.3): in Chinese 共振 · 寄小紙條 · 用卡片回應 where they fit, then 寫卡片 for the last; in English,
/// or in a column of `narrowRow` or less (a 375 phone's 335), only the short set (Resonate · Note · Card, 共振 · 寄小紙條 ·
/// 寫卡片), as the web's `NARROW_ROW` and Android's `EndRowLayout.NARROW`. The reply segment says 修改 with a draft and 已回應 once published,
/// whatever the width; the tap 共振 on and off. No segment is ever hidden: past the last set the capsule takes two lines.
nonisolated enum EndRowLabels {
    enum Reply: Equatable { case answer, draft, published }

    /// At this column width or less the capsule says its short words, whether the full ones squeeze in or not.
    static let narrowRow: CGFloat = 340

    struct Words: Equatable {
        let tap: String
        let note: String
        let reply: String
    }

    /// The sets to try, widest first, for a story column `column` wide (0: not measured yet, so the full words first).
    static func candidates(language: Strings.Language, reply: Reply, column: CGFloat) -> [Words] {
        let tap = L10n.Card.Tap.label
        func replyWords(short: Bool) -> String {
            switch reply {
            case .answer: short ? L10n.Card.Reply.short : L10n.Card.Reply.label
            case .draft: L10n.Card.modify
            case .published: L10n.Card.Reply.done
            }
        }
        let short = Words(tap: tap, note: L10n.Card.Note.short, reply: replyWords(short: true))
        guard language == .zhTW, !(column > 0 && column <= narrowRow) else { return [short] }
        return [Words(tap: tap, note: L10n.Card.Note.entryShort, reply: replyWords(short: false)), short]
    }
}

// MARK: - The tap

/// The reader's resonance tap and the faces it shows (§U1, §U2), flipped at once on a tap and set to what the server
/// answers (back as it was when it fails). The faces are the reader first when on, then their connections who tapped,
/// newest first, as `CardDetail.tap` brought them; three show, then the blank disc when there are more.
nonisolated struct TapState: Equatable {
    private(set) var on: Bool
    private(set) var faces: [Author]
    private(set) var more: Bool
    /// Whether a note to the author would be taken now (false while three wait for their answer).
    private(set) var mayNote: Bool
    /// A tap's request is on its way: another tap waits for it.
    private(set) var working = false
    /// The card's passages offered to this reader (round 27 §P3; none on a short card, or for the author).
    private(set) var passages: [TapPassage]
    /// The reader's pick among them, its id (none: nil).
    private(set) var passage: String?
    /// The pick before a flip, put back when the flip fails.
    private var passageBefore: String?

    init(_ tap: CardTap?) {
        on = tap?.mine ?? false
        faces = tap?.faces ?? []
        more = tap?.more ?? false
        mayNote = tap?.mayNote ?? true
        passages = tap?.passages ?? []
        passage = tap?.passage
    }

    /// The tap: shown flipped at once — the viewer's face in first, or out. Returns whether it is turning on. Either
    /// way it starts with no pick (the server clears it when the tap goes; a tap turned on again has none).
    mutating func flip(viewer: Author?) -> Bool {
        on.toggle()
        place(viewer)
        working = true
        passageBefore = passage
        passage = nil
        return on
    }

    /// The server's answer (`nil`: it failed, so it goes back as it was, its pick too).
    mutating func settled(turningOn: Bool, result: Bool?, viewer: Author?) {
        working = false
        let now = result ?? !turningOn
        guard now != on else { return }
        on = now
        place(viewer)
        if result == nil { passage = passageBefore }
    }

    /// The reader's pick, shown at once (nil clears it); only while the tap is on, and only one of the passages.
    mutating func pick(_ id: String?) {
        guard on else { return }
        guard let id else { passage = nil; return }
        if passages.contains(where: { $0.id == id }) { passage = id }
    }

    private mutating func place(_ viewer: Author?) {
        guard let viewer else { return }
        faces.removeAll { $0.id == viewer.id }
        if on { faces.insert(viewer, at: 0) }
    }

    /// The faces drawn: three at most.
    var shownFaces: [Author] { Array(faces.prefix(FaceStack.maxFaces)) }
    /// The blank disc: more people than the faces drawn.
    var showsMore: Bool { more || faces.count > FaceStack.maxFaces }

    /// The only face is the reader's own: not a button (there is no list to open), read as 「你共振了」.
    func onlyMine(viewer: String?) -> Bool {
        on && !showsMore && faces.count == 1 && faces.first?.id == viewer
    }

    /// What a screen reader hears of the faces (nothing on screen says it): 「你共振了，你連結的人裡，與這張卡片共振的：小安、
    /// 阿明，還有其他人」.
    func spoken(viewer: String?, language: Strings.Language = Strings.shared.language) -> String {
        let zh = language == .zhTW
        let others = faces.filter { $0.id != viewer }.map(\.handle)
        var parts: [String] = []
        if on, faces.contains(where: { $0.id == viewer }) { parts.append(L10n.Card.Tap.selfOnly) }
        if !others.isEmpty {
            var names = others.joined(separator: zh ? "、" : ", ")
            if showsMore { names += (zh ? "，" : ", ") + L10n.Card.Tap.more }
            parts.append(L10n.Card.Tap.facesReader(names: names))
        }
        return parts.joined(separator: zh ? "，" : ", ")
    }

    /// The author's line, spoken: 「與這張卡片共振的人：小安、阿明，還有其他人」.
    static func spokenForAuthor(_ faces: [Author], more: Bool, language: Strings.Language = Strings.shared.language) -> String {
        let zh = language == .zhTW
        var names = faces.map(\.handle).joined(separator: zh ? "、" : ", ")
        if more { names += (zh ? "，" : ", ") + L10n.Card.Tap.more }
        return L10n.Card.Tap.facesAuthor(names: names)
    }
}

extension Author {
    /// The signed-in person as a face (their tap on, before the server's answer brings their stored seed).
    static func viewer(_ me: Components.Schemas.Me) -> Author {
        Author(id: me.id, handle: me.handle, initials: me.initials, accentColor: me.accentColor, avatarUrl: me.avatarUrl,
               avatarSeed: nil, verified: false, region: me.region)
    }
}

extension IconName {
    /// The tap's glyph once on (§U1.1): two waves in phase, `wave-pair` — the web's registry icon this round adds. Until
    /// the generated icons carry it, the plain wave.
    static var wavePairOrWave: IconName { IconName(rawValue: "wave-pair") ?? .wave }
}

// MARK: - Shared with the old row

/// Whether the reader keeps this card: flipped at once on a tap, then set to what the write
/// returns (back as it was when it failed).
struct BookmarkState: Equatable {
    private(set) var active = false

    mutating func found(_ saved: Bool) { active = saved }

    /// The tap: shown flipped at once. Returns whether it is saving.
    mutating func flip() -> Bool {
        active.toggle()
        return active
    }

    /// The write's answer (`nil`: it failed, so it goes back).
    mutating func settled(saving: Bool, result: Bool?) {
        active = result ?? !saving
    }
}

extension View {
    /// Fades in (and rises 10) once scrolled to — the story's end row, as the web's ReadAfterArea.
    func revealedOnScroll() -> some View { modifier(RevealedOnScroll()) }
}

private struct RevealedOnScroll: ViewModifier {
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 10)
            .onScrollVisibilityChange(threshold: 0.08) { visible in
                guard visible, !shown else { return }
                withAnimation(.easeOut(duration: 0.6)) { shown = true }
            }
    }
}

extension EnvironmentValues {
    /// Scrolls the card page so the view with this id ends at the visible foot (the note field's block above the
    /// keyboard); nothing outside a card page.
    @Entry var scrollCardTo: @MainActor (String) -> Void = { _ in }
}
