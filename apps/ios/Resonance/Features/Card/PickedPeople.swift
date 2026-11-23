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
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @Environment(\.openRoute) private var openRoute
    @State private var people: TapPeople?

    /// The sentence a dialog is about: its pick's id and its words.
    struct Passage: Equatable, Identifiable {
        let id: String
        let text: String
    }

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
            if let people {
                ScrollView {
                    TapRows(people: people.people, line: Self.line(for:)) { person in
                        onClose()
                        openRoute(Self.route(for: person))
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
                .frame(maxHeight: min(420, window.height * 0.5))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, -12)
            }
            ModalCloseButton(L10n.Native.close, action: onClose)
                // The flows' way out (maestro/flows/tap-picked.yaml): the backdrop is named 關閉 too.
                .accessibilityIdentifier("tap-picked-close")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tap-picked")
        .task(id: passage.id) {
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
    /// sentence with no one left to show is none).
    static func passages(_ tap: CardTap?, language: Strings.Language = Strings.shared.language) -> [StoryPassageMarks.Passage] {
        (tap?.picked ?? []).filter { !$0.people.isEmpty }.map { picked in
            StoryPassageMarks.Passage(id: picked.id, text: picked.text, faces: picked.people.prefix(FaceStack.maxFaces).map(TapFaces.face),
                                      spoken: spoken(picked.people, more: picked.more, language: language))
        }
    }

    /// Whether the page washes its story (§U1; Wave 2 #3b: 「像按讚一樣大家都可以看到誰按」 — readers too, whatever the
    /// server sends in `picked`): a published card readers have (never a draft or a private card), not in the trash,
    /// read in its own words (never a translation).
    static func washes(_ detail: CardDetail, trashed: Bool, translated: Bool) -> Bool {
        let card = detail.card
        return !trashed && !translated && detail.tap != nil && card.publishedAt != nil && card.visibility != ._private
            && card.trashedAt == nil
    }
}
