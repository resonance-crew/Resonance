import DesignSystem
import Foundation
import Observation
import ResonanceAPI
import ResonanceKit
import SwiftUI

// Translating a story (round 25 §F, the reader's side; the owner: 「使用者可以自动翻译文章，就有点像 Facebook 和推特的功能，
// 它会翻译成使用者界面的目标语言…我想请你先预设关闭…页面上也可以有一个按钮可以来翻译」).

/// Which stories the card page offers to translate, and into what — src/lib/text/translation.ts over the app's own
/// script rule (``ScriptRule``): a Chinese story into English, a Latin-script one into 繁體中文, a Japanese or Korean
/// one into either; nothing for a story in no script we can name.
nonisolated enum StoryTranslationRule {
    /// The longest story the page offers to translate (UTF-16 units, as JavaScript counts them).
    static let maxChars = 30_000

    static func targets(title: String, story: String) -> [Strings.Language] {
        switch ScriptRule.storyType(title: title, story: story, fallback: .cjk).lang {
        case "zh-TW": [.en]
        case "en": [.zhTW]
        case "ja", "ko": [.en, .zhTW]
        default: []
        }
    }

    /// Whether the card page draws the translate line (§F3): a published, public story (named or anonymous), not
    /// the reader's own, not in the trash, at most 30 000 characters, whose words are in another language than the
    /// interface's.
    static func offers(published: Bool, isPublic: Bool, trashed: Bool, isOwner: Bool, title: String, story: String,
                       interface: Strings.Language) -> Bool {
        guard published, isPublic, !trashed, !isOwner, story.utf16.count <= maxChars else { return false }
        return targets(title: title, story: story).contains(interface)
    }

    static func offers(_ detail: CardDetail, interface: Strings.Language) -> Bool {
        let card = detail.card
        return offers(published: card.publishedAt != nil, isPublic: card.visibility == ._public, trashed: card.trashedAt != nil,
                      isOwner: detail.isOwner, title: card.title, story: detail.story, interface: interface)
    }

    /// A feed card's title and excerpt as the reader sees them (§F7): translated into the interface's language when
    /// the switch is on, the card isn't the reader's own and the server sent a translation for that language; nil
    /// leaves the card as written.
    static func summary(_ card: FeedCard, on: Bool, interface: Strings.Language, viewer: String?) -> (title: String, excerpt: String)? {
        guard on, let set = card.summaryTranslations?.value1 else { return nil }
        if let viewer, card.author?.value1.id == viewer { return nil }
        guard let t = interface == .zhTW ? set.zhTW : set.en, !t.title.isEmpty else { return nil }
        return (t.title, t.excerpt)
    }
}

/// 自動翻譯 (Settings → 語言, §F4): off until the reader turns it on, kept on this device only (no account field).
/// One switch for the card page and the feed's cards.
@MainActor @Observable final class TranslationSettings {
    static let shared = TranslationSettings()
    static let key = "autoTranslateStories"

    private(set) var autoTranslate: Bool
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        autoTranslate = defaults.bool(forKey: Self.key)
    }

    func setAutoTranslate(_ on: Bool) {
        autoTranslate = on
        defaults.set(on, forKey: Self.key)
    }
}

/// One card page's translation (§F2, §F4): asked for by a tap on the line or, with 自動翻譯 on, as the page opens;
/// shown in place of the title and story (nothing else on the page changes), or the original again. 顯示原文 keeps
/// the card original for the rest of the visit.
@MainActor @Observable final class StoryTranslator {
    enum Phase: Equatable {
        /// 翻譯成中文 / Translate to English.
        case idle
        /// 翻譯中⋯
        case working
        /// The translation is showing: 已由 AI 翻譯 · 顯示原文.
        case shown
        /// The original again, the translation kept: 顯示翻譯.
        case original
        /// 沒有翻好，再試一次.
        case failed
        /// 今天的翻譯次數用完了.
        case spent
    }

    private(set) var phase: Phase = .idle
    /// The translation as the page draws it, once it came.
    private(set) var title: String?
    private(set) var story: CardModel.ReadStory?
    /// The card's passages as the translation says them (round 31 §R): nil when the answer placed none.
    private(set) var passages: [TapPassage]?
    /// The reader chose the original (顯示原文): an automatic translation never swaps in again this visit.
    private(set) var keptOriginal = false

    let key: String
    let language: Strings.Language
    @ObservationIgnored private let fetch: @Sendable (String, Strings.Language) async throws -> CardTranslation

    init(key: String, language: Strings.Language,
         fetch: @escaping @Sendable (String, Strings.Language) async throws -> CardTranslation) {
        self.key = key
        self.language = language
        self.fetch = fetch
    }

    var showing: Bool { phase == .shown && story != nil }

    /// Asks for the translation (a tap on 翻譯成中文 or 再試一次, or the page opening with 自動翻譯 on). When it
    /// comes, `inView` says whether the line is on screen: then it swaps in; otherwise nothing moves and `ready` is
    /// called (the page's toast: 譯文好了 · 看譯文), the line offering 顯示翻譯.
    func request(inView: @escaping () -> Bool = { true }, ready: @escaping () -> Void = {}) async {
        guard phase != .working, phase != .spent else { return }
        if story != nil { show(); return }
        phase = .working
        do {
            let answer = try await fetch(key, language)
            let title = answer.title, text = answer.story
            let read = await Task.detached(priority: .userInitiated) { CardModel.read(title: title, story: text) }.value
            self.title = title
            passages = answer.passages
            story = read
            // The page went while the model answered (its request task cancelled): the translation is kept for a
            // return, but nothing swaps in, is announced or offered over another screen.
            if Task.isCancelled {
                phase = .original
            } else if inView() && !keptOriginal {
                show()
            } else {
                phase = .original
                if !keptOriginal { ready() }
            }
        } catch let failure as APIFailure where failure.status == 429 {
            phase = .spent
        } catch {
            // Cut short because the page went: the line offers to translate again, not 再試一次.
            phase = Task.isCancelled ? .idle : .failed
        }
    }

    /// 顯示翻譯 (or the toast's 看譯文).
    func show() {
        guard story != nil else { return }
        phase = .shown
        AccessibilityNotification.Announcement(L10n.Card.Translate.announce).post()
    }

    /// 顯示原文: the original for the rest of the visit, unless the reader asks for the translation again.
    func showOriginal() {
        guard story != nil else { return }
        keptOriginal = true
        phase = .original
    }

    /// What the line says in each phase: the glyph leading it, its plain words in the meta ink, and the control's
    /// words in the links' accent ink (no full stops, both languages).
    struct Line: Equatable {
        enum Lead: Equatable { case globe, loader, none }
        var lead: Lead
        var words: String?
        var control: String?
    }

    nonisolated static func line(_ phase: Phase, language: Strings.Language = Strings.shared.language) -> Line {
        switch phase {
        case .idle: Line(lead: .globe, words: nil, control: L10n.Card.Translate.action)
        case .working: Line(lead: .loader, words: L10n.Card.Translate.working, control: nil)
        case .shown: Line(lead: .globe, words: "\(L10n.Card.Translate.done) · ", control: L10n.Card.Translate.showOriginal)
        case .original: Line(lead: .globe, words: nil, control: L10n.Card.Translate.showTranslation)
        case .failed:
            // 「沒有翻好，再試一次」 / "Couldn’t translate, try again": the control runs on in the sentence.
            Line(lead: .globe, words: L10n.Card.Translate.failed + (language == .zhTW ? "，" : ", "),
                 control: language == .zhTW ? L10n.Card.Translate.retry : L10n.Card.Translate.retry.lowercasedFirst)
        case .spent: Line(lead: .globe, words: L10n.Card.Translate.spent, control: nil)
        }
    }
}

private extension String {
    nonisolated var lowercasedFirst: String { prefix(1).lowercased() + dropFirst() }
}

/// The translate line (§F2): a row of its own at the story's start column, under the byline, in the meta line's
/// type — about 20 tall to the eye, 44 to the touch (its pad overlaps the gaps above and below). The idle line leads
/// with the globe at 16; while working, the small in-button loader stands in its place. Its control never wraps
/// inside itself; at large type the row wraps between its two parts.
struct TranslateLine: View {
    let translator: StoryTranslator
    let metaSize: CGFloat
    let act: () -> Void

    var body: some View {
        let line = StoryTranslator.line(translator.phase)
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 6) { lead(line); words(line); control(line) }
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .center, spacing: 6) { lead(line); words(line) }
                control(line)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 20)
        .animation(.easeOut(duration: 0.16), value: translator.phase)
    }

    @ViewBuilder private func lead(_ line: StoryTranslator.Line) -> some View {
        switch line.lead {
        case .globe: OrganicIcon(.globe, size: 16, color: Tokens.textMuted, strokeWidth: Tokens.inkLight).accessibilityHidden(true)
        case .loader: ButtonLoader(size: 16, color: Tokens.textMuted).accessibilityHidden(true)
        case .none: EmptyView()
        }
    }

    @ViewBuilder private func words(_ line: StoryTranslator.Line) -> some View {
        if let words = line.words {
            Text(words)
                .font(AppFonts.body(metaSize))
                .foregroundStyle(Tokens.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private func control(_ line: StoryTranslator.Line) -> some View {
        if let control = line.control {
            Button(action: act) {
                Text(control)
                    .font(AppFonts.body(metaSize, weight: .semibold))
                    .foregroundStyle(Tokens.buttonOnTonal)
                    .lineLimit(1)
                    .fixedSize()
                    // 44 to the touch, the row still about 20 tall: the pad reaches into the gaps round it.
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .padding(.vertical, -12)
            }
            .buttonStyle(.plain)
        }
    }
}

/// The translation and the original crossfade in one slot (round 25 §F2): while the outgoing copy fades it still
/// lays itself out, so only the copy that matches what the translator shows writes the page's measures.
enum StoryCrossfade {
    static func measures(translatedCopy: Bool, showing: Bool) -> Bool { translatedCopy == showing }
}

/// Where the reader was in the story when the toast's 看譯文 swapped it: a share of the story's height. With the
/// crossfade it is held `untilSettled` — every frame of the swap scrolls back to it, and the page lets go once the
/// original has gone; without (Reduce Motion), the first measure of the translated story is the settled one.
struct KeptPlace: Equatable {
    let share: CGFloat
    let untilSettled: Bool

    static func at(story: CGRect, visibleTop: CGFloat, untilSettled: Bool) -> KeptPlace? {
        guard story.height > 0 else { return nil }
        return KeptPlace(share: min(max((visibleTop - story.minY) / story.height, 0), 1), untilSettled: untilSettled)
    }

    /// The scroll offset that puts the same share of `story` under the bar; none before the story is measured.
    func offset(story: CGRect, insetTop: CGFloat) -> CGFloat? {
        guard story.height > 0 else { return nil }
        return max(0, story.minY + share * story.height - insetTop)
    }
}
