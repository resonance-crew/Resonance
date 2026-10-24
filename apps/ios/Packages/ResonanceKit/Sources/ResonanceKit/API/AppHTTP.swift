import Foundation

/// How every HTTP session the app makes is set up (the twin of Android's
/// AppHttp): how long a request may wait — less than URLSession's minute, still
/// room for the server's model-backed routes (tags, the insight, publishing's
/// slug) — and which app and version each request comes from.
public enum AppHTTP {
    /// Between two packets of an answer (the illustration's stream sets its own, longer one).
    public static let requestTimeout: TimeInterval = 30
    /// For the calls whose answer can take longer (emptying the trash: a page of deletes, round 8
    /// §6.2) — past the 30 s the server's page could outlast, an answer lost while it went on deleting.
    public static let slowRequestTimeout: TimeInterval = 70

    /// `Resonance/2.0.0 (iOS 18.5; build 3)`.
    public static func userAgent(version: String, build: String, os: String) -> String {
        "Resonance/\(version) (iOS \(os); build \(build))"
    }

    /// This build's, from the main bundle and the system.
    public static let userAgent: String = {
        let info = Bundle.main.infoDictionary
        let os = ProcessInfo.processInfo.operatingSystemVersion
        return userAgent(version: info?["CFBundleShortVersionString"] as? String ?? "0",
                         build: info?["CFBundleVersion"] as? String ?? "0",
                         os: "\(os.majorVersion).\(os.minorVersion)" + (os.patchVersion > 0 ? ".\(os.patchVersion)" : ""))
    }()

    /// Applies the app's timeout and User-Agent to `configuration`.
    public static func configure(_ configuration: URLSessionConfiguration) {
        configuration.timeoutIntervalForRequest = requestTimeout
        var headers = configuration.httpAdditionalHeaders ?? [:]
        headers["User-Agent"] = userAgent
        configuration.httpAdditionalHeaders = headers
    }

    /// For calls no HTTP cache keeps (the account routes, the writer's helpers, a
    /// sign-out's last call): the app's settings, nothing stored.
    public static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configure(configuration)
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }()

    /// `session`, waiting `slowRequestTimeout` between packets: for the slow calls only, nothing stored.
    public static let slowSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configure(configuration)
        configuration.timeoutIntervalForRequest = slowRequestTimeout
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }()
}
