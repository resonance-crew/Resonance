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
    /// The dialog clips to its paper (CardEndRow opens it so): the rows' ink runs to the paper's edges.
    @Environment(\.modalPaperClips) private var paperClips
    @AccessibilityFocusState private var focused: String?

    var body: some View {
        let ids = passages.map { "passage:\($0.id)" }
        let below = ListBands.below(ids, after: ListBands.endKey)
        let reach = TapPassageRules.reach(clipped: paperClips)
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Card.Tap.passageTitle).padding(.bottom, 10)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(passages.prefix(TapPassageRules.most).enumerated()), id: \.element.id) { i, passage in
                        row(passage, index: i, top: ids[i], bottom: below[i], reach: reach)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
            .scrollEdgeFades()
            .frame(maxHeight: TapPassageRules.listHeight(window: window.height))
            .fixedSize(horizontal: false, vertical: true)
            // Out to the paper's edges and past them by the wobble's swing (``TapPassageRules/reach(clipped:)``): the
            // rows' bands run edge to edge, clipped to the paper; their words keep the dialog's own inset.
            .padding(.horizontal, -reach)
            ModalCloseButton(L10n.Card.Tap.passageSkip, action: onSkip)
                .accessibilityIdentifier("tap-passage-skip")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("tap-passages")
        .onAppear { focused = picked ?? passages.first?.id }
    }

    private func row(_ passage: TapPassage, index: Int, top: String, bottom: String, reach: CGFloat) -> some View {
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
            .padding(.horizontal, reach)
            .padding(.vertical, ListBands.rowPad)
            // Pressed on the paper only: what reaches past its frame is clipped from sight, and is the backdrop's.
            .contentShape(SidesIn(by: TapPassageRules.overhang(reach: reach)))
        }
        .buttonStyle(BandWashStyle(top: top, bottom: bottom, cut: TapPassageRules.bandCut(clipped: paperClips),
                                   held: chosen))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(chosen ? .isSelected : [])
        .accessibilityIdentifier("tap-passage-\(index)")
        .accessibilityFocused($focused, equals: passage.id)
    }
}

/// A row's frame less `by` on the left and the right: the part of it on the paper.
private nonisolated struct SidesIn: Shape {
    let by: CGFloat
    func path(in rect: CGRect) -> Path { Path(rect.insetBy(dx: min(by, rect.width / 2), dy: 0)) }
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
    /// screen is the author's own words or a translation that says them (round 31 §R1; `translated`: a translation that
    /// says fewer than two of them). Taking the tap back opens nothing.
    static func opens(turningOn: Bool, passages: [TapPassage], translated: Bool) -> Bool {
        turningOn && offers(passages) && !translated
    }

    /// What a press on a row makes the pick: that passage — or none, pressing the one already picked.
    static func choice(pressing id: String, current: String?) -> String? { id == current ? nil : id }

    /// The dialog takes one press (the web's `if (chosen) return`): from the first to the close 300 ms later, every other
    /// press is ignored — a double tap would otherwise clear the pick it just made, and two quick presses send two
    /// unordered requests. Taken again when the dialog opens.
    struct OnePress: Equatable {
        private(set) var taken = false
        /// Whether this press counts: the first since the dialog opened.
        mutating func take() -> Bool {
            if taken { return false }
            taken = true
            return true
        }
        mutating func reopen() { taken = false }
    }

    /// How long a delay is under Reduce Motion: none.
    static func delay(_ delay: Duration, reduceMotion: Bool) -> Duration { reduceMotion ? .zero : delay }

    /// How far a row reaches past the dialog's content on each side. In a dialog clipped to its paper (round 27, the
    /// owner: 「这个选中的区块是延伸到这个 pop up 这个卡片的最左边和最右边的」): the paper's frame (``ModalPaper/inset``)
    /// and the wobble's swing past it (``ModalPaper/bleed``) — the band edge to edge, as the web's. Anywhere else the
    /// first captures' 12, its band cut and rounded inside the paper.
    static func reach(clipped: Bool) -> CGFloat { clipped ? ModalPaper.inset + ModalPaper.bleed : 12 }
    /// A row's band is cut at its frame's sides only where it cannot reach the paper's edges.
    static func bandCut(clipped: Bool) -> Bool { !clipped }
    /// What of a row stands past the paper's frame, a side (none when it stays inside).
    static func overhang(reach: CGFloat) -> CGFloat { max(0, reach - ModalPaper.inset) }

    /// The list scrolls inside at most min(560, 70 % of the window's height) (Wave 2 #3a: passages of 2–3 whole
    /// sentences, ~100 characters each, wrapped in full — the web's cap too).
    static func listHeight(window: CGFloat) -> CGFloat { min(560, window * 0.7) }

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

    /// The author's list: each person's pick. A reader's list (Wave 2 #3b: everyone who resonated): every other row
    /// the pick the server sent for it, the reader's own as the page holds it.
    static func of(_ person: TapPerson, authorList: Bool, viewer: String?, offersPassages: Bool,
                   pagePick: PagePick? = nil) -> TapRowLine? {
        let listed = person.passage?.value1.text
        if authorList { return listed.map(TapRowLine.quote) }
        guard let viewer, person.author.id == viewer else { return listed.flatMap { $0.isEmpty ? nil : .quote($0) } }
        // On a card offering passages the page knows the reader's pick before the list does (the list may have been
        // read while the pick's request was still on its way): the own row says the page's, as the web's.
        let text = offersPassages && pagePick != nil ? pagePick?.text : listed
        if let text, !text.isEmpty { return .quote(text) }
        return offersPassages ? .pick : nil
    }

    /// The reader's pick as the card page holds it now (its words, or nil for none): what their own row says (§U3).
    struct PagePick: Equatable {
        let text: String?
    }

    /// The words drawn: 「{text}」 / “{text}”, or 選一段.
    var words: String {
        switch self {
        case let .quote(text): L10n.Card.Tap.passageQuote(text: text)
        case .pick: L10n.Card.Tap.passagePick
        }
    }
}
