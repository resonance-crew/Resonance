import DesignSystem
import Photos
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// A card's share (share.spec, the owner's revision): one glyph, offered only on a published, public
/// card; the system sheet carrying the link and the 1080 × 1920 picture, each destination taking
/// what fits it; the picture as the recipe draws it, never naming an anonymous card's author; and
/// Instagram Stories' payload.
@MainActor @Suite struct CardShareTests {
    static let origin = URL(string: "https://resonance.channel")!

    /// A card page as the API sends it; the author always comes along (an owner's anonymous card
    /// carries it too), so a test can check it never reaches the picture.
    static func detail(title: String = "跑完 2400 公尺那天，我才懂得慢下來", story: String = "那年我用 iPhone 記下每一次配速。\n\n教練只說：don’t rush.",
                       slug: String? = "run-2400", anonymous: Bool = false, visibility: String = "public", published: Bool = true,
                       trashed: Bool = false, isOwner: Bool = false, cover: String? = nil, photo: String? = "https://img.example/u/nian.webp",
                       verified: Bool = true) -> CardDetail {
        func q(_ s: String?) -> String { s.map { String(decoding: try! JSONEncoder().encode($0), as: UTF8.self) } ?? "null" }
        let json = """
        {"card":{"id":"card-77","slug":\(q(slug)),"title":\(q(title)),"excerpt":"…","tags":["跑步"],
        "publishedAt":\(published ? "\"2026-10-10T08:00:00.000Z\"" : "null"),
        "author":{"id":"u-nian","handle":"念誠","initials":"念誠","accentColor":"oklch(90% 0.05 60)","avatarUrl":\(q(photo)),
        "avatarSeed":"12","verified":\(verified),"region":"TW"},"anonymous":\(anonymous),"visibility":"\(visibility)",
        "imageUrl":\(q(cover)),"imageLabel":null,"accentHue":55,"readMinutes":3,"referenceCardId":null,"reason":null
        \(trashed ? #","trashedAt":"2026-10-19T08:00:00.000Z""# : "")},
        "story":\(q(story)),"visibility":"\(visibility)","anonymous":\(anonymous),"resonanceCount":0,"coreInsight":null,
        "isOwner":\(isOwner),"referenceCard":null}
        """
        return try! JSONDecoder().decode(CardDetail.self, from: Data(json.utf8))
    }

    // MARK: Which cards offer a share

    @Test func onlyAPublishedPublicCardOffersAShareAndNeverOneInTheTrash() {
        #expect(CardShareGate.offered(Self.detail()))
        // Anyone may share an anonymous one (its link names no one).
        #expect(CardShareGate.offered(Self.detail(anonymous: true)))
        #expect(!CardShareGate.offered(Self.detail(visibility: "private")))
        #expect(!CardShareGate.offered(Self.detail(visibility: "connections")))
        #expect(!CardShareGate.offered(Self.detail(published: false)))
        #expect(!CardShareGate.offered(Self.detail(trashed: true)))
        // The owner is asked first only about their own anonymous card.
        #expect(CardShareGate.asksFirst(Self.detail(anonymous: true, isOwner: true)))
        #expect(!CardShareGate.asksFirst(Self.detail(anonymous: true)))
        #expect(!CardShareGate.asksFirst(Self.detail(isOwner: true)))
    }

    // MARK: The link

    @Test func aCardIsSharedByItsSlugAndAnAnonymousOneByItsIdAlways() {
        #expect(ShareLinks.cardURL(Self.detail(), origin: Self.origin).absoluteString == "https://resonance.channel/card/run-2400")
        // A collided slug carries the pen name: an anonymous card's link never does.
        let anonymous = Self.detail(slug: "run-2400-念誠", anonymous: true)
        #expect(ShareLinks.cardURL(anonymous, origin: Self.origin).absoluteString == "https://resonance.channel/card/card-77")
        #expect(ShareLinks.cardURL(Self.detail(slug: nil), origin: Self.origin).absoluteString == "https://resonance.channel/card/card-77")
        // encodeURIComponent's way, and no locale, no tracking.
        #expect(ShareLinks.profileURL(handle: "念誠 a/b", origin: URL(string: "https://resonance.channel/")!).absoluteString
            == "https://resonance.channel/u/%E5%BF%B5%E8%AA%A0%20a%2Fb")
    }

    // MARK: Who gets what

    @Test func instagramAndSaveImageGetThePictureAndEveryOtherDestinationTheLink() {
        let link = URL(string: "https://resonance.channel/card/run-2400")!
        let picture = UIImage()
        let linkSource = LinkSource(link: link, title: "跑完 2400 公尺那天", image: nil)
        let imageSource = CardImageSource(picture: picture)
        for picturesOnly in [UIActivity.ActivityType.saveToCameraRoll, CardSharing.instagramExtension] {
            #expect(linkSource.item(for: picturesOnly) == nil, "\(picturesOnly.rawValue)")
            #expect(imageSource.item(for: picturesOnly) as? UIImage === picture, "\(picturesOnly.rawValue)")
        }
        // Facebook as a post with its link card, Threads, LINE, X, Messages, Mail, Copy, AirDrop, and any app we don't know.
        let linkTakers: [UIActivity.ActivityType] = [
            .postToFacebook, .message, .mail, .copyToPasteboard, .airDrop, .postToTwitter,
            .init("com.facebook.Facebook.ShareExtension"), .init("com.burbn.barcelona.ShareExtension"),
            .init("jp.naver.line.Share"), .init("com.atebits.Tweetie2.ShareExtension"), .init("net.whatsapp.WhatsApp.ShareExtension"),
        ]
        for type in linkTakers {
            #expect(linkSource.item(for: type) as? URL == link, "\(type.rawValue)")
            #expect(imageSource.item(for: type) == nil, "\(type.rawValue)")
        }
        #expect(linkSource.item(for: nil) as? URL == link)
        // The sheet's header draws from the link's own preview, without fetching the page.
        let metadata = linkSource.metadata
        #expect(metadata.url == link && metadata.originalURL == link && metadata.title == "跑完 2400 公尺那天")
        let covered = LinkSource(link: link, title: "t", image: UIImage(systemName: "circle")).metadata
        #expect(covered.imageProvider != nil)
        // Nothing a card is for: contacts, the reading list, printing.
        #expect(CardSharing.excluded == [.assignToContact, .addToReadingList, .print])
        // Without a picture (it couldn't be made) the sheet carries the link alone.
        #expect(CardSharing.items(link: link, title: "t", cover: nil, picture: nil).count == 1)
        #expect(CardSharing.items(link: link, title: "t", cover: nil, picture: picture).count == 2)
    }

    @Test func savingThePictureSaysHowItWent() {
        #expect(CardSharing.outcome(activity: .saveToCameraRoll, completed: true, error: nil, photoAccess: .authorized) == L10n.Share.Image.saved)
        let refused = NSError(domain: "ALAssetsLibraryErrorDomain", code: -3311)
        #expect(CardSharing.outcome(activity: .saveToCameraRoll, completed: false, error: refused, photoAccess: .denied) == L10n.Share.Image.saveDenied)
        #expect(CardSharing.outcome(activity: .saveToCameraRoll, completed: false, error: refused, photoAccess: .authorized) == L10n.Share.Image.saveFailed)
        // Closed without saving, or any other destination: nothing to say (the system's own Copy shows its own).
        #expect(CardSharing.outcome(activity: .saveToCameraRoll, completed: false, error: nil, photoAccess: .authorized) == nil)
        #expect(CardSharing.outcome(activity: .copyToPasteboard, completed: true, error: nil, photoAccess: .authorized) == nil)
    }

    // MARK: The picture

    @Test func anAnonymousCardsPictureHoldsNothingOfItsAuthor() throws {
        // The owner's own anonymous card: the page knows its author; the picture must not.
        let detail = Self.detail(anonymous: true, isOwner: true)
        #expect(CardSharing.pictureURLs(detail).photo == nil)
        let content = CardSharing.content(detail, cover: nil, photo: UIImage(systemName: "person"))
        guard case let .anonymous(label) = content.byline else { return #expect(Bool(false), "an anonymous byline") }
        #expect(label == L10n.Card.anonymousAuthor)
        for word in content.drawnText {
            #expect(!word.contains("念誠") && word != "念", "\(word)")
        }
        // What is drawn, read back from the view itself: no pen name, initials or verified mark.
        let spoken = Self.accessibilityText(ShareCardView(content))
        #expect(spoken.contains(L10n.Card.anonymousAuthor))
        #expect(!spoken.contains("念誠"))
        #expect(!spoken.contains(L10n.Card.verified))
        // A named card's picture does name its author.
        let named = CardSharing.content(Self.detail(), cover: nil, photo: nil)
        guard case let .named(name, initials, _, verified, _) = named.byline else { return #expect(Bool(false), "a named byline") }
        #expect(name == "念誠" && initials == "念誠" && verified)
        #expect(Self.accessibilityText(ShareCardView(named)).contains("念誠"))
    }

    @Test func thePictureQuotesTheOpeningInTheStorysTypeWithinItsLineBudgets() {
        let content = CardSharing.content(Self.detail(), cover: nil, photo: nil)
        #expect(content.words == SharePassages.opening(Self.detail().story))
        #expect(content.script == .cjk)
        #expect(content.date == CardSharing.publishedDate(Self.detail().card))
        #expect(content.palette == ShareCardContent.palette(accentHue: 55, cardId: "card-77"))
        #expect(content.seed == seedFromId("card-77"))
        let english = CardSharing.content(Self.detail(title: "The summer my grandmother taught me to pickle plums",
                                                      story: "Every May she dried the plums."), cover: nil, photo: nil)
        #expect(english.script == .latin)
        // The budgets: a long title takes 3 lines without a cover, 2 with; the words 8 and 4, then an ellipsis.
        let R = ShareCardRecipe.self
        let inner = R.cardWidth - 2 * R.padding
        let longTitle = String(repeating: "跑完兩千四百公尺那天我才懂得慢下來，", count: 4)
        let longWords = String(repeating: "那年我用手機記下每一次配速，教練只說不要急。", count: 20)
        for (text, type, size, lines) in [
            (longTitle, R.titleType(.cjk), R.titleSizeWithoutCover, R.titleLinesWithoutCover),
            (longTitle, R.titleType(.cjk), R.titleSizeWithCover, R.titleLinesWithCover),
            (longWords, R.wordsType(.cjk), R.wordsSize, R.wordsLinesWithoutCover),
            (longWords, R.wordsType(.cjk), R.wordsSize, R.wordsLinesWithCover),
        ] {
            let layout = ShareTextLayout(text, type: type, size: size, maxLines: lines, width: inner, script: .cjk)
            #expect(layout.lineCount == lines)
            #expect(layout.truncated)
            #expect(abs(layout.height - CGFloat(lines) * size * type.leading) < 1)
        }
        let short = ShareTextLayout("雨後", type: R.titleType(.cjk), size: R.titleSizeWithoutCover, maxLines: 3, width: inner, script: .cjk)
        #expect(short.lineCount == 1 && !short.truncated)
    }

    @Test func thePicturesAreTheirSizesTheCompositeOpaqueTheStickerOnTransparency() throws {
        let content = CardSharing.content(Self.detail(), cover: Self.swatch(.systemTeal, CGSize(width: 800, height: 400)), photo: nil)
        let composite = try #require(ShareCardRenderer.composite(content))
        let cg = try #require(composite.cgImage)
        #expect(cg.width == 1080 && cg.height == 1920)
        // A JPEG: no alpha.
        #expect([.none, .noneSkipFirst, .noneSkipLast].contains(cg.alphaInfo))
        let sticker = try #require(ShareCardRenderer.sticker(content).flatMap(UIImage.init(data:))?.cgImage)
        #expect(sticker.width == 624)
        #expect(Self.alpha(sticker, x: 1, y: 1) == 0)
        #expect(Self.alpha(sticker, x: sticker.width / 2, y: sticker.height / 2) == 255)
        let backdrop = try #require(ShareCardRenderer.backdrop(palette: content.palette).flatMap(UIImage.init(data:))?.cgImage)
        #expect(backdrop.width == 1080 && backdrop.height == 1920)
        // Not blank where the title is: ink on the paper, in the card's top band (under the cover).
        let ink = Self.darkPixels(cg, in: CGRect(x: 90, y: 840, width: 900, height: 200))
        #expect(ink > 500, "the title's ink: \(ink)")
        // The backdrop's corner is the family's fill, not the paper.
        #expect(Self.darkPixels(cg, in: CGRect(x: 0, y: 0, width: 60, height: 60)) == 0)
        // For eyes: where a test run leaves them.
        Self.keep(composite.jpegData(compressionQuality: 0.9), "share-composite.jpg")
        Self.keep(ShareCardRenderer.sticker(CardSharing.content(Self.detail(anonymous: true), cover: nil, photo: nil)), "share-sticker-anonymous.png")
        let en = CardSharing.content(Self.detail(title: "The summer my grandmother taught me to pickle plums",
                                                 story: "Every May my grandmother dried the green plums one by one and laid them on a bamboo tray. She said plums only turn sweet after a day in the sun, and so do people.\n\nI didn’t understand her then."),
                                     cover: nil, photo: nil)
        Self.keep(ShareCardRenderer.composite(en)?.jpegData(compressionQuality: 0.9), "share-composite-en.jpg")
    }

    // MARK: Instagram Stories

    final class Opened: @unchecked Sendable { var url: URL? }

    final class Pasteboard: StoriesPasteboard, @unchecked Sendable {
        var items: [[String: Any]] = []
        var options: [UIPasteboard.OptionsKey: Any] = [:]
        func setItems(_ items: [[String: Any]], options: [UIPasteboard.OptionsKey: Any]) {
            self.items = items
            self.options = options
        }
    }

    @Test func storiesGetsTheStickerOverItsBackdropAndTheLinkForFiveMinutes() async {
        let link = URL(string: "https://resonance.channel/card/run-2400")!
        let board = Pasteboard()
        let opened = Opened()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let done = await InstagramStories.share(sticker: Data([1, 2]), background: Data([3]), link: link, appID: "1115208464203859",
                                                pasteboard: board, now: now) { opened.url = $0; return true }
        #expect(done)
        #expect(opened.url?.absoluteString == "instagram-stories://share?source_application=1115208464203859")
        #expect(board.items.count == 1)
        let item = board.items[0]
        #expect(Set(item.keys) == ["com.instagram.sharedSticker.stickerImage", "com.instagram.sharedSticker.backgroundImage", "public.utf8-plain-text"])
        #expect(item["com.instagram.sharedSticker.stickerImage"] as? Data == Data([1, 2]))
        #expect(item["com.instagram.sharedSticker.backgroundImage"] as? Data == Data([3]))
        #expect(item["public.utf8-plain-text"] as? String == link.absoluteString)
        #expect(board.options[.expirationDate] as? Date == now.addingTimeInterval(300))
        // Offered only with an App ID and an Instagram that opens the scheme.
        #expect(InstagramStories.available(appID: "1115208464203859") { $0 == InstagramStories.probe })
        #expect(!InstagramStories.available(appID: "1115208464203859") { _ in false })
        #expect(!InstagramStories.available(appID: nil) { _ in true })
        #expect(!InstagramStories.available(appID: "") { _ in true })
        #expect(AppConfig.production.metaAppID == "1115208464203859")
    }

    @Test func theStoriesActionDrawsItsPicturesWhenChosenAndSaysWhenInstagramDidntOpen() async {
        let board = Pasteboard()
        let content = CardSharing.content(Self.detail(), cover: nil, photo: nil)
        let activity = InstagramStoriesActivity(link: URL(string: "https://resonance.channel/card/run-2400")!, appID: "1115208464203859", make: {
            guard let sticker = ShareCardRenderer.sticker(content), let background = ShareCardRenderer.backdrop(palette: content.palette) else { return nil }
            return (sticker, background)
        }, failed: {}, pasteboard: board, open: { _ in false })
        #expect(type(of: activity).activityCategory == .share)
        #expect(activity.activityTitle == L10n.Share.toStories && activity.activityImage != nil)
        #expect(await activity.handOff() == false)
        // The sticker (PNG) and backdrop (JPEG) went up even so: Instagram just didn't open.
        let sticker = board.items.first?["com.instagram.sharedSticker.stickerImage"] as? Data
        #expect(sticker.flatMap(UIImage.init(data:))?.cgImage?.width == 624)
        #expect((board.items.first?["com.instagram.sharedSticker.backgroundImage"] as? Data).flatMap(UIImage.init(data:))?.cgImage?.height == 1920)
    }

    // MARK: Helpers

    /// Every accessibility label and value the hosted view exposes, with accessibility on as
    /// VoiceOver has it (``AccessibilityOn``).
    static func accessibilityText(_ view: some View) -> String {
        let on = AccessibilityOn()
        defer { on.restore() }
        let host = UIHostingController(rootView: view.frame(width: 300))
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 300, height: 600))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.layoutIfNeeded()
        defer { window.isHidden = true }
        RunLoop.main.run(until: Date().addingTimeInterval(0.2))
        return AccessibilityOn.elements(in: host.view).flatMap { [$0.accessibilityLabel, $0.accessibilityValue].compactMap { $0 } }
            .joined(separator: "\n")
    }

    static func swatch(_ color: UIColor, _ size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            color.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    static func pixels(_ image: CGImage) -> (data: [UInt8], width: Int) {
        let width = image.width, height = image.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let context = CGContext(data: &data, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return (data, width)
    }

    static func alpha(_ image: CGImage, x: Int, y: Int) -> UInt8 {
        let (data, width) = pixels(image)
        return data[(y * width + x) * 4 + 3]
    }

    /// Pixels in `rect` (top-left origin) dark enough to be ink.
    static func darkPixels(_ image: CGImage, in rect: CGRect) -> Int {
        let (data, width) = pixels(image)
        var count = 0
        for y in Int(rect.minY)..<min(Int(rect.maxY), image.height) {
            for x in Int(rect.minX)..<min(Int(rect.maxX), image.width) {
                let i = (y * width + x) * 4
                if Int(data[i]) + Int(data[i + 1]) + Int(data[i + 2]) < 3 * 110 { count += 1 }
            }
        }
        return count
    }

    static func keep(_ data: Data?, _ name: String) {
        guard let data else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? data.write(to: url)
        print("share picture: \(url.path)")
    }
}
