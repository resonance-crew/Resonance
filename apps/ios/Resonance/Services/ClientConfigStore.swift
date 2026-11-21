import Foundation
import Observation
import ResonanceKit

/// What the server says to this build (GET /api/v1/client-config, Phase 2 of the middleware decouple): which paths
/// to take (`features`: the converged `/api/v1` path, or the older Firestore one — the server's rollback) and whether
/// this build is too old (`need`: the update screen below `minBuild`, a note below `recommendedBuild`).
///
/// Asked at launch and on each return to the foreground, at most once every `throttle`; the last answer is kept on
/// disk, so the next launch starts from it. A build that never heard an answer takes every old path and is never
/// too old.
@MainActor @Observable
final class ClientConfigStore {
    /// A return to the foreground asks again only after this long.
    static let throttle: TimeInterval = 5 * 60
    /// The recommended build the reader said 稍後再說 to (they are asked again for a later one).
    static let laterKey = "clientConfig.laterBuild"

    private(set) var settings: ClientSettings
    /// This run heard the server (else `settings` is the kept answer, or none).
    private(set) var fetched = false
    /// The recommended build put off.
    private(set) var laterBuild: Int

    /// This build's number (CFBundleVersion).
    let build: Int?
    /// Told when an answer changes the paths (the session restarts what reads through them).
    @ObservationIgnored var onFeaturesChange: ((ClientFeatures) -> Void)?

    @ObservationIgnored private let file: ClientSettingsFile
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let fetch: @Sendable () async throws -> ClientSettings
    @ObservationIgnored private var lastAsked: Date?
    @ObservationIgnored private var asking = false

    init(file: ClientSettingsFile = .standard(), defaults: UserDefaults = .standard,
         build: Int? = UpdateNeed.build(Bundle.main.infoDictionary?["CFBundleVersion"] as? String),
         fetch: @escaping @Sendable () async throws -> ClientSettings) {
        self.file = file
        self.defaults = defaults
        self.build = build
        self.fetch = fetch
        settings = file.load() ?? .unfetched
        laterBuild = defaults.integer(forKey: Self.laterKey)
    }

    var features: ClientFeatures { settings.features }

    /// What this build is asked to do about its age.
    var need: UpdateNeed { settings.update(forBuild: build) }

    /// Below `minBuild`: nothing but the update screen.
    var updateRequired: Bool { need == .required }

    /// A newer build is out and the reader hasn't put this one off.
    var recommendsUpdate: Bool {
        if case let .recommended(newer) = need { return newer > laterBuild }
        return false
    }

    /// 稍後再說: the note goes until a newer build is recommended.
    func later() {
        guard case let .recommended(newer) = need else { return }
        laterBuild = newer
        defaults.set(newer, forKey: Self.laterKey)
    }

    /// Asks the server (at launch, and coming back after `throttle`; `force` whatever the time). A failure keeps
    /// what was known, and the next return asks again.
    func refresh(now: Date = .now, force: Bool = false) async {
        guard !asking else { return }
        if !force, let lastAsked, now.timeIntervalSince(lastAsked) < Self.throttle { return }
        asking = true
        defer { asking = false }
        do {
            let answer = try await fetch()
            lastAsked = now
            fetched = true
            file.save(answer)
            apply(answer)
        } catch {
            #if DEBUG
            print("client-config failed: \(error)")
            #endif
        }
    }

    private func apply(_ answer: ClientSettings) {
        let before = settings.features
        guard answer != settings else { return }
        settings = answer
        if answer.features != before { onFeaturesChange?(answer.features) }
    }

    #if DEBUG
    /// Tests and screen checks: an answer as if the server had given it.
    func adopt(_ answer: ClientSettings) {
        fetched = true
        apply(answer)
    }
    #endif
}
