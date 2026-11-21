import Foundation
import ResonanceAPI

/// Which paths this build takes (GET /api/v1/client-config `features`, Phase 2 of the middleware decouple): each
/// converged read or write goes through `/api/v1` when its flag is on, and through its older Firestore path when it is
/// off — the server's rollback for apps already installed. A build that never heard the server takes every old path
/// (`oldPaths`); the old paths stay in the app for one release.
public struct ClientFeatures: Codable, Equatable, Sendable {
    /// One Firestore listener on `signals/{uid}` drives the converged lists (else they pull every 60 s only).
    public var signals: Bool
    /// Blocks, bookmarks, hints, the avatar, people and connections.
    public var apiSocial: Bool
    /// The conversations list and the thread.
    public var apiInbox: Bool
    /// The bell.
    public var apiBell: Bool
    public var apiThoughtMap: Bool
    public var apiDrafts: Bool

    public init(signals: Bool = false, apiSocial: Bool = false, apiInbox: Bool = false, apiBell: Bool = false,
                apiThoughtMap: Bool = false, apiDrafts: Bool = false) {
        self.signals = signals
        self.apiSocial = apiSocial
        self.apiInbox = apiInbox
        self.apiBell = apiBell
        self.apiThoughtMap = apiThoughtMap
        self.apiDrafts = apiDrafts
    }

    /// Never fetched: every path as the build before this one took it.
    public static let oldPaths = ClientFeatures()

    /// Some converged list is read through the API: the 60 s safety pull runs.
    public var pullsFromAPI: Bool { apiSocial || apiInbox || apiBell }

    init(_ features: Components.Schemas.ClientFeatures) {
        self.init(signals: features.signals, apiSocial: features.apiSocial, apiInbox: features.apiInbox,
                  apiBell: features.apiBell, apiThoughtMap: features.apiThoughtMap, apiDrafts: features.apiDrafts)
    }
}

/// What the server last said to this platform's builds: the oldest build it still serves (`minBuild`), the one it
/// would like everyone on (`recommendedBuild`), and the paths to take.
public struct ClientSettings: Codable, Equatable, Sendable {
    public var minBuild: Int
    public var recommendedBuild: Int
    public var features: ClientFeatures

    public init(minBuild: Int = 0, recommendedBuild: Int = 0, features: ClientFeatures = .oldPaths) {
        self.minBuild = minBuild
        self.recommendedBuild = recommendedBuild
        self.features = features
    }

    /// Never fetched (a first launch offline): no build is too old, every path the old one.
    public static let unfetched = ClientSettings()

    /// The iOS (and Mac Catalyst: the same build) numbers of an answer.
    public init(ios config: Components.Schemas.ClientConfig) {
        self.init(minBuild: config.minBuild.ios, recommendedBuild: config.recommendedBuild.ios,
                  features: ClientFeatures(config.features))
    }

    /// What this build is asked to do about its age. `build` is CFBundleVersion as a number; one that doesn't read
    /// as one (nil) is never told it is too old — a build that can't count must not lock its reader out.
    public func update(forBuild build: Int?) -> UpdateNeed {
        guard let build else { return .none }
        if build < minBuild { return .required }
        if build < recommendedBuild { return .recommended(recommendedBuild) }
        return .none
    }
}

/// The update screen's decision.
public enum UpdateNeed: Equatable, Sendable {
    case none
    /// A newer build is out: a note the reader may put off (`later`), once per recommended build.
    case recommended(Int)
    /// This build is below `minBuild`: nothing but the update screen.
    case required

    /// CFBundleVersion as a whole number ("16"); a dotted one ("16.1") counts by its first part.
    public static func build(_ bundleVersion: String?) -> Int? {
        guard let first = bundleVersion?.split(separator: ".").first else { return nil }
        return Int(first)
    }
}

/// GET /api/v1/client-config (public: no sign-in needed).
public struct ClientConfigAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func fetch() async throws -> ClientSettings {
        switch try await client.getClientConfig() {
        case let .ok(r): return ClientSettings(ios: try r.body.json)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

/// The last answer, on disk: the next launch starts from it (an update screen at once, the paths it named) before
/// the network has said anything. A file that is missing or unreadable is `unfetched`.
public struct ClientSettingsFile: Sendable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    /// The app's: Application Support, kept across launches (not a cache the system may empty under it).
    public static func standard() -> ClientSettingsFile {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ClientSettingsFile(url: support.appending(path: "client-config.json"))
    }

    /// The kept answer, or nil when none was ever kept.
    public func load() -> ClientSettings? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(ClientSettings.self, from: data)
    }

    public func save(_ settings: ClientSettings) {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: url, options: .atomic)
    }
}
