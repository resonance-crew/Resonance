import DesignSystem
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A skeleton stands where the words that replace it will (the owner, at a large text size: 「私訊頁面的
/// skeleton 和實際位置不一樣」): each loading list or head is as tall as the real one it stands for — measured
/// here at the default text size with Chinese words, in a Chinese interface's skeleton lines.
@MainActor @Suite struct SkeletonPlacesTests {
    func height<V: View>(_ view: V, width: CGFloat = 390, han: Bool = true) -> CGFloat {
        let root = view.frame(width: width).environment(\.skeletonHan, han)
        return UIHostingController(rootView: root).sizeThatFits(in: CGSize(width: width, height: 4000)).height
    }

    /// Within a hair: the two are laid out by different views, rounded to the pixel each.
    func same(_ skeleton: CGFloat, _ real: CGFloat, _ what: Comment) {
        #expect(abs(skeleton - real) < 0.75, "\(what): skeleton \(skeleton), real \(real)")
    }

    @Test func aSkeletonLineIsAsTallAsALineOfItsWords() {
        for size in [11.0, 12, 12.5, 13, 14, 15] as [CGFloat] {
            let line = height(SkeletonLine(font: AppFonts.body(size)) { SkeletonBlock(height: size) })
            let words = height(Text(verbatim: "小島在下午三點寫了 3 張卡").font(AppFonts.body(size)).lineLimit(1))
            same(line, words, "DM Sans \(size)")
        }
        let name = height(SkeletonLine(font: AppFonts.heading(24)) { SkeletonBlock(height: 24) })
        same(name, height(Text(verbatim: "海邊的小島").font(AppFonts.heading(24))), "Playfair 24")
    }

    @Test func aLoadingFeedCardIsAsTallAsATypicalCard() {
        let content = StoryCardContent(
            id: "c1", title: "海邊的小屋在第一場雨之後，慢慢醒了過來", excerpt: StoryCardSkeleton.excerptSample(han: true),
            authorName: "小島", authorInitials: "小", authorImageURL: nil, avatarSeed: 5, readTime: "3 分鐘",
            tags: ["日常", "旅行"], imageURL: nil, imageLabel: "", accentHue: nil, reason: nil)
        // Two title lines, as the skeleton draws: the title's CSS line box twice.
        let title = AppFonts.scaledUIFont(.heading, size: 18, weight: .bold)
        same(height(CSSText(content.title, font: title, lineHeight: 1.3), width: 390 - 76), 2 * title.pointSize * 1.3, "two title lines")
        same(height(StoryCardSkeleton(position: 0)), height(StoryCardView(content, position: 0)), "feed card")
        // In English, a Latin excerpt of the same length.
        var english = content
        english.title = "The little house by the sea woke slowly after the first rain"
        english.excerpt = StoryCardSkeleton.excerptSample(han: false)
        english.tags = ["daily", "travel"]
        english.authorName = "island"
        english.readTime = "3 min"
        same(height(StoryCardSkeleton(position: 0), han: false), height(StoryCardView(english, position: 0), han: false), "feed card, English")
    }

    @Test func theCardPagesTitleAndBylineStandWhereTheirSkeletonsDo() {
        let story = StoryTypography(script: .cjk, layout: WindowLayout.phone.layoutClass)
        let title = height(StoryTitle("海邊的小屋在雨後，慢慢醒了過來", typography: story, lang: "zh-Hant"), width: 350)
        same(title, 2 * story.titleFont().pointSize * story.titleLeading, "two title lines")
        same(height(StoryTitleSkeleton(typography: story), width: 350), title, "card page title")
        // The byline's words in the interface's language (its meta line is the app's).
        let han = Strings.shared.language == .zhTW
        let card = Fixture.card("c1", title: "海邊的小屋", by: han ? "小島" : "island")
        same(height(StoryBylineSkeleton(typography: story), width: 350, han: han),
             height(StoryBylineRow(card: card, anonymous: false, avatar: story.bylineAvatar, metaSize: story.metaSize), width: 350, han: han),
             "card page byline")
    }

    @Test func theLoadingConversationsAreAsTallAsSixConversations() {
        let person = Person(id: "u1", data: ["handle": "小島", "initials": "小"])!
        let row = height(ConversationRow(person: person, preview: "下午在海邊撿到一張卡片，想寄給你", time: "下午 3:04", unread: 0))
        same(height(ConversationsSkeleton()), 6 * row, "conversations")
    }

    @Test func theLoadingBellIsAsTallAsItsRows() {
        let short = BellSentence(before: "", handle: "小島", after: " 共振了你的卡片")
        let long = BellSentence(before: "", handle: "小島", after: " 在你的卡片「海邊的小屋在第一場雨之後」寫了一張小紙條給你")
        let rows = (0..<6).map { i in
            let card = i == 0 || i == 2
            return height(NotificationRowLabel(sentence: card ? long : short, preview: nil, unread: false, face: .pending,
                                               card: card ? .pending : .none, when: "3 小時前")
                .padding(.horizontal, ListBands.contentInset))
        }
        same(height(NotificationsSkeleton()), rows.reduce(0, +), "notifications")
    }

    @Test func theLoadingCardPickerIsAsTallAsFourCards() {
        let cards = (1...4).map { Fixture.card("c\($0)", title: "海邊的小屋之\($0)") }
        let real = height(CardPickList(cards: cards, onPick: { _ in }) { EmptyView() } empty: { EmptyView() })
        let loading = height(CardPickList(cards: [], onPick: { _ in }) { EmptyView() } empty: { CardPickSkeleton(rows: 4) })
        same(loading, real, "card picker")
    }

    @Test func theLoadingBlockListIsAsTallAsTwoPeople() {
        let people = ["小島", "山風"].enumerated().map { i, name in
            SafetyService.BlockedPerson(id: "u\(i)", handle: name, initials: String(name.prefix(1)), avatarUrl: nil, accentColor: nil,
                                        avatarSeed: 5, since: Date(timeIntervalSince1970: 1_790_000_000))
        }
        let real = height(VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(people.enumerated()), id: \.element.id) { i, person in
                if i > 0 { WavyDivider(seed: Double(100 + i * 7)).padding(.vertical, 2) }
                BlockedPersonRow(person: person) {}
            }
        })
        same(height(BlockedListSkeleton()), real, "block list")
    }

    @Test func theCardBoxHeadAndTheProfileHeroStandAsTheirWords() {
        // The card box's head: the 72 avatar beside the pen name over the bio.
        let head = height(HStack(spacing: 16) {
            Color.clear.frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: "小島").font(AppFonts.heading(24))
                Text(verbatim: "在海邊寫字的人").font(AppFonts.body(14))
            }
            Spacer(minLength: 0)
        })
        same(height(CardBoxHeadSkeleton()), head, "card box head")
        // The profile's hero, as AuthorScreen's page sets it: avatar, name, two lines of bio, meta.
        let hero = height(VStack(spacing: 14) {
            Color.clear.frame(width: 96, height: 96).padding(.bottom, Tokens.peopleNameGap - 14)
            Text(verbatim: "小島").font(AppFonts.heading(32))
            Text(verbatim: "在海邊寫字的人，喜歡雨天、舊信和沒有人的車站，偶爾寫寫山裡")
                .font(AppFonts.body(15)).multilineTextAlignment(.center).lineSpacing(15 * 0.6)
            Text(verbatim: "台灣　12 張卡片　2026年8月加入").font(AppFonts.body(13))
        }.padding(.horizontal, 24), width: 390)
        same(height(ProfileHeroSkeleton().padding(.horizontal, 24), width: 390), hero, "profile hero")
    }
}
