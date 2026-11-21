import DesignSystem
import ResonanceKit
import SwiftUI

/// After 共振, which part stayed with the reader (round 27 §U1; the owner: 「在点击共振之后呢，还可以出现一个可能一个 pop
/// ups，然后里面可以让使用者去选择…他文章里面哪一个部分有共鸣」): a centred dialog (``View/organicModal``, never a sheet) —
/// the title 「悄悄告訴作者，哪一段讓你有共鳴」, the card's passages (the author's own sentences, word for word) as banded
/// rows in the story's type, wrapped in full, then 略過 at the foot's end. A press on a row holds its ink and a check,
/// and the dialog closes 300 ms later; the picked row, reopened, rests in that ink and a press on it clears the pick.
/// Only the author learns it. The web's `TapPassages.tsx`, Android's `TapPassages.kt`.
struct TapPassages: View {
    let passages: [TapPassage]
    /// The reader's pick as it stands (the row held in ink with its check).
    let picked: String?
    let script: StoryScript
    /// A press on a row: what it makes the pick (``TapPassageRules/choice(pressing:current:)``).
    let onChoose: (String?) -> Void
    let onSkip: () -> Void
    @Environment(\.window) private var window
    @AccessibilityFocusState private var focused: String?

    var body: some View {
        let ids = passages.map { "passage:\($0.id)" }
        let below = ListBands.below(ids, after: ListBands.endKey)
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Card.Tap.passageTitle).padding(.bottom, 10)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(passages.prefix(TapPassageRules.most).enumerated()), id: \.element.id) { i, passage in
                        row(passage, index: i, top: ids[i], bottom: below[i])
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
            .scrollEdgeFades()
            .frame(maxHeight: TapPassageRules.listHeight(window: window.height))
            .fixedSize(horizontal: false, vertical: true)
            // The rows' 12 a side, pulled back to the dialog's own padding (the taps list's).
            .padding(.horizontal, -12)
            ModalCloseButton(L10n.Card.Tap.passageSkip, action: onSkip)
                .accessibilityIdentifier("tap-passage-skip")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tap-passages")
        .onAppear { focused = picked ?? passages.first?.id }
    }

    private func row(_ passage: TapPassage, index: Int, top: String, bottom: String) -> some View {
        let chosen = passage.id == picked
        let story = StoryTypography(script: script, compact: true)
        return Button { onChoose(TapPassageRules.choice(pressing: passage.id, current: picked)) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                CSSText(passage.text,
                        font: AppFonts.storyUIFont(story.bodyFamily, size: TapPassageRules.textSize, relativeTo: .body),
                        lineHeight: story.bodyLeading, color: Tokens.UI.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if chosen {
                    OrganicIcon(.check, size: TapPassageRules.checkSize, color: Tokens.text, strokeWidth: Tokens.ink)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, ListBands.rowPad)
            .contentShape(Rectangle())
        }
        .buttonStyle(BandWashStyle(top: top, bottom: bottom, cut: true, held: chosen))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(chosen ? .isSelected : [])
        .accessibilityIdentifier("tap-passage-\(index)")
        .accessibilityFocused($focused, equals: passage.id)
    }
}

/// The dialog's rules (§U1), kept apart from the views so the tests can hold them.
nonisolated enum TapPassageRules {
    /// Fewer than this and the card offers none (the server sends none either).
    static let fewest = 2
    /// The most a card offers.
    static let most = 3
    /// From the press that turned 共振 on to the dialog: the segment has filled and the face slid in (150–160 ms).
    static let openDelay: Duration = .milliseconds(240)
    /// A row pressed holds its ink and check this long before the dialog closes.
    static let closeDelay: Duration = .milliseconds(300)
    /// The passages' words: the story's type at 16, with its leading.
    static let textSize: CGFloat = 16
    static let checkSize: CGFloat = 16

    /// Whether these are passages to offer at all.
    static func offers(_ passages: [TapPassage]) -> Bool { passages.count >= fewest }

    /// Whether a press on 共振 opens the dialog: only one that turned it on, on a card with passages, while the story on
    /// screen is the author's own words (never its translation). Taking the tap back opens nothing.
    static func opens(turningOn: Bool, passages: [TapPassage], translated: Bool) -> Bool {
        turningOn && offers(passages) && !translated
    }

    /// What a press on a row makes the pick: that passage — or none, pressing the one already picked.
    static func choice(pressing id: String, current: String?) -> String? { id == current ? nil : id }

    /// How long a delay is under Reduce Motion: none.
    static func delay(_ delay: Duration, reduceMotion: Bool) -> Duration { reduceMotion ? .zero : delay }

    /// The list scrolls inside at most min(420, 55 % of the window's height) — the reader list's cap.
    static func listHeight(window: CGFloat) -> CGFloat { min(420, window * 0.55) }

    /// A pick's request refused: the options changed or the tap went (400, 409) → the dialog closes quietly and the card
    /// is read again; anything else → 「沒送出去，再試一次」, the tap kept on with no passage.
    enum Refusal: Equatable { case readAgain, failed }
    static func refusal(status: Int?) -> Refusal {
        status == 400 || status == 409 ? .readAgain : .failed
    }
}

/// The second line of a who-resonated row (§U2, §U3): the passage the person picked, quoted; or, on a reader's own row
/// when the card offers passages and they picked none, 選一段 in the tonal ink.
nonisolated enum TapRowLine: Equatable {
    case quote(String)
    case pick

    /// The author's list: each person's pick. A reader's list: their own row only — every other row none, whatever
    /// the server sent (it sends none).
    static func of(_ person: TapPerson, authorList: Bool, viewer: String?, offersPassages: Bool) -> TapRowLine? {
        let text = person.passage?.value1.text
        if authorList { return text.map(TapRowLine.quote) }
        guard let viewer, person.author.id == viewer else { return nil }
        if let text { return .quote(text) }
        return offersPassages ? .pick : nil
    }

    /// The words drawn: 「{text}」 / “{text}”, or 選一段.
    var words: String {
        switch self {
        case let .quote(text): L10n.Card.Tap.passageQuote(text: text)
        case .pick: L10n.Card.Tap.passagePick
        }
    }
}
