import DesignSystem
import ResonanceKit
import SwiftUI

/// Who resonated with one sentence (round 29 §S4; the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句。那作者的話
/// 他可能就可以多看一下那一個人回覆的小紙條」, 「只列這一段的人」): on a card's page — the author's, and since Wave 2 #3b a
/// reader's too (each row then has no note and leads to the person's profile) —, pressing a picked sentence's faces
/// or its wash opens this centred dialog — the who-resonated dialog's shell and widths (400 on a phone, 480 on a tablet
/// and the Mac) — with the title, the sentence once in the story's type at 16 × the reading text size on the story's
/// compact leading (1.8 CJK, 1.6 Latin, §S12: the web's and Android's), muted, in full, then the people who picked that
/// sentence, newest first, as the author's list draws a row (a face of 36, the pen name, the note's excerpt when they
/// left one) without the quote under each name (it is the head); 顯示更多; the small 關閉. The author's own list at
/// the story's end is not changed.
struct PickedPeople: View {
    let cardId: String
    let passage: Passage
    /// The story's script: the sentence is set in its body face and compact leading.
    let script: StoryScript
    /// The people as the page asked for them at the press (read, or still on their way): taken as they are, never
    /// asked for twice.
    var preloaded: TapPeople?
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?
    /// The list drawn: the one read here, or from the first frame the page's (`preloaded`) — already read, it is drawn
    /// in the dialog's first layout, never a frame of loading rows before it.
    private var list: TapPeople? { people ?? preloaded }

    /// The sentence a dialog is about: its pick's id and its words — and, from the page's marks, how many picked it
    /// (`people`, the faces the server sent with it) and whether there are more than those (`more`).
    struct Passage: Equatable, Identifiable {
        let id: String
        let text: String
        var people: Int = 0
        var more = false
    }

    /// The sentence `id` as the author's answer marks it: its words, and who picked it as far as the marks know.
    static func passage(_ tap: CardTap?, id: String, text: String) -> Passage {
        let picked = tap?.picked?.first { $0.id == id }
        return Passage(id: id, text: text, people: picked?.people.count ?? 0, more: picked?.more ?? false)
    }

    /// How many rows stand in for the people while they are read (round 32 §P3, the owner: 「先跳出一个很高的弹窗，再
    /// 根据内容缩回实际高度」): as many as the marks say picked the sentence, so the dialog opens at the height the
    /// rows will take (a row of a name alone is 60, as a loading row) — not always two, which made a dialog of one
    /// person open a row too tall and shrink, one of three grow. As many as the faces the marks draw (three at most),
    /// with more behind them too — the web's and Android's count (post-merge review); never none.
    static func loadingRows(_ passage: Passage, cap: CGFloat) -> Int {
        max(1, min(passage.people, FaceStack.maxFaces))
    }

    /// How long a press waits for the first page before the dialog opens without it (the web's 300 ms).
    static let firstPageWait: Duration = .milliseconds(300)

    /// The list's cap: at most 420, and half the window.
    static func listCap(window: CGFloat) -> CGFloat { min(420, window * 0.5) }

    /// The dialog's width: a phone's 400, a tablet's and the Mac's 480 (the reader's list's, ``TapListMetrics``).
    static func width(compact: Bool) -> CGFloat { TapListMetrics.readerWidth(compact: compact) }

    /// The sentence's face (§S12): the story's body face for `script` at 16 × the reading text scale, as the round 27
    /// passages dialog sets its rows.
    static func sentenceFont(script: StoryScript) -> UIFont {
        AppFonts.storyUIFont(StoryTypography(script: script, compact: true).bodyFamily, size: sentenceSize, relativeTo: .body)
    }

    /// The sentence's leading: the story's compact one (1.8 for a CJK story, 1.6 for a Latin one), at every width.
    static func sentenceLeading(script: StoryScript) -> CGFloat { StoryTypography(script: script, compact: true).bodyLeading }

    /// The sentence's size at 1× (the web's 16px, Android's 16sp).
    static let sentenceSize: CGFloat = 16

    /// No quote under a name: the sentence is the dialog's head.
    static func line(for person: TapPerson) -> TapRowLine? { nil }

    /// A row leads where the same person's row in the author's list leads.
    static func route(for person: TapPerson) -> Route { TapPersonRow.route(for: person) }

    /// The pages of who picked `passage`, newest first (GET /cards/{id}/taps?passage=).
    static func people(cardId: String, passage: String, api: ReadingAPI) -> TapPeople {
        TapPeople { try await api.taps(cardId, pageToken: $0, passage: passage) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Card.Tap.pickedTitle).padding(.bottom, 10)
            CSSText(L10n.Card.Tap.passageQuote(text: passage.text), font: Self.sentenceFont(script: script),
                    lineHeight: Self.sentenceLeading(script: script), color: Tokens.UI.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 12)
                .accessibilityIdentifier("tap-picked-passage")
            // The list from the first frame (§P3): while the people are read — before the read has even begun — the rows
            // the marks promise stand in their place, so nothing appears later that changes the dialog's height.
            let cap = Self.listCap(window: window.height)
            ScrollView {
                if let people = list {
                    TapRows(people: people.people, line: Self.line(for:)) { person in
                        onClose()
                        openRoute(Self.route(for: person))
                    }
                }
                TapListState(people: list, loadingRows: Self.loadingRows(passage, cap: cap))
                if let people = list, people.next != nil {
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
            .frame(maxHeight: cap)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, -12)
            ModalCloseButton(L10n.Native.close, action: onClose)
                // The flows' way out (maestro/flows/tap-picked.yaml): the backdrop is named 關閉 too.
                .accessibilityIdentifier("tap-picked-close")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tap-picked")
        .task(id: passage.id) {
            if let preloaded {
                people = preloaded
                return
            }
            let made = Self.people(cardId: cardId, passage: passage.id, api: session.reading)
            people = made
            await made.load()
        }
    }
}

// MARK: - The author's picked sentences, for the story

extension PickedPeople {
    /// What a screen reader hears for a sentence's faces: 「gus、bob對這一段有共鳴」, with 等人 when there are more — the
    /// names shown, never a count.
    static func spoken(_ people: [Author], more: Bool, language: Strings.Language = Strings.shared.language) -> String {
        let names = people.prefix(FaceStack.maxFaces).map(\.handle).joined(separator: language == .zhTW ? "、" : ", ")
        return more ? L10n.Card.Tap.pickedByMore(names: names) : L10n.Card.Tap.pickedBy(names: names)
    }

    /// The author's answer's picked sentences as the story washes them (§U1: only the author's tap carries any; a
    /// sentence with no one left to show is none). `words`: the translation's pieces while it shows (round 31 §R2,
    /// ``TranslatedPassages``) — each sentence in its piece's words, one the translation lacks left out.
    static func passages(_ tap: CardTap?, words: [TapPassage]? = nil,
                         language: Strings.Language = Strings.shared.language) -> [StoryPassageMarks.Passage] {
        TranslatedPassages.picked(tap?.picked ?? [], words: words).filter { !$0.people.isEmpty }.map { picked in
            StoryPassageMarks.Passage(id: picked.id, text: picked.text, faces: picked.people.prefix(FaceStack.maxFaces).map(TapFaces.face),
                                      spoken: spoken(picked.people, more: picked.more, language: language))
        }
    }

    /// Whether the page washes its story (§U1; Wave 2 #3b: 「像按讚一樣大家都可以看到誰按」 — readers too, whatever the
    /// server sends in `picked`): a published card readers have (never a draft or a private card), not in the trash,
    /// read in its own words — or, since round 31 §R2, in a translation that says its passages (`translated`: one that
    /// says none).
    static func washes(_ detail: CardDetail, trashed: Bool, translated: Bool) -> Bool {
        let card = detail.card
        return !trashed && !translated && detail.tap != nil && card.publishedAt != nil && card.visibility != ._private
            && card.trashedAt == nil
    }
}
