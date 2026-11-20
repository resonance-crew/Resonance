import DesignSystem
import ResonanceKit
import SwiftUI

/// Writing a card that answers another (round 26 §U6; the owner: 「想請你幫忙改一下現在的界面，然後也完善這些功能」): the
/// writer shows nothing of the story being answered otherwise — the app has no side panel for it at any width — so a
/// 44 row stands over the title: the original's cover at 36 and 「回應〈一場雨後的散步〉」, one line. A tap opens the
/// original in a centred dialog, to read it again while writing; nothing floats over the writing. Nothing at all while
/// the original isn't known (still being read, gone, hidden from the writer since, or read offline with nothing kept),
/// as on Android: no room, nothing for VoiceOver to land on.
struct ReplyingBand: View {
    let cardId: String
    @Environment(SessionStore.self) private var session
    @State private var card: FeedCard?
    @State private var reading = false

    static let height: CGFloat = 44
    static let cover: CGFloat = 36
    /// The air between the band and the title under it.
    static let gap: CGFloat = 12
    /// The original's words beside its cover.
    static func label(title: String) -> String { L10n.Card.replying(title: title) }

    var body: some View {
        // Something to hang the read and the dialog on that takes no room: the band itself only once it can name the original.
        ZStack(alignment: .topLeading) {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            ReplyingBandRow(card: card, seed: Double(seedFromString(cardId))) { reading = true }
        }
        .organicModal(isPresented: $reading, seed: 43, maxWidth: 560, closeLabel: L10n.Native.close) {
            OriginalCardContent(cardId: cardId) { reading = false }.withSession(session)
        }
        .task(id: cardId) {
            if let kept = session.cardPreviews.card(for: cardId) { card = kept }
            if let read = try? await session.reading.cards(keys: [cardId]).first { card = read }
        }
    }

    /// The title the band names the original by: none for a card not known, or with no title to name.
    static func title(of card: FeedCard?) -> String? {
        guard let title = card?.title.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }
        return title
    }

    /// A cover-less original's tile: its own hue, as the card pickers' tiles wear it.
    static func hueFill(_ hue: Double?) -> Color {
        Palette.hue(.accent, hue ?? 55)
    }
}

/// The band as the writer shows it: the original's face, a button that opens it, and the gap down to the title — or
/// nothing while the original can't be named (``ReplyingBand/title(of:)``).
struct ReplyingBandRow: View {
    let card: FeedCard?
    let seed: Double
    let open: () -> Void

    var body: some View {
        if let card, let title = ReplyingBand.title(of: card) {
            Button(action: open) {
                ReplyingBandLabel(title: title, cover: card.listCoverURL, hue: card.accentHue, seed: seed)
            }
            .buttonStyle(OrganicPressStyle(inset: -4))
            .accessibilityLabel(ReplyingBand.label(title: title))
            .accessibilityIdentifier("replying-band")
            .padding(.bottom, ReplyingBand.gap)
        }
    }
}

/// The band's face: the original's cover at 36 (its hue without one) and 「回應〈…〉」 in one muted line, 44 tall.
struct ReplyingBandLabel: View {
    let title: String
    let cover: URL?
    let hue: Double?
    let seed: Double

    var body: some View {
        HStack(spacing: 10) {
            HandDrawnThumb(url: cover, fill: ReplyingBand.hueFill(hue), size: ReplyingBand.cover, seed: seed)
            Text(ReplyingBand.label(title: title))
                .font(AppFonts.body(14))
                .foregroundStyle(Tokens.textMuted)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: ReplyingBand.height)
        .contentShape(Rectangle())
    }
}

/// The card being answered, to read while writing: its title in the story's type, its author, and its story,
/// scrolling inside the dialog; then the dialog's close.
private struct OriginalCardContent: View {
    let cardId: String
    let onClose: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window
    @State private var model: CardModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let model, model.phase == .loaded, let detail = model.detail {
                let typography = StoryTypography(script: model.storyType.script, compact: true)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        StoryTitle(detail.card.title, typography: typography, lang: model.storyType.lang)
                            .padding(.bottom, 10)
                        StoryBylineRow(card: detail.card, anonymous: detail.anonymous, avatar: 32)
                            .padding(.bottom, 18)
                        StoryMarkdownView(blocks: model.blocks, typography: typography, language: model.storyType.lang,
                                          onOpenURL: { _ in }, embed: { _, _ -> EmptyView? in nil })
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollIndicators(.hidden)
                .scrollEdgeFades()
                .frame(maxHeight: window.height * 0.66)
                .fixedSize(horizontal: false, vertical: true)
            } else if model?.phase == .notFound {
                ModalBody(L10n.Card.NotFound.title)
            } else if case .failed = model?.phase {
                ModalError(L10n.Native.loadError)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonBlock(fraction: 0.8, height: 22)
                    SkeletonBlock(height: 15)
                    SkeletonBlock(height: 15)
                    SkeletonBlock(fraction: 0.6, height: 15)
                }
                .skeletonTimeline()
            }
            ModalCloseButton(L10n.Native.close, action: onClose)
        }
        .task {
            let made = CardModel(key: cardId, api: session.reading, origin: session.config.origin)
            model = made
            await made.load()
        }
    }
}
