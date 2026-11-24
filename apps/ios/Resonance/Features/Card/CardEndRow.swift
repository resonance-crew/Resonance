import DesignSystem
import ResonanceAPI
import ResonanceKit
import SwiftUI

/// The end of someone else's story (round 26 §U1, the web's CardViewerActions; the owner: 「三種回饋的操作，第一種是按共振的
/// 按鈕…第二種是用小紙條回應它，第三種是用自己的卡片跟它連接…那其他被動的就包括分享和收藏」):
///
/// 1. **The faces' line** (round 30 §S1: it stood under the capsule until then), directly above the capsule's row, 44
///    tall: the faces of who resonated (the reader first, then their connections — no words, no number) at its start,
///    over 共振, and nothing at its end. For a signed-in reader it is always there, so their face slides in without
///    moving the capsule; it starts ``EndRowAir/facesLineAbove`` under the tags' row (or the story).
/// 2. **The capsule**, the three kinds of feedback, all tonal at rest — 共振 (the tap: a switch, solid with
///    `wave-pair` once on, its words unchanged), 寄小紙條 (opens the note in place 12 under the capsule, its wash held
///    while open, never a dialog), 用卡片回應 (the picker: write a card in answer or pick one; 修改 with a draft, 已回應
///    once published). The puppets measure this bar alone (`.readingMark(.respond)`): the faces and the field never
///    move their ground. Wide (the capsule at its own width: iPad, the Mac), 收藏 ends the capsule's row at the column's
///    end, the byline's ⋯'s right edge (round 28 §S2; ``EndRowCapsuleRow``); a phone's 收藏 ends the tags' row above
///    instead (§S3: ``EndRowTagsRow``, drawn by the page). Share and ⋯ stay the bar's or the byline's.
/// 3. **The note field** when 寄小紙條 opened it (``NoteField``), spanning the story's column — or, while three notes
///    wait for the author's answer, one muted line in its place.
///
/// Tapping 共振 fills the segment and slides the face in; a failure flips it back with 「沒送出去，再試一次」. On a card
/// that offers passages (round 27 §U1), a press that turned it on opens ``TapPassages`` 240 ms later — the tap never
/// waits on it — on the translation too when it says two of them at least (round 31 §R1: its rows the translation's words).
struct CardEndRow: View {
    let detail: CardDetail
    /// Whether the reader keeps this card: the page's, read here once, drawn here (wide) or in the page's tags row (a
    /// phone).
    let bookmark: CardBookmark
    /// The story's script: the passages are set in its type.
    let script: StoryScript
    /// The translation shows in place of the story.
    let translated: Bool
    /// The card's passages as the translation on screen says them (round 31 §R1, ``TranslatedPassages``): the dialog's
    /// rows take these words, in the card's order and ids, those it lacks left out; fewer than two offer no dialog, as before.
    let translationWords: [TapPassage]?
    /// A translation on its way that swaps in by itself: the screenshots' `-visualTap passages` waits for it.
    let translationComing: Bool
    /// Reads the card again: a pick refused because its passages changed or the tap went, and (Wave 2 #3b) after each
    /// tap and pick the server took, so the reader's face and wash show on the story at once.
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
    @State private var tap: TapState
    /// The 共振 segment's centre across the capsule (and row 2), once laid out (round 29 §S11).
    @State private var tapCentre: CGFloat?
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
    /// The reader's list asked for at the press (round 33 §Q1), handed to the dialog.
    @State private var listPeople: TapPeople?
    @State private var listOpening: Task<Void, Never>?
    /// The reader's list read ahead (round 34 §8): asked for once the faces' line can open it, so a press finds it read.
    @State private var listAhead: (key: String, people: TapPeople, reading: Task<Void, Never>)?
    /// Which part stayed with the reader (round 27 §U1): the dialog of the card's passages.
    @State private var passagesOpen = false
    /// The dialog's one press (``TapPassageRules/OnePress``), taken again each time it opens.
    @State private var passagePress = TapPassageRules.OnePress()
    /// The tap's own request on its way, which a pick's waits for (`nil` once answered: failed).
    @State private var tapSend: Task<Bool?, Never>?
    /// The screenshots' `-visualTap picked`: the dialog held open on its pick, nothing sent.
    @State private var passagesHeld = false
    /// A pick was sent from the dialog's opening: its answer reads the card again, not the dialog's closing.
    @State private var passagePicked = false
    /// The story's column, which the capsule's words are weighed in (the note field spans it at every width).
    @State private var column: CGFloat = 0

    init(detail: CardDetail, bookmark: CardBookmark, script: StoryScript = .cjk, translated: Bool = false,
         translationWords: [TapPassage]? = nil, translationComing: Bool = false, reload: @escaping () -> Void = {}) {
        self.detail = detail
        self.bookmark = bookmark
        self.script = script
        self.translated = translated
        self.translationWords = translationWords
        self.translationComing = translationComing
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
        // The faces' line directly on the capsule's row (round 30 §S1: it stood under it), the note 12 under the capsule.
        EndRowStack(facesLine: session.uid != nil) {
            rowTwo
        } capsuleRow: {
            // A phone spreads the capsule across the column; wider, it keeps its own width and 收藏 ends its row.
            switch EndRowPlacement.place(compact: compact) {
            case .tagsRow:
                measuredCapsule
            case .capsuleRow:
                EndRowCapsuleRow(room: EndRowPlacement.capsuleRoom(column: column)) {
                    measuredCapsule
                } end: {
                    CardBookmarkButton(bookmark: bookmark, cardId: cardId)
                }
            }
        } below: {
            if lookup.tapFailed {
                Text(L10n.Native.loadError).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
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
        // Round 34 §8: the list read before the press, again whenever the tap changes it — once the tap's own request
        // has answered, so the list has the reader's row as it now stands.
        .task(id: listOpens && !tap.working ? listKey : "") {
            if listOpens && !tap.working { readListAhead() }
        }
        // The reader's list of who resonated: a centred dialog with no title (everyone, since Wave 2 #3b),
        // a phone's, a tablet's and the Mac's alike — the tap lists' family (round 33): clipped to its paper at 24.
        .organicModal(isPresented: $listOpen, seed: 29, maxWidth: TapListMetrics.readerWidth(compact: compact), closeLabel: L10n.Native.close,
                      clipsToPaper: true, paperInset: ModalPaper.listInset) {
            ReaderTapList(cardId: cardId, offersPassages: offersPassages,
                          pagePick: .init(text: tap.passages.first { $0.id == tap.passage }?.text),
                          preloaded: listPeople, knownFaces: tap.shownFaces.count,
                          onPick: openPassagesFromList) { listOpen = false }
                .withSession(session)
        }
        // Which part stayed with the reader (round 27 §U1): centred, as wide as the reader's list; 略過, the backdrop and
        // Escape leave the tap on with no passage.
        .organicModal(isPresented: $passagesOpen, seed: 37, maxWidth: TapListMetrics.readerWidth(compact: compact),
                      closeLabel: L10n.Card.Tap.passageSkip, clipsToPaper: true, paperInset: ModalPaper.listInset) {
            TapPassages(passages: passageRows, picked: tap.passage, script: script, onChoose: choosePassage) {
                passagesOpen = false
            }
        }
        .onChange(of: translated) { _, now in if now { passagesOpen = false } }
        .onChange(of: passagesOpen) { _, open in
            if open {
                passagePress.reopen()
            } else {
                rereadAfterDialog()
            }
        }
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
        // 收藏's one read, wherever the page draws it.
        .task(id: cardId) { await bookmark.load(cardId, from: session.bookmarks) }
        #if DEBUG
        .task(id: translationComing) { if !translationComing { await visualState() } }
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
        // The page went, or a translation swapped in meanwhile (`-autoTranslateStories YES`): its own run opens it.
        guard !Task.isCancelled else { return }
        let visualTap = defaults.string(forKey: "visualTap")
        if ["on", "passages", "picked"].contains(visualTap), !tap.on {
            let viewer = session.me.map(Author.viewer)
            _ = tap.flip(viewer: viewer)
            tap.settled(turningOn: true, result: true, viewer: viewer)
        }
        // `-visualTap passages`: the dialog open after the press (card-passages); `-visualTap picked`: its second row
        // pressed and held in its ink and check (card-passage-picked). Nothing is sent.
        if visualTap == "passages" || visualTap == "picked", offersPassages {
            if visualTap == "picked", passageRows.count > 1 {
                passagesHeld = true
                tap.pick(passageRows[1].id)
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
        if defaults.string(forKey: "visualTaps") == "list" { openList() }
    }
    #endif

    // MARK: Row 1, the capsule

    private var replyFace: EndRowLabels.Reply {
        if case let .found(mine?) = lookup.state { return mine.published ? .published : .draft }
        return .answer
    }

    /// The first set of words that fits on one line, else the capsule in two (共振 alone on the first). Wide, each set
    /// keeps its own width and is weighed in the room 收藏 leaves (``EndRowPlacement/capsuleRoom(column:)``); the ≤ 340
    /// rule still reads the column's width.
    private var capsule: some View {
        let sets = EndRowLabels.candidates(language: Strings.shared.language, reply: replyFace, column: column)
        let short = sets[sets.count - 1]
        let natural = !compact
        return ViewThatFits(in: .horizontal) {
            ForEach(Array(sets.enumerated()), id: \.offset) { _, words in
                SegmentedActionBar(segments(words)).readingMark(.respond)
                    .fixedSize(horizontal: natural, vertical: false)
            }
            // Still too wide (large text, a narrow window): two lines, 8 apart; the puppets stand on the first, and
            // so does 收藏 beside it.
            VStack(alignment: .leading, spacing: 8) {
                SegmentedActionBar([tapSegment(short)]).readingMark(.respond)
                    .alignmentGuide(.capsuleFirstLine) { $0[VerticalAlignment.center] }
                SegmentedActionBar([noteSegment(short), replySegment(short)], seed: Self.secondLineSeed)
            }
            .fixedSize(horizontal: natural, vertical: false)
        }
    }

    private func segments(_ words: EndRowLabels.Words) -> [SegmentSpec] {
        [tapSegment(words), noteSegment(words), replySegment(words)]
    }

    /// 共振 — a switch: tonal at rest, solid with `wave-pair` once on; its words stay (the owner, 2026-11-20: 已共振
    /// moved the wave beside it), VoiceOver hearing it selected.
    /// The 共振 segment's id in the capsule.
    static let tapSegmentId = "tap"

    private func tapSegment(_ words: EndRowLabels.Words) -> SegmentSpec {
        SegmentSpec(id: Self.tapSegmentId, icon: tap.on ? .wavePairOrWave : .wave, label: words.tap,
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
        let opens = TapPassageRules.opens(turningOn: turningOn, passages: tap.passages, translated: saysTooFew)
        if opens {
            passagesHeld = false
            passagePicked = false
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
            } else if !opens {
                // Wave 2 #3b: the card read again, so the reader's face and their sentence's wash show (or go) on the
                // page at once. With the dialog open, it is read once that closes, or once the pick has answered.
                reload()
            }
        }
    }

    /// The passages' dialog closed with nothing sent from it (略過, the backdrop): the card read again once the tap's
    /// own request has answered (Wave 2 #3b) — a pick reads it again itself, once the server has it.
    private func rereadAfterDialog() {
        guard !passagePicked, !passagesHeld else { return }
        let send = tapSend, reload = reload
        Task {
            if let send { _ = await send.value }
            reload()
        }
    }

    /// What the page reads the passages in: nil on the original, the translation's pieces while it shows.
    private var passageWords: [TapPassage]? { TranslatedPassages.words(translated: translated, translation: translationWords) }

    /// The card offers passages to this reader (two at least) — in a translation, two at least said in it.
    private var offersPassages: Bool { TranslatedPassages.offers(tap.passages, words: passageWords) }

    /// The dialog's rows: the card's passages, in the translation's words while it shows (round 31 §R1).
    private var passageRows: [TapPassage] { TranslatedPassages.rows(tap.passages, words: passageWords) }

    /// The translation on screen says fewer than two of the card's passages: nothing is offered (as before round 31).
    private var saysTooFew: Bool { TranslatedPassages.saysTooFew(tap.passages, words: passageWords) }

    /// A press on a passage's row: shown chosen at once (or cleared), the dialog closing 300 ms later; the request goes
    /// once the tap's own has answered. Refused because the options changed or the tap went (400, 409): read the card
    /// again, quietly; any other failure: 「沒送出去，再試一次」, the tap still on, the pick as it was.
    private func choosePassage(_ choice: String?) {
        // One press per opening: a second inside the close delay neither clears the pick nor sends again.
        guard passagePress.take() else { return }
        let before = tap.passage
        tap.pick(choice)
        guard !passagesHeld else { return }
        passagePicked = true
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
                // Wave 2 #3b: read again, so the sentence's wash and the reader's face beside it show at once.
                reload()
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

    /// Whether the faces' line opens the reader's list (``rowTwo``'s button).
    private var listOpens: Bool {
        !tap.shownFaces.isEmpty && (!tap.onlyMine(viewer: session.uid) || (tap.on && offersPassages))
    }

    /// The list as it stands now (``TapDialog/listKey(card:on:passage:faces:more:)``).
    private var listKey: String {
        TapDialog.listKey(card: cardId, on: tap.on, passage: tap.passage, faces: tap.shownFaces.map(\.id), more: tap.showsMore)
    }

    /// Round 34 §8 (the owner: 「打开时先出现头像和名字，大约一秒后每一行的引句才出现」): the list's first page takes longer
    /// than the 300 ms a press waits on a real network, so the dialog opened on its loading rows — a face's disc and a
    /// name's bar each, 60 tall — and the rows came in with their quotes a moment later, taller. Now the page is read
    /// as soon as the faces' line can open it (the end row on screen, the tap as it stands), and read again only when
    /// that changes or the read failed: a press finds it read and the dialog opens complete.
    private func readListAhead() {
        let key = listKey
        if let ahead = listAhead, ahead.key == key, ahead.people.phase != .failed { return }
        let api = session.reading, id = cardId
        let made = TapPeople { try await api.taps(id, pageToken: $0) }
        listAhead = (key, made, Task { await made.load() })
    }

    /// The faces' list: read ahead (``readListAhead()``), or asked for now; the dialog waits for it at most
    /// ``TapDialog/firstPageWait`` (round 33 §Q1): come by then, it opens at its final height, quotes and all; not yet,
    /// with a loading row for each face shown, and the read carries on in it.
    private func openList() {
        listOpening?.cancel()
        readListAhead()
        guard let ahead = listAhead else { return }
        listOpening = Task {
            if ahead.people.phase != .loaded {
                _ = await firstAnswer(within: TapDialog.firstPageWait) { await ahead.reading.value }
            }
            guard !Task.isCancelled else { return }
            listPeople = ahead.people
            listOpen = true
        }
    }

    /// The reader's own row in the list (§U3): the list closes, then the dialog opens on the pick as it stands.
    private func openPassagesFromList() {
        passagesHeld = false
        passagePicked = false
        Task {
            // The list's cover goes first (its scrim lifts in 160 ms), so the two never stand at once.
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 200 : 360))
            if tap.on, offersPassages { passagesOpen = true }
        }
    }

    /// The capsule as the end row draws it, saying where its 共振 segment's centre is — from the capsule's start, which
    /// is the faces' line's too: the faces stand on it (round 29 §S11), over the capsule since round 30.
    private var measuredCapsule: some View {
        capsule
            .sensoryFeedback(.selection, trigger: tap.on)
            .backgroundPreferenceValue(SegmentBounds.self) { bounds in
                GeometryReader { proxy in
                    let centre = bounds[Self.tapSegmentId].map { proxy[$0].midX }
                    Color.clear
                        .onAppear { tapCentre = centre }
                        .onChange(of: centre) { tapCentre = centre }
                }
            }
    }

    // MARK: The faces' line

    private var rowTwo: some View {
        EndRowTwo(facesCentre: tapCentre, faceCount: tap.shownFaces.count) {
            if !tap.shownFaces.isEmpty {
                // With passages on offer, the reader's own face alone is a button too: their row picks one (§U3).
                TapFaces(faces: tap.shownFaces, spoken: tap.spoken(viewer: session.uid),
                         isButton: !tap.onlyMine(viewer: session.uid) || (tap.on && offersPassages)) { openList() }
                    // Over the capsule now: a puppet peeking over a short bar near them never rises in front of them.
                    .readingMark(.respondFaces)
            }
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
        // The story's column at every width (round 30 §S3: no 680 cap): wide, its send ends on the column's edge, where
        // 收藏's glyph box and the byline's ⋯ end.
        .frame(maxWidth: .infinity, alignment: .leading)
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

/// The faces' line's measures (§U1.2; "row 2" while it stood under the capsule), the web's: the faces stand centred on the
/// 共振 segment (round 29 §S11, the owner 2026-11-22: 「這三個圈圈可不可以中點幫我對齊這個共振按鈕的中間呢」), never past the
/// line's start; before the segment is measured (the first frame) the line pads 6 and their button 6 more, so a face
/// stands 12 in. 收藏 (which ended this row until round 28, and now ends the capsule's or the tags' row:
/// ``EndRowPlacement``) is a bare glyph of 20 (BareIconButton, `iconSize` 20) centred in a 44 to the finger, its glyph
/// 12 in from the box's end.
/// Android's `Row2FacesStart` / `Row2GlyphEnd` (EndRowTwoTest) stand the same; the Mac's 77 % scales them all alike.
nonisolated enum RowTwo {
    /// The faces' line, padded at its start (the web's `.faces` `padding-inline-start`).
    static let facesLine: CGFloat = 6
    /// Where a face stands in from row 2's start: the line, then the button's own 6.
    static let faceInset: CGFloat = 12
    /// 收藏's touch box: a finger's.
    static let touch: CGFloat = 44
    /// 收藏's glyph, centred in its touch box.
    static let glyph: CGFloat = 20
    /// How far in from its box's end 收藏's glyph box ends: (44 − 20) / 2.
    static var glyphEnd: CGFloat { (touch - glyph) / 2 }

    /// Where the faces' button starts in row 2 (§S11): the drawn faces' centre on `centre` (the 共振 segment's, from the
    /// row's start) for one, two or three, the button stopping at the row's start; nil (not measured yet) the line's 6.
    @MainActor static func facesLead(centre: CGFloat?, count: Int, size: CGFloat = FaceStack.size) -> CGFloat {
        guard let centre else { return facesLine }
        return max(0, centre - FaceStack.width(count: count, size: size) / 2 - TapFaces.buttonPad)
    }
}

/// The story's end row in its order (round 30 §S1, §S2; the owner: 「把共振这个地方已经共振的这些使用者头像，把它移到共振按钮的
/// 上方」): the faces' line (``EndRowTwo``) for a signed-in reader, directly on the capsule's row (0 between them), then
/// what stands under the capsule — the note's block, 12 under it (``NoteInPlace/gapAbove``). The eye's order is the
/// keyboard's and VoiceOver's: the faces, 共振 · 寄小紙條 · 用卡片回應, (wide) 收藏, the field.
struct EndRowStack<Faces: View, CapsuleRow: View, Below: View>: View {
    /// Signed in: the line is there, faces or none, so a face coming in never moves the capsule. Signed out it isn't.
    let facesLine: Bool
    @ViewBuilder let faces: Faces
    @ViewBuilder let capsuleRow: CapsuleRow
    @ViewBuilder let below: Below

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if facesLine { faces }
            capsuleRow
            below
        }
    }
}

/// The air around the end row (round 30 §S1): its faces' line starts 16 under what stands above it (the tags' row, or
/// the story when there is none) where the capsule stood 40 under it — so with no face yet the capsule is 16 + 44 = 60
/// under the tags; signed out (no faces' line) the capsule keeps its 40. The next section follows 40 under the capsule
/// (or the open note).
nonisolated enum EndRowAir {
    static let facesLineAbove: CGFloat = 16
    static let capsuleAbove: CGFloat = 40
    static let below: CGFloat = 40

    /// What stands between the row above and the end row.
    static func above(facesLine: Bool) -> CGFloat { facesLine ? facesLineAbove : capsuleAbove }
}

/// Row 2 (§U1.2, round 28 §S4) — since round 30 the faces' line above the capsule — laid out alone: 44 tall, `faces`
/// centred on `facesCentre` (the 共振 segment's centre from the line's start, round 29 §S11;
/// ``RowTwo/facesLead(centre:count:size:)``), nothing at its end. Always there for a signed-in reader, faces or none, so
/// a face coming in never moves the page.
struct EndRowTwo<Faces: View>: View {
    var facesCentre: CGFloat?
    var faceCount: Int
    @ViewBuilder let faces: Faces

    var body: some View {
        // The line is a clear strip of its own height with the faces laid on it: with no face yet the builder is empty,
        // an empty view lays out as nothing and a frame on nothing is nothing — the line would fold away and the
        // capsule under it drop 44 when the reader's own face arrived (round 30: the line stands above the capsule).
        Color.clear
            .frame(maxWidth: .infinity, minHeight: TapFaces.rowHeight, maxHeight: TapFaces.rowHeight)
            .overlay(alignment: .leading) { faces.padding(.leading, RowTwo.facesLead(centre: facesCentre, count: faceCount)) }
    }
}

// MARK: - Where 收藏 stands (round 28)

/// Where 收藏 stands at the end of someone else's story (round 28; the owner, 2026-11-21: 「這收藏按鈕不應該放在這裡」),
/// the web's CardViewerActions `.row` / `.ends` and the page's `.tagsRow`, and Android's twins:
///
/// - **wide** (the capsule at its own width, `!compact`: iPad, the Mac at 77 %): at the end of the capsule's row, at
///   the content column's end, centred on the capsule (on its first line when it takes two) — ``EndRowCapsuleRow``;
/// - **a phone** (compact, the capsule spans the column): at the end of the tags' row above it, on the tags' first
///   line, the tags wrapping in the column left to them — ``EndRowTagsRow``.
///
/// Its 44 box hangs ``hang`` past the column's end, as the byline's share and ⋯ do (CardScreen's `head`: their pads
/// in the margin, their glyphs' boxes ending on the column's edge), so 收藏's glyph and the byline's ⋯ share one right
/// edge. At least ``gap`` stands between the box and what is beside it.
nonisolated enum EndRowPlacement {
    enum Place: Equatable { case capsuleRow, tagsRow }

    /// Between 收藏's box and the capsule (or the tags) beside it, at least: the web's `.row` / `.tagsRow` gap.
    static let gap: CGFloat = 12
    /// How far 收藏's box reaches past the column's end: its pad, as the byline's glyphs' (`padding(.trailing, -12)`).
    static let hang: CGFloat = RowTwo.glyphEnd
    /// What 收藏 takes of the column: its box less what hangs in the margin.
    static var boxInColumn: CGFloat { RowTwo.touch - hang }

    static func place(compact: Bool) -> Place { compact ? .tagsRow : .capsuleRow }

    /// The room the capsule's words are weighed in, wide: the column less 收藏 and the gap before it (nil before the
    /// column is measured: the full words first, as the web's room 0).
    static func capsuleRoom(column: CGFloat) -> CGFloat? {
        column > 0 ? max(0, column - gap - boxInColumn) : nil
    }

    /// The tags' own column on a phone: the content's width less 收藏 and the gap before it.
    static func tagsColumn(content: CGFloat) -> CGFloat { max(0, content - gap - boxInColumn) }

    /// How far 收藏's box reaches above and below the tags' first line (negative: the web's
    /// `margin-block: (22 − box) / 2`), so a row of pills is no taller with it than without.
    static func tagsLineBleed(line: CGFloat) -> CGFloat { min(0, (line - RowTwo.touch) / 2) }
}

extension VerticalAlignment {
    private enum CapsuleFirstLine: AlignmentID {
        static func defaultValue(in d: ViewDimensions) -> CGFloat { d[VerticalAlignment.center] }
    }

    /// The capsule's first line: its centre, or its first bar's when it takes two (where 收藏 stands beside it).
    static let capsuleFirstLine = VerticalAlignment(CapsuleFirstLine.self)
}

/// The capsule's row, wide (§S2): the capsule at its own width, weighed in `room`, then `end` (收藏) at the column's
/// end — its box hanging ``EndRowPlacement/hang`` past it — centred on the capsule's first line.
struct EndRowCapsuleRow<Capsule: View, End: View>: View {
    let room: CGFloat?
    @ViewBuilder let capsule: Capsule
    @ViewBuilder let end: End

    var body: some View {
        HStack(alignment: .capsuleFirstLine, spacing: EndRowPlacement.gap) {
            capsule.frame(maxWidth: room ?? .infinity, alignment: .leading)
            end.padding(.trailing, -EndRowPlacement.hang)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The tags' row on a phone (§S3): the tags wrapping in their own column, `end` (收藏) at the row's end — its box
/// hanging ``EndRowPlacement/hang`` past it — centred on the tags' first line and never making the row taller than
/// the tags; with no tags, 收藏 alone at the row's end (the row is its box's height).
struct EndRowTagsRow<Tags: View, End: View>: View {
    let hasTags: Bool
    @ViewBuilder let tags: Tags
    @ViewBuilder let end: End
    /// The tags' first line, as drawn (a pill: about 22).
    @State private var line: CGFloat = 22

    var body: some View {
        HStack(alignment: .top, spacing: EndRowPlacement.gap) {
            if hasTags {
                tags
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onPreferenceChange(EndRowTagLine.self) { if $0 > 0 { line = $0 } }
            } else {
                Spacer(minLength: 0)
            }
            end
                .padding(.vertical, hasTags ? EndRowPlacement.tagsLineBleed(line: line) : 0)
                .padding(.trailing, -EndRowPlacement.hang)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The height of one tag, which the tags' row centres 收藏 on (any tag: they are one line box tall).
struct EndRowTagLine: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

extension View {
    /// Says this tag's height to the tags' row around it (``EndRowTagsRow``).
    func endRowTagLine() -> some View {
        background { GeometryReader { Color.clear.preference(key: EndRowTagLine.self, value: $0.size.height) } }
    }
}

/// Whether the reader keeps this card, for the page: read once (``CardEndRow``'s task), drawn wherever the page stands
/// 收藏 — the capsule's row or a phone's tags row — so it moves between them without asking again.
@MainActor @Observable final class CardBookmark {
    private(set) var state = BookmarkState()

    var saved: Bool { state.active }

    func load(_ cardId: String, from bookmarks: BookmarkService?) async {
        state.found((try? await bookmarks?.isBookmarked(cardId)) ?? false)
    }

    /// The tap: flipped at once, then set to what the write returns. Returns whether it is saving (nil: signed out,
    /// nothing done).
    @discardableResult
    func press(_ cardId: String, with bookmarks: BookmarkService?) -> Bool? {
        guard let bookmarks else { return nil }
        let saving = state.flip()
        Task {
            // The API path says what the reader wants (nothing read first); the older one flips the document.
            let result = bookmarks.usesAPI ? try? await bookmarks.set(cardId, saved: saving) : try? await bookmarks.toggle(cardId)
            state.settled(saving: saving, result: result)
        }
        return saving
    }
}

/// 收藏 as the page draws it: pressed while saved (filled), flipped at once; saving says 「收藏到卡片盒了」, with the
/// selection haptic.
struct CardBookmarkButton: View {
    let bookmark: CardBookmark
    let cardId: String
    @Environment(SessionStore.self) private var session

    var body: some View {
        RowTwoBookmark(saved: bookmark.saved) {
            if bookmark.press(cardId, with: session.bookmarks) == true { session.toasts.show(L10n.Card.saved) }
        }
        .sensoryFeedback(.selection, trigger: bookmark.saved)
    }
}

/// 收藏 (§U1.2): a bare glyph, the web's BareIconButton — the muted text ink with the one pen (INK) at rest and once
/// saved, drawn filled in that ink then (never the story's text ink, never a heavier pen) — centred in a 44 square to
/// the finger, so its glyph ends ``RowTwo/glyphEnd`` in from the box's end. Named by what a tap does (收藏 / 取消收藏,
/// what the flows say to it).
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
