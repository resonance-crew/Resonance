import Foundation
import UIKit
import UniformTypeIdentifiers

/// Where Instagram Stories' payload goes: the general pasteboard in the app, a stand-in in tests.
protocol StoriesPasteboard: Sendable {
    func setItems(_ items: [[String: Any]], options: [UIPasteboard.OptionsKey: Any])
}

extension UIPasteboard: @retroactive @unchecked Sendable {}
extension UIPasteboard: StoriesPasteboard {}

/// The card into Instagram Stories as a movable sticker over its backdrop (share.spec §4.8, Meta's
/// "Sharing to Stories" for iOS): the sticker and the background on the pasteboard for five minutes,
/// then `instagram-stories://share?source_application=` with the app's Meta App ID. A third-party app
/// can't attach a link to a Story (Meta's partners alone can), so the card's link goes on the
/// pasteboard too, as text — copied, for Instagram's own link sticker — and the app's toast says so
/// (share.image.storiesLinkCopied) before Instagram opens, `readPause` later (round 8 §9.2).
enum InstagramStories {
    static let scheme = "instagram-stories"
    /// What `canOpenURL` asks (the scheme is in LSApplicationQueriesSchemes).
    static let probe = URL(string: "instagram-stories://share")!
    static let stickerKey = "com.instagram.sharedSticker.stickerImage"
    static let backgroundKey = "com.instagram.sharedSticker.backgroundImage"
    /// How long the payload stays on the pasteboard.
    static let lifetime: TimeInterval = 5 * 60
    /// How long the toast saying the link is copied shows before Instagram opens over it.
    static let readPause: Duration = .milliseconds(1200)

    /// The URL that hands the payload over, naming the app it comes from.
    static func url(appID: String) -> URL {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = "share"
        parts.queryItems = [URLQueryItem(name: "source_application", value: appID)]
        return parts.url!
    }

    /// Offered only with a Meta App ID and an Instagram that opens the scheme — without either, the
    /// sheet still reaches Instagram's own share extension, with the picture.
    static func available(appID: String?, canOpen: (URL) -> Bool) -> Bool {
        guard let appID, !appID.isEmpty else { return false }
        return canOpen(probe)
    }

    /// The pasteboard's one item: the sticker (PNG), the background (JPEG) and the link as text.
    static func items(sticker: Data, background: Data, link: URL) -> [[String: Any]] {
        [[
            stickerKey: sticker,
            backgroundKey: background,
            UTType.utf8PlainText.identifier: link.absoluteString,
        ]]
    }

    static func options(now: Date = .now) -> [UIPasteboard.OptionsKey: Any] {
        [.expirationDate: now.addingTimeInterval(lifetime)]
    }

    /// Puts the payload on `pasteboard` — the link copied with it —, has it said (`told`: the toast),
    /// and opens Instagram `readPause` later; false when it didn't open.
    @MainActor static func share(sticker: Data, background: Data, link: URL, appID: String, pasteboard: StoriesPasteboard,
                                 now: Date = .now, told: @MainActor () -> Void = {},
                                 pause: @MainActor (Duration) async -> Void = { try? await Task.sleep(for: $0) },
                                 open: @MainActor (URL) async -> Bool) async -> Bool {
        pasteboard.setItems(items(sticker: sticker, background: background, link: link), options: options(now: now))
        told()
        await pause(readPause)
        return await open(url(appID: appID))
    }
}
