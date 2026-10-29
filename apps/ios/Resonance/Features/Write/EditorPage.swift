import CryptoKit
import Foundation
import WebKit

/// Where the story editor island lives inside its web view, and all it may
/// reach from there.
///
/// The page is served from the app bundle under a scheme of its own
/// (`resonance-editor://editor/editor.html`) by `EditorPageHandler`, which
/// answers for the page and its four fonts and nothing else — loaded as a
/// `file://` URL, the page could read anything in the bundle. Its
/// Content-Security-Policy lets it run only its own two inline scripts (by
/// hash), load only its own fonts and show https, data and blob images; it
/// can't fetch, frame, post a form or change its base URL. `EditorNavigation`
/// keeps the web view on the page. Against the emulators the pictures a story
/// holds are the dev server's own, over plain http (`/api/emulator-storage/…`):
/// an emulator build lets the page show those too (`imageSources`), and nothing
/// else — a release build never points at the emulators.
enum EditorPage {
    static let scheme = "resonance-editor"
    static let host = "editor"
    static let path = "/editor.html"
    /// The fonts the page's @font-face rules name (scripts/native/build-editor.mjs), in the bundle's fonts/.
    static let fonts: Set<String> = ["PlayfairDisplay.ttf", "DMSans.ttf", "NotoSansTC.ttf", "NotoSerifTC.ttf"]

    /// How the page lays the story out: in the old framed story field (`field`), or as the writer's
    /// bare page (`canvas`: no frame or padding of its own — the writing screen sizes and scrolls it).
    enum Layout: Equatable {
        case field, canvas
    }

    /// The page, as the writing screen embeds it. `locale` (the interface language) is the type an
    /// empty story starts in (`localeScript`); the island reads the story's own script from there.
    static func url(placeholder: String, layout: Layout = .field, locale: String? = nil) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = path
        var query = [
            URLQueryItem(name: "embed", value: "1"),
            URLQueryItem(name: "fonts", value: "fonts/"),
            URLQueryItem(name: "placeholder", value: placeholder),
        ]
        if layout == .canvas { query.append(URLQueryItem(name: "layout", value: "canvas")) }
        // The Mac app: the story's editable root fills its page, so a click anywhere under the words is a click in
        // the story itself (StoryCanvasField lays no tap area of its own there).
        if layout == .canvas, ProcessInfo.processInfo.isMacCatalystApp { query.append(URLQueryItem(name: "fill", value: "1")) }
        if let locale { query.append(URLQueryItem(name: "locale", value: locale)) }
        components.queryItems = query
        return components.url!
    }

    /// Whether `url` is the page itself (any query).
    static func isPage(_ url: URL) -> Bool {
        url.scheme?.lowercased() == scheme && url.host?.lowercased() == host && url.path == path
    }

    /// Where pictures may come from beyond https, data and blob: against the emulators, the dev
    /// server the app talks to — under both of its names, since what it stores names itself by
    /// `localhost` (dev-emulator.mjs) while the app asks `127.0.0.1` (round 11 §8: every picture
    /// put in a story showed as the island's broken placeholder on iOS, refused by `img-src https:`).
    /// Nothing in production, whose pictures are https.
    static func imageSources(for config: AppConfig) -> [String] {
        guard config.usesEmulator, config.origin.scheme == "http", let port = config.origin.port else { return [] }
        return ["http://localhost:\(port)", "http://127.0.0.1:\(port)"]
    }

    /// The policy for `html`: only its own inline scripts run; pictures from https, data, blob and
    /// `imageSources`.
    static func contentSecurityPolicy(for html: String, imageSources: [String] = []) -> String {
        let scripts = inlineScripts(in: html).map { "'sha256-\(Data(SHA256.hash(data: Data($0.utf8))).base64EncodedString())'" }
        return [
            "default-src 'none'",
            "script-src \(scripts.isEmpty ? "'none'" : scripts.joined(separator: " "))",
            // The font loader's <style>, ProseMirror's and the island's inline styles.
            "style-src 'unsafe-inline'",
            "font-src \(scheme):",
            // Story photos (R2, over https); pasted or dropped ones may be data: or blob:.
            (["img-src https: data: blob:"] + imageSources).joined(separator: " "),
            "base-uri 'none'",
            "form-action 'none'",
        ].joined(separator: "; ")
    }

    /// The text of each `<script>` without attributes (the build inlines both of its scripts so).
    static func inlineScripts(in html: String) -> [String] {
        var scripts: [String] = []
        var rest = html[...]
        while let open = rest.range(of: "<script>"), let close = rest.range(of: "</script>", range: open.upperBound..<rest.endIndex) {
            scripts.append(String(rest[open.upperBound..<close.lowerBound]))
            rest = rest[close.upperBound...]
        }
        return scripts
    }

    /// The page as served: its policy also as a meta element, ahead of anything that runs.
    static func served(_ html: String, policy: String) -> String {
        let meta = #"<meta http-equiv="Content-Security-Policy" content="\#(policy)">"#
        guard let head = html.range(of: "<head>") else { return meta + html }
        return html.replacingCharacters(in: head, with: "<head>\n" + meta)
    }
}

/// Answers the editor page's requests from the app bundle: the page (with
/// its policy) and its fonts. Anything else it asks for doesn't exist.
final class EditorPageHandler: NSObject, WKURLSchemeHandler {
    struct Resource {
        let data: Data
        let headers: [String: String]
    }

    private let bundle: Bundle
    private let imageSources: [String]

    init(bundle: Bundle = .main, imageSources: [String] = EditorPage.imageSources(for: .current)) {
        self.bundle = bundle
        self.imageSources = imageSources
    }

    /// The page, read and hashed once per launch (not once per writer opened): the same bundle and
    /// image sources always serve the same page.
    private var page: Resource? {
        let key = "\(bundle.bundlePath)\n\(imageSources.joined(separator: " "))"
        if let kept = Self.pages[key] { return kept }
        let page = Self.read(bundle: bundle, imageSources: imageSources)
        if let page { Self.pages[key] = page }
        return page
    }

    /// Each page served, by its bundle and image sources.
    private static var pages: [String: Resource] = [:]

    private static func read(bundle: Bundle, imageSources: [String]) -> Resource? {
        guard let file = bundle.url(forResource: "editor", withExtension: "html"),
              let html = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        let policy = EditorPage.contentSecurityPolicy(for: html, imageSources: imageSources)
        return Resource(data: Data(EditorPage.served(html, policy: policy).utf8), headers: [
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": policy,
            "Cache-Control": "no-store",
        ])
    }

    /// What `url` names, if it's something the page may load.
    func resource(for url: URL) -> Resource? {
        guard url.scheme?.lowercased() == EditorPage.scheme, url.host?.lowercased() == EditorPage.host else { return nil }
        if url.path == EditorPage.path { return page }
        let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].isEmpty, parts[1] == "fonts", EditorPage.fonts.contains(String(parts[2])),
              let file = bundle.url(forResource: String(parts[2]), withExtension: nil, subdirectory: "fonts"),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else { return nil }
        return Resource(data: data, headers: ["Content-Type": "font/ttf", "Cache-Control": "no-store"])
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url, let resource = resource(for: url),
              let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: resource.headers) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        task.didReceive(response)
        task.didReceive(resource.data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

/// Where the editor's web view may go: nowhere but its page. A web link the
/// writer taps in the story (the editor opens it as the web's does) shows in
/// the in-app browser; anything else — a script sending the page away, a
/// frame, a file — is refused.
enum EditorNavigation: Equatable {
    case allow
    case cancel
    case openInBrowser(URL)

    /// - Parameters:
    ///   - mainFrame: the navigation is the page's own (not a frame's).
    ///   - tapped: the writer asked for it (a link they tapped, a window the editor opened for a tap).
    static func decide(_ url: URL?, mainFrame: Bool, tapped: Bool) -> EditorNavigation {
        guard let url else { return .cancel }
        if EditorPage.isPage(url) { return mainFrame ? .allow : .cancel }
        let scheme = url.scheme?.lowercased()
        if tapped, scheme == "http" || scheme == "https", url.host?.isEmpty == false { return .openInBrowser(url) }
        return .cancel
    }
}
