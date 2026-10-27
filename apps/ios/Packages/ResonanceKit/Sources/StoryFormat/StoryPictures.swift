import Foundation

/// Which story pictures the reader draws: one on the site's own host or a host under it (stored
/// pictures are on img.<site>), one written into the story (`data:image/`), or a path of the site's.
/// Any other is shown as a link the reader opens on purpose: a picture elsewhere is fetched by every
/// reader's device the moment the story opens, and its address, app and the time go to whoever runs
/// that host — an anonymous card's author too, on the page their notification opens. The web's
/// StoryMarkdown (`drawnPicture`) and the Android kit keep the same rule. A host is read as the
/// image loader will fetch it (Foundation's URL).
public nonisolated enum StoryPictures {
    /// The site's host (the API origin's), set once by the app's session; until then every picture is drawn.
    nonisolated(unsafe) public static var siteHost: String?
    /// A site for the current task only, over `siteHost` (tests, which run side by side).
    @TaskLocal public static var scopedSite: String?

    public static func drawn(_ url: String) -> Bool {
        guard let site = scopedSite ?? siteHost else { return true }
        let u = url.trimmingCharacters(in: .whitespaces)
        if u.lowercased().hasPrefix("data:image/") { return true }
        if u.hasPrefix("/"), !u.hasPrefix("//"), !u.hasPrefix("/\\") { return true }
        guard let parsed = URL(string: u), let scheme = parsed.scheme?.lowercased(), scheme == "https" || scheme == "http",
              var host = parsed.host(percentEncoded: false)?.lowercased() else { return false }
        while host.hasSuffix(".") { host.removeLast() }
        return host == site || host.hasSuffix("." + site)
    }
}
