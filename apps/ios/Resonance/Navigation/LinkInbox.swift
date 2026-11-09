import DesignSystem
import Foundation
import Observation
import ResonanceKit

/// Links into the app — a universal link tapped in another app (round 23 §7: the site's /card, /u, /messages and
/// /me/thought-map pages, apple-app-site-association), the Smart App Banner's 打開 — held until the tabs are here to
/// open them. SwiftUI hands both to `onOpenURL` (never as a browsing-web user activity), at the app's root, where
/// the URL lands on a cold launch too: before the tabs exist, under the launch cover, the restoring loader, a
/// sign-in or onboarding. ``MainTabView`` takes it once it shows (as it takes a tapped push), so a link survives
/// all of those and opens once.
@Observable
final class LinkInbox {
    /// The link waiting for the tabs (the latest one, should two come before they show).
    var pending: URL?
    /// The last link received and when: the same link handed over twice in a moment (two routes delivering one
    /// tap) opens once.
    @ObservationIgnored private var last: (url: URL, at: Date)?

    /// A link for the app: Google's sign-in callback is Google's (`signIn` says whether it took it); anything else
    /// waits for the tabs.
    func receive(_ url: URL, now: Date = .now, signIn: (URL) -> Bool) {
        if signIn(url) { return }
        if let last, last.url == url, now.timeIntervalSince(last.at) < Self.repeatWindow { return }
        last = (url, now)
        pending = url
    }

    /// The link waiting, once (nil after).
    func take() -> URL? {
        defer { pending = nil }
        return pending
    }

    static let repeatWindow: TimeInterval = 1
}

/// What a link into the app opens.
enum IncomingLink: Equatable {
    /// A page the app shows itself.
    case route(Route)
    /// A site page under a path the association claims that the app can't show (`/card/a/b`): the in-app browser,
    /// so a link never goes nowhere.
    case browser(URL)
    /// Nothing more than the app coming to the front (the landing page's banner, /about, another scheme).
    case none

    static func of(_ url: URL, origin: URL) -> IncomingLink {
        // The site's own pages only, http(s) on its hosts: a URL of another scheme (one Google's sign-in declined — the
        // app registers no scheme of its own) or with no host opens nothing, though a route would take its path.
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host(), StoryLink.isSiteHost(host, origin: origin)
        else { return .none }
        if let route = Route(url: url, origin: origin) { return .route(route) }
        return claims(url.path(percentEncoded: false)) ? .browser(url) : .none
    }

    /// The paths apple-app-site-association (and Android's App Links filter) hand to the app: /card/…, /u/…,
    /// /messages/… and /me/thought-map, bare or under /en or /zh-TW.
    static func claims(_ path: String) -> Bool {
        var parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        if let first = parts.first, ["en", "zh-TW"].contains(first) { parts.removeFirst() }
        guard let section = parts.first else { return false }
        switch section {
        case "card", "u", "messages": return parts.count > 1
        case "me": return parts.count == 2 && parts[1] == "thought-map"
        default: return false
        }
    }
}
