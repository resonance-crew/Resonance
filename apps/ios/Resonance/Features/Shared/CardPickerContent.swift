import DesignSystem
import ResonanceKit
import SwiftUI

/// InsertCardModal: one of your public cards — dropped into a story as an
/// embedded card, or shared in a conversation. Rows carry a small cover
/// (the card's hue when it has none), the title and when it came out; a tap is the pick.
struct CardPickerContent: View {
    let title: String
    let subtitle: String
    let onPick: (FeedCard) -> Void
    let onCancel: () -> Void
    @Environment(SessionStore.self) private var session
    @State private var cards: [FeedCard]?
    /// The read didn't come back: said so, with 再試一次 (C2) — never "no cards".
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(title).padding(.bottom, 4)
            Text(subtitle).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.bottom, 12)
            CardPickList(cards: cards ?? [], onPick: onPick) {
                EmptyView()
            } empty: {
                if cards != nil {
                    Text(L10n.Write.Editor.CardModal.empty)
                        .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted).padding(.vertical, 12)
                } else if failed {
                    // Why there is nothing to pick, and the way to ask again.
                    HStack(spacing: 10) {
                        Text(L10n.Write.Editor.CardModal.failed).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                        OrganicButton(L10n.Write.Editor.CardModal.retry, variant: .tonal, size: .sm) { Task { await load() } }
                            .fixedSize()
                    }
                    .padding(.horizontal, 6).padding(.vertical, 8)
                } else {
                    // On its way: the rows' shapes where they will land (C2), never "…".
                    CardPickSkeleton(rows: 4)
                }
            }
            // A list to pick from: its one way out, under it at the right.
            ModalCloseButton(L10n.Write.Editor.CardModal.cancel, action: onCancel)
        }
        .task { await load() }
    }

    /// getCardsByAuthor(me, 'published'), public ones only.
    private func load() async {
        failed = false
        do {
            cards = Self.pickable(try await session.reading.cardBox(.published))
        } catch {
            failed = true
        }
    }

    /// What can be picked: the published, public cards.
    static func pickable(_ cards: [FeedCard]) -> [FeedCard] {
        cards.filter { $0.visibility == ._public && $0.publishedAt != nil }
    }
}

/// A card list still on its way (C2): rows shaped as the real ones — a 40 wobbly thumb, a title bar
/// 60 % of the row and a date bar 35 % — in the app's shimmer, the rows' own padding round them.
struct CardPickSkeleton: View {
    var rows = 4

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<rows, id: \.self) { i in
                HStack(spacing: 12) {
                    SkeletonBlock(width: 40, height: 40, radius: 0)
                        .clipShape(HandDrawnThumb.shape(size: 40, seed: Double(i * 7 + 3)))
                    VStack(alignment: .leading, spacing: 8) {
                        SkeletonBlock(fraction: 0.6, height: 14)
                        SkeletonBlock(fraction: 0.35, height: 11)
                    }
                }
                .padding(.vertical, 10).padding(.horizontal, 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(L10n.Home.moreLoading)
        .skeletonTimeline()
    }
}

/// The author's own cards as a list to pick from (CardPickList.tsx), quiet enough to scan: on each
/// row a 40pt cover thumb (the card's hue when it has none), the title on one line and one muted
/// line under it — when it came out, led by 匿名 for an anonymous card (`anonymousLabel`). No rule
/// between rows (the one wavy rule parts the lead from them) and no boxed press region. What comes first
/// (`lead`) scrolls with the rows; `empty` stands in for rows when there are none, and `footnote`
/// is a quiet line under them (why some cards aren't listed).
///
/// As a choice (`choosing`, named `label` for VoiceOver), a tap marks a row instead of being the
/// pick — its cover washed in the accent with a cream tick, its title in the deep accent — so the pick
/// reads before the modal's verb confirms it (VoiceOver hears which is chosen). `disabled` rests
/// the rows while a request is on its way (the chosen one stays as it was).
struct CardPickList<Lead: View, Empty: View>: View {
    let cards: [FeedCard]
    var choosing = false
    var selectedId: String?
    var disabled = false
    var label: String?
    var anonymousLabel: String?
    var footnote: String?
    let onPick: (FeedCard) -> Void
    @ViewBuilder let lead: Lead
    @ViewBuilder let empty: Empty
    @Environment(\.window) private var window

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                lead
                if cards.isEmpty {
                    empty
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        // One wavy rule parts the way to write from the cards (the lead's); the rows
                        // themselves need none — their thumbs and titles line them up.
                        ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                            row(card, at: i)
                        }
                    }
                    // As a choice, its rows are one group, named by the modal's title.
                    .modifier(ChoiceGroup(label: choosing ? label : nil))
                }
                if let footnote {
                    Text(footnote)
                        .font(AppFonts.body(12.5)).foregroundStyle(Tokens.textMuted)
                        .lineSpacing(12.5 * 0.4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 6).padding(.top, 10).padding(.bottom, 2)
                }
            }
            // Room inside the scroll for a row's focus ring (an iPad's keyboard), which the scroll's edges
            // would otherwise cut (C2); the scroll reaches as far out, so the rows keep their place.
            .padding(Self.ringRoom)
        }
        // Its ends fade while there is more that way (the web's useEdgeFades).
        .scrollEdgeFades()
        .frame(maxHeight: window.height * 0.5 + 2 * Self.ringRoom)
        .fixedSize(horizontal: false, vertical: true)
        .scrollIndicators(.hidden)
        .padding(-Self.ringRoom)
        .padding(.bottom, choosing ? 18 : 0)
    }

    /// How far a focus ring reaches past a row: the room the list keeps inside its scroll.
    static var ringRoom: CGFloat { 6 }

    /// A row's muted line: when the card came out (「10月5日」/ "Oct 5", the year too before this
    /// one), led by 「匿名 · 」/ "Anonymous · " for an anonymous card when the list marks them.
    static func meta(_ card: FeedCard, anonymousLabel: String?, now: Date = .now,
                     language: Strings.Language = Strings.shared.language) -> String {
        let locale = Locale(identifier: language == .zhTW ? "zh-Hant-TW" : "en")
        let date = card.publishedAt.flatMap(ISO8601.date).map { day in
            let thisYear = Calendar.current.component(.year, from: day) == Calendar.current.component(.year, from: now)
            return thisYear
                ? day.formatted(Date.FormatStyle(locale: locale).month(.abbreviated).day())
                : day.formatted(Date.FormatStyle(locale: locale).year().month(.abbreviated).day())
        }
        return [card.anonymous ? anonymousLabel : nil, date].compactMap { $0 }.joined(separator: " · ")
    }

    private func row(_ card: FeedCard, at i: Int) -> some View {
        let chosen = choosing && card.id == selectedId
        let meta = Self.meta(card, anonymousLabel: anonymousLabel)
        return Button { onPick(card) } label: {
            HStack(spacing: 12) {
                // The avatar's shape at a smaller radius (design §6); chosen, washed in the accent with the grain and a tick.
                HandDrawnThumb(url: card.imageUrl.flatMap(URL.init(string:)), fill: OKLCHColor.color(0.9, 0.06, card.accentHue ?? 55),
                               size: 40, seed: Double(i * 7 + 3), chosen: chosen)
                VStack(alignment: .leading, spacing: 3) {
                    // One line: a long title ends in an ellipsis rather than making its row taller.
                    Text(card.title).font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(chosen ? Tokens.buttonOnTonal : Tokens.text)
                        .lineLimit(1).truncationMode(.tail)
                    if !meta.isEmpty {
                        Text(meta).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                            .lineLimit(1).truncationMode(.tail)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10).padding(.horizontal, 6)
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.18), value: chosen)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled && !chosen ? 0.5 : 1)
        // Named by its title, described by its line.
        .accessibilityLabel(card.title)
        .accessibilityValue(meta)
        .accessibilityAddTraits(choosing && chosen ? .isSelected : [])
    }
}

/// A choice's rows as one group VoiceOver names (the web's radiogroup `aria-label`).
private struct ChoiceGroup: ViewModifier {
    let label: String?

    func body(content: Content) -> some View {
        if let label {
            content.accessibilityElement(children: .contain).accessibilityLabel(label)
        } else {
            content
        }
    }
}
