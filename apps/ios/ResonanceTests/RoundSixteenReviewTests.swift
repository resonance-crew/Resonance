import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 16's design review, on iOS (review-decisions.md, review-apps.md): a held link's rows lead the list,
/// one time of day across the chat, a standalone address with no page read for it still a card, a pill's ✕
/// named for its tag, upright Chinese placeholders, the format bar's fade never over a tool that is on, a
/// reaction chip's finger-sized target, and the night's chosen reaction on a disc that shows.
@MainActor @Suite struct RoundSixteenReviewTests {
    // MARK: S8 — the link's rows

    @Test func aPressOnALinkPutsItsOpenAndCopyFirst() {
        // On the link: 開啟連結 · 複製連結, then 回覆 · 複製 · 檢舉 (theirs).
        #expect(MessageMenu.rows(link: true, onLink: true, reply: true, copy: true, unsend: false, report: true, failed: false)
                == [.openLink, .copyLink, .reply, .copy, .report])
        // Elsewhere on the bubble: the link's rows after 複製, as before; your own message's 收回 after them.
        #expect(MessageMenu.rows(link: true, onLink: false, reply: true, copy: true, unsend: true, report: false, failed: false)
                == [.reply, .copy, .openLink, .copyLink, .unsend])
        // No link: no link rows, wherever the finger was; one that didn't go ends in 重試 · 刪除.
        #expect(MessageMenu.rows(link: false, onLink: false, reply: false, copy: true, unsend: false, report: false, failed: true)
                == [.copy, .retry, .discard])
    }

    @Test func theLinksRowsWearTheirOwnGlyphsNeverCopysTwin() {
        #expect(MessageMenu.Row.openLink.icon == .arrowRight)
        #expect(MessageMenu.Row.copyLink.icon == .link)
        #expect(MessageMenu.Row.copy.icon == .copy)
        // The rows' ids stay what the list keys them by.
        #expect(MessageMenu.Row.openLink.rawValue == "open-link" && MessageMenu.Row.copyLink.rawValue == "copy-link")
    }

    // MARK: F5 / N7 — one time of day

    /// 2026-09-29 15:04 and 09:05 where the test runs (the labels are local times).
    let afternoon = Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 15, minute: 4))!
    let morning = Calendar.current.date(from: DateComponents(year: 2026, month: 9, day: 29, hour: 9, minute: 5))!

    @Test func theListTheThreadAndTheMenuSayATimeOfDayTheSameWay() {
        #expect(ThreadScreen.time(morning, language: .zhTW) == "上午9:05")
        #expect(ThreadScreen.time(morning, language: .en) == "9:05 AM")
        // The Messages list today: the thread's own words (it said 下午03:04).
        let later = afternoon.addingTimeInterval(3600)
        #expect(ConversationsScreen.time(afternoon, now: later, language: .zhTW) == "下午3:04")
        #expect(ConversationsScreen.time(afternoon, now: later, language: .en) == "3:04 PM")
        #expect(ConversationsScreen.time(afternoon, now: later, language: .zhTW) == ThreadScreen.time(afternoon, language: .zhTW))
        // Another day: the date.
        let tomorrow = afternoon.addingTimeInterval(24 * 3600)
        #expect(ConversationsScreen.time(afternoon, now: tomorrow, language: .zhTW) == "9/29")
        // The held message's foot: its day, then the same time of day.
        #expect(ThreadScreen.full(morning, language: .zhTW) == "9月29日 上午9:05")
        #expect(ThreadScreen.full(morning, language: .en) == "September 29 at 9:05 AM")
    }

    // MARK: S3 — 卡片 always looks like a card

    @Test func aStandaloneAddressMayStandAsACardButNotOurOwnPagesOrANumber() throws {
        let card = try #require(StoryLinks.cardable(href: "https://www.example.com/rain", text: "https://www.example.com/rain"))
        #expect(card.url.absoluteString == "https://www.example.com/rain")
        #expect(StoryLinks.cardable(href: nil, text: "https://example.com/rain")?.host == "example.com")
        // Words of the writer's own are words.
        #expect(StoryLinks.cardable(href: "https://example.com/rain", text: "那篇文章") == nil)
        // Our own pages (an embed's business), the API's host, and a bare IP address stay links.
        #expect(StoryLinks.cardable(href: nil, text: "https://resonance.channel/u/bob") == nil)
        #expect(StoryLinks.cardable(href: nil, text: "https://www.resonance.channel/about") == nil)
        #expect(StoryLinks.cardable(href: nil, text: "https://staging.example.org/x", siteHost: "staging.example.org") == nil)
        #expect(StoryLinks.cardable(href: nil, text: "http://192.168.1.10/page") == nil)
    }

    @Test func aPrivateCardsAddressWithNoPageReadIsDrawnAsTheWritersCard() async throws {
        var sent = Fixture.detail(Fixture.card("c1"),
                                  story: "<https://www.example.com/rain-walk>\n\nhttps://example.com/read\n\n[那篇](https://example.com/words)")
        sent.linkPreviews = [.init(url: "https://example.com/read", title: "Read")]
        let detail = sent
        let model = CardModel(key: "c1", origin: URL(string: "http://127.0.0.1:3300")!) { _ in detail }
        await model.load()
        let links = model.blocks.compactMap { block -> (String?, String)? in
            if case let .soleLink(href, text, _) = block { (href, text) } else { nil }
        }
        #expect(links.count == 3)
        // Never read (a private card's): the host over the address as written, nothing fetched.
        let bare = try #require(model.linkFallback(href: links[0].0, text: links[0].1))
        #expect(bare.host == "example.com")
        #expect(bare.address == "https://www.example.com/rain-walk")
        #expect(bare.link.url.absoluteString == "https://www.example.com/rain-walk")
        // A page read for it draws its preview instead; words of the writer's own stay words.
        #expect(model.linkFallback(href: links[1].0, text: links[1].1) == nil)
        #expect(model.linkPreview(href: links[1].0, text: links[1].1) != nil)
        #expect(model.linkFallback(href: links[2].0, text: links[2].1) == nil)
    }

    // MARK: N6 / S2 — the writer's tags

    @Test func aPillsCrossIsNamedForItsTag() {
        let zh = Strings(language: .zhTW)
        zh.load()
        #expect(zh.format("write.tagsRemoveLabel", ["tag": "日常"]) == "移除標籤：日常")
        let en = Strings(language: .en)
        en.load()
        #expect(en.format("write.tagsRemoveLabel", ["tag": "rain"]) == "Remove tag: rain")
    }

    // (S2's half wash on the cream gave way to the AI 建議 segment's own face in round 17 §4: RoundSeventeenTests.)

    // MARK: F6 — upright Chinese placeholders

    @Test func onlyALatinPlaceholderSlants() {
        #expect(!Slant.takes("輸入標籤⋯"))
        #expect(!Slant.takes("想說的話⋯"))
        #expect(!Slant.takes("タグを入力"))
        #expect(!Slant.takes("태그"))
        #expect(Slant.takes("Type a tag…"))
        #expect(Slant.takes("Paste or type an address"))
    }

    // MARK: F3 — the format bar's fades

    @Test func noFadeLiesOverAToolThatIsOn() {
        let width: CGFloat = 350
        // More of the row both ways, nothing on: both fades.
        let plain = StoryFormatBar.fadeWidths(fades: (true, true), onFrames: [], width: width)
        #expect(plain.leading == StoryFormatBar.fade && plain.trailing == StoryFormatBar.fade)
        // 連結 on, its wash reaching into the trailing 16: no trailing fade (the leading one stays).
        let link = StoryFormatBar.fadeWidths(fades: (true, true), onFrames: [CGRect(x: 300, y: 0, width: 60, height: 44)], width: width)
        #expect(link.leading == StoryFormatBar.fade && link.trailing == 0)
        // A tool on at the start, under the leading fade.
        let bold = StoryFormatBar.fadeWidths(fades: (true, false), onFrames: [CGRect(x: 4, y: 0, width: 50, height: 44)], width: width)
        #expect(bold.leading == 0 && bold.trailing == 0)
        // One on in the middle covers neither end.
        let middle = StoryFormatBar.fadeWidths(fades: (true, true), onFrames: [CGRect(x: 150, y: 0, width: 50, height: 44)], width: width)
        #expect(middle.leading == StoryFormatBar.fade && middle.trailing == StoryFormatBar.fade)
        // Android's measures: the tools side by side, 8 in from the row's ends.
        #expect(StoryFormatBar.rowInset == 8)
    }

    // MARK: S7 — a reaction chip's target

    @Test func aReactionChipTakesAFingersFortyFour() {
        let one = MinimumTarget.frame(CGRect(x: 10, y: 20, width: 24, height: 24), side: 44)
        #expect(one == CGRect(x: 0, y: 10, width: 44, height: 44))
        // Two stickers are wider than 44 already: only its height grows, about its centre.
        let two = MinimumTarget.frame(CGRect(x: 0, y: 0, width: 64, height: 24), side: 44)
        #expect(two == CGRect(x: 0, y: -10, width: 64, height: 44))
        #expect(ReactionChipMetrics.target == 44)
    }

    // MARK: F4 — the night's chosen reaction

    @Test func atNightTheChosenReactionsDiscIsTheAccentOverTheTraysPaper() throws {
        func rgb(_ color: Color, _ style: UIUserInterfaceStyle) -> (CGFloat, CGFloat, CGFloat) {
            let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
            return (r, g, b)
        }
        func luminance(_ c: (CGFloat, CGFloat, CGFloat)) -> CGFloat {
            func lin(_ v: CGFloat) -> CGFloat { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
            return 0.2126 * lin(c.0) + 0.7152 * lin(c.1) + 0.0722 * lin(c.2)
        }
        // Light: the accent's light wash, as before.
        let lightDisc = rgb(PressSheet.chosenDisc, .light), lightWash = rgb(Tokens.terracottaLight, .light)
        #expect(abs(lightDisc.0 - lightWash.0) < 0.01 && abs(lightDisc.1 - lightWash.1) < 0.01 && abs(lightDisc.2 - lightWash.2) < 0.01)
        // Night: clearly off the raised paper — the light wash was ≈ 1.2 : 1 against it.
        let paper = luminance(rgb(PressSheet.paper, .dark))
        func contrast(_ color: Color) -> CGFloat { (luminance(rgb(color, .dark)) + 0.05) / (paper + 0.05) }
        #expect(contrast(PressSheet.chosenDisc) > 1.3)
        #expect(contrast(PressSheet.chosenDisc) > contrast(Tokens.terracottaLight) + 0.1)
    }
}
