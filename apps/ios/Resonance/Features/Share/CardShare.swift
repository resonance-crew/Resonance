import DesignSystem
import LinkPresentation
import Photos
import ResonanceKit
import SwiftUI
import UIKit

/// A card's share (share.spec, the owner's revision): one glyph in the card's bar, straight to the
/// system's share sheet, which carries both the card's link and its 1080 × 1920 picture — and each
/// destination takes what fits it: Instagram's own share extension and Save Image the picture
/// (made for Stories), every other one the link (Facebook as a post with its link card, Threads,
/// LINE, X, Messages, Mail, Copy, AirDrop…), which opens the card where a picture would be a dead
/// end. With a Meta App ID and Instagram installed, the sheet also offers Instagram 限時動態: the
/// card as a movable sticker over its backdrop. The picture is made on the phone when the glyph is
/// tapped, from the card as the page has it; should that fail, the sheet carries the link alone.
enum CardSharing {
    /// Instagram's share extension (its Feed, Stories and Direct targets).
    static let instagramExtension = UIActivity.ActivityType("com.burbn.instagram.shareextension")
    /// What the sheet leaves out: nothing a card's link or picture is for.
    static let excluded: [UIActivity.ActivityType] = [.assignToContact, .addToReadingList, .print]

    /// Whether `activity` gets the picture (and not the link): Instagram's extension and Save Image.
    static func takesPicture(_ activity: UIActivity.ActivityType?) -> Bool {
        activity == .saveToCameraRoll || activity == instagramExtension
    }

    /// The pictures the card is drawn with: its cover, and its author's photo — never an anonymous
    /// card's author's, whoever shares it (its owner included).
    static func pictureURLs(_ detail: CardDetail) -> (cover: URL?, photo: URL?) {
        let cover = detail.card.imageUrl.flatMap(URL.init(string:))
        guard !anonymous(detail) else { return (cover, nil) }
        return (cover, detail.card.author?.value1.avatarUrl.flatMap(URL.init(string:)))
    }

    /// What the picture shows: the title, the story's opening in the story's type, and the byline —
    /// for an anonymous card 匿名 over the neutral 「·」, nothing of its author.
    static func content(_ detail: CardDetail, cover: UIImage?, photo: UIImage?) -> ShareCardContent {
        let card = detail.card
        let byline: ShareCardContent.Byline
        if !anonymous(detail), let author = card.author?.value1 {
            byline = .named(name: author.handle, initials: author.initials, photo: photo, verified: author.verified,
                            avatarSeed: author.avatarSeedValue)
        } else {
            byline = .anonymous(label: L10n.Card.anonymousAuthor)
        }
        return ShareCardContent(title: card.title, words: SharePassages.opening(detail.story),
                                script: ScriptRule.storyScript(title: card.title, story: detail.story), cover: cover, byline: byline,
                                date: publishedDate(card), palette: ShareCardContent.palette(accentHue: card.accentHue, cardId: card.id),
                                seed: ShareCardContent.seed(cardId: card.id))
    }

    static func anonymous(_ detail: CardDetail) -> Bool { detail.anonymous || detail.card.anonymous }

    /// The published date in the app's language (2026年10月10日 / Oct 10, 2026).
    static func publishedDate(_ card: FeedCard) -> String? {
        card.publishedAt.flatMap(ISO8601.date).map {
            $0.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Strings.shared.locale))
        }
    }

    /// The sheet's items: the link (with its preview) and the picture, each answering only the
    /// destinations it is for.
    static func items(link: URL, title: String, cover: UIImage?, picture: UIImage?) -> [UIActivityItemSource] {
        var items: [UIActivityItemSource] = [LinkSource(link: link, title: title, image: cover)]
        if let picture { items.append(CardImageSource(picture: picture)) }
        return items
    }

    /// What a toast says once the sheet is done: Save Image's outcome, or nothing.
    static func outcome(activity: UIActivity.ActivityType?, completed: Bool, error: Error?, photoAccess: PHAuthorizationStatus) -> String? {
        guard activity == .saveToCameraRoll else { return nil }
        if completed && error == nil { return L10n.Share.Image.saved }
        guard error != nil else { return nil }
        return photoAccess == .denied || photoAccess == .restricted ? L10n.Share.Image.saveDenied : L10n.Share.Image.saveFailed
    }

    /// Opens the sheet for `detail` from `anchor` (the glyph: an iPad's or a Mac's popover points at it).
    @MainActor static func present(_ detail: CardDetail, content: ShareCardContent, picture: UIImage?, anchor: UIView?, session: SessionStore,
                                   canOpen: (URL) -> Bool = { UIApplication.shared.canOpenURL($0) }) {
        let link = ShareLinks.cardURL(detail, origin: session.config.origin)
        let items = items(link: link, title: detail.card.title, cover: content.cover, picture: picture)
        var activities: [UIActivity] = []
        if let appID = session.config.metaAppID, InstagramStories.available(appID: appID, canOpen: canOpen) {
            let toasts = session.toasts
            activities.append(InstagramStoriesActivity(link: link, appID: appID, make: {
                guard let sticker = ShareCardRenderer.sticker(content), let background = ShareCardRenderer.backdrop(palette: content.palette) else {
                    return nil
                }
                return (sticker, background)
            }, failed: { toasts.show(L10n.Share.Image.storiesFailed) }))
        }
        let toasts = session.toasts
        ShareSheet.present(items: items, activities: activities, excluded: excluded, from: anchor) { activity, completed, error in
            let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
            if let word = outcome(activity: activity, completed: completed, error: error, photoAccess: status) { toasts.show(word) }
        }
    }
}

/// The card's link, for every destination but those that take the picture: the URL, and its preview
/// (`LPLinkMetadata`: the title, the cover — else the app's icon) so the sheet's header draws without
/// fetching the page; the title as a mail's subject.
final class LinkSource: NSObject, UIActivityItemSource {
    let link: URL
    let title: String
    let image: UIImage?

    init(link: URL, title: String, image: UIImage?) {
        self.link = link
        self.title = title
        self.image = image
    }

    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { link }

    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
        item(for: activityType)
    }

    /// The link, or nothing for a destination that takes the picture.
    func item(for activityType: UIActivity.ActivityType?) -> Any? {
        CardSharing.takesPicture(activityType) ? nil : link
    }

    func activityViewController(_ activityViewController: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?) -> String {
        title
    }

    func activityViewControllerLinkMetadata(_ activityViewController: UIActivityViewController) -> LPLinkMetadata? { metadata }

    var metadata: LPLinkMetadata {
        let metadata = LPLinkMetadata()
        metadata.originalURL = link
        metadata.url = link
        metadata.title = title
        if let image {
            metadata.imageProvider = NSItemProvider(object: image)
        } else if let icon = Self.appIcon {
            metadata.iconProvider = NSItemProvider(object: icon)
        }
        return metadata
    }

    /// The app's own icon, as the home screen has it.
    static var appIcon: UIImage? {
        guard let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
              let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
              let files = primary["CFBundleIconFiles"] as? [String], let name = files.last else { return nil }
        return UIImage(named: name)
    }
}

/// The card's picture, for Instagram's share extension and Save Image only: every other destination
/// gets the link (a feed's link card opens the card; a 9:16 picture there is cropped and a dead end).
final class CardImageSource: NSObject, UIActivityItemSource {
    let picture: UIImage

    init(picture: UIImage) { self.picture = picture }

    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { picture }

    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? {
        item(for: activityType)
    }

    func item(for activityType: UIActivity.ActivityType?) -> Any? {
        CardSharing.takesPicture(activityType) ? picture : nil
    }
}

/// Instagram 限時動態 in the sheet's row of apps: the card as a sticker over its backdrop
/// (``InstagramStories``). The sticker and backdrop are drawn when it is chosen. UIKit calls an
/// activity on the main thread; it is declared nonisolated only because UIActivity is.
nonisolated final class InstagramStoriesActivity: UIActivity, @unchecked Sendable {
    static let type = UIActivity.ActivityType("com.resonance.stories.instagram-stories")

    let link: URL
    let appID: String
    let title: String
    let image: UIImage?
    let make: @MainActor () -> (sticker: Data, background: Data)?
    let failed: @MainActor () -> Void
    let pasteboard: StoriesPasteboard
    let open: @MainActor (URL) async -> Bool

    @MainActor init(link: URL, appID: String, make: @escaping @MainActor () -> (sticker: Data, background: Data)?,
                    failed: @escaping @MainActor () -> Void, pasteboard: StoriesPasteboard = UIPasteboard.general,
                    open: @escaping @MainActor (URL) async -> Bool = { await UIApplication.shared.open($0) }) {
        self.link = link
        self.appID = appID
        self.title = L10n.Share.toStories
        self.image = Self.glyph()
        self.make = make
        self.failed = failed
        self.pasteboard = pasteboard
        self.open = open
        super.init()
    }

    override class var activityCategory: UIActivity.Category { .share }
    override var activityType: UIActivity.ActivityType? { Self.type }
    override var activityTitle: String? { title }
    override var activityImage: UIImage? { image }

    override func canPerform(withActivityItems activityItems: [Any]) -> Bool { true }

    override func perform() {
        Task { @MainActor in
            let done = await handOff()
            activityDidFinish(done)
            if !done { failed() }
        }
    }

    /// Draws the sticker and backdrop, puts them on the pasteboard and opens Instagram.
    @MainActor func handOff() async -> Bool {
        guard let assets = make() else { return false }
        return await InstagramStories.share(sticker: assets.sticker, background: assets.background, link: link, appID: appID,
                                            pasteboard: pasteboard, open: open)
    }

    /// Instagram's own glyph, unmodified, when the app carries it (`InstagramGlyph` in the asset
    /// catalog, from Meta's brand resources); until then a plain tile with the picture glyph.
    @MainActor static func glyph() -> UIImage? {
        if let official = UIImage(named: "InstagramGlyph") { return official }
        let renderer = ImageRenderer(content: ZStack {
            RoundedRectangle(cornerRadius: 14).fill(Tokens.terracottaLight)
            OrganicIcon(.image, size: 30, color: Tokens.text, strokeWidth: Tokens.ink)
        }.frame(width: 60, height: 60))
        renderer.scale = 3
        return renderer.uiImage
    }
}

/// The system's share sheet over whatever is on screen, its popover pointing at `anchor`.
@MainActor enum ShareSheet {
    static func present(items: [Any], activities: [UIActivity], excluded: [UIActivity.ActivityType], from anchor: UIView?,
                        completion: @escaping (UIActivity.ActivityType?, Bool, Error?) -> Void) {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard var top = scene?.keyWindow?.rootViewController ?? scene?.windows.first?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: activities)
        sheet.excludedActivityTypes = excluded
        sheet.completionWithItemsHandler = { activity, completed, _, error in completion(activity, completed, error) }
        if let popover = sheet.popoverPresentationController {
            if let anchor {
                popover.sourceView = anchor
                popover.sourceRect = anchor.bounds
            } else {
                popover.sourceView = top.view
                popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.minY + 60, width: 1, height: 1)
            }
        }
        top.present(sheet, animated: true)
    }
}

/// Where a SwiftUI control is in UIKit's views, for a popover to point at.
@MainActor final class ShareAnchor {
    weak var view: UIView?
}

struct ShareAnchorView: UIViewRepresentable {
    let anchor: ShareAnchor

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        anchor.view = view
        return view
    }

    func updateUIView(_ view: UIView, context: Context) { anchor.view = view }
}

/// The share glyph in a card's bar, offered only by ``CardShareGate``: a tap makes the picture
/// (the glyph turns into the pen loop meanwhile) and opens the sheet; the owner of an anonymous card
/// is asked first.
struct CardShareButton: View {
    let detail: CardDetail
    let seed: Double
    @Environment(SessionStore.self) private var session
    @State private var anchor = ShareAnchor()
    @State private var confirming = false
    @State private var busy = false

    var body: some View {
        Button {
            if CardShareGate.asksFirst(detail) { confirming = true } else { share() }
        } label: {
            OrganicChipFace(.share, seed: seed, trigger: .bare)
                .opacity(busy ? 0 : 1)
                .overlay { if busy { ButtonLoader(size: 18, color: Tokens.text) } }
                .background(ShareAnchorView(anchor: anchor))
        }
        .buttonStyle(OrganicPressStyle())
        .disabled(busy)
        .accessibilityLabel(L10n.Card.share)
        .organicConfirm(isPresented: $confirming, title: L10n.Share.anonymousTitle, message: L10n.Share.anonymousHint,
                        cancelLabel: L10n.Safety.cancel, confirmLabel: L10n.Card.share, closeLabel: L10n.Safety.cancel, seed: seed + 7) {
            confirming = false
            share()
        }
        #if DEBUG
        // `-debugShare YES` taps it once the page is up, to check the sheet on screen (Debug only).
        .task {
            guard UserDefaults.standard.bool(forKey: "debugShare") else { return }
            try? await Task.sleep(for: .seconds(1.5))
            if CardShareGate.asksFirst(detail) { confirming = true } else { share() }
        }
        #endif
    }

    private func share() {
        guard !busy else { return }
        busy = true
        let detail = detail
        Task { @MainActor in
            defer { busy = false }
            let urls = CardSharing.pictureURLs(detail)
            async let cover = ShareCardImages.load(urls.cover)
            async let photo = ShareCardImages.load(urls.photo)
            let content = CardSharing.content(detail, cover: await cover, photo: await photo)
            let picture = ShareCardRenderer.composite(content)
            CardSharing.present(detail, content: content, picture: picture, anchor: anchor.view, session: session)
        }
    }
}
