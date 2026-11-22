#if DEBUG
import Foundation
import HTTPTypes
import OpenAPIRuntime
import os

/// The release screenshots' "this screen is drawn" (scripts/visual/ios.ts, mac.ts): without it, a capture waited
/// a fixed 4 s after each launch (10 s after an account's sign-in launch) before it trusted a frame. With it, the app
/// says when the screen is quiet and the harness goes on at once, to a short settle; if this never comes, the
/// harness waits as it always did.
///
/// Quiet: at least one /api/v1 call has answered since the launch, none is on its way (``VisualReadyMiddleware``),
/// no skeleton block or picture placeholder is on screen (DesignSystem's `SkeletonBlock`, through the app's
/// `PlaceholderWatch`), and all of that has held for ``quiet``. Said once a launch, as `ready <token>` in the unified
/// log (subsystem ``subsystem``, public), the token the harness launched with (`-visualReadyToken`), so a line from an
/// earlier launch never counts. The harness reads it with `log stream` (the Mac) or `simctl spawn … log stream`
/// (the simulator): no file in the app's container, which the Mac's sandbox keeps other processes out of.
///
/// Debug builds only (this file is not in a release build), and only when a launch asks for it (``start``).
public final class VisualReady: @unchecked Sendable {
    public static let shared = VisualReady()
    public static let quiet: TimeInterval = 0.8

    private let lock = NSLock()
    private var enabled = false
    private var token = ""
    private var inFlight = 0
    private var placeholders = 0
    private var answered = 0
    private var generation = 0
    private var said = false
    private var schedule: @Sendable (TimeInterval, @escaping @Sendable () -> Void) -> Void = { _, _ in }
    private var say: @Sendable (String) -> Void = { _ in }

    public init() {}

    /// The unified log's subsystem the word is said under (scripts/visual/ready.ts reads it).
    public static let subsystem = "com.resonance.visual"
    private static let log = Logger(subsystem: subsystem, category: "ready")

    /// The default way to tell the harness: `words` in the unified log, public, under ``subsystem``.
    @Sendable public static func logReady(_ words: String) {
        log.notice("\(words, privacy: .public)")
    }

    /// Starts listening for this launch. `schedule` runs something later (the main queue by default), `say` tells the
    /// harness (the unified log by default).
    public func start(
        token: String,
        schedule: @escaping @Sendable (TimeInterval, @escaping @Sendable () -> Void) -> Void = { delay, run in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { run() }
        },
        say: @escaping @Sendable (String) -> Void = VisualReady.logReady
    ) {
        lock.withLock {
            self.token = token
            self.schedule = schedule
            self.say = say
            inFlight = 0
            placeholders = 0
            answered = 0
            generation = 0
            said = false
            enabled = true
        }
    }

    public func stop() { lock.withLock { enabled = false } }

    public var isEnabled: Bool { lock.withLock { enabled } }

    /// A call leaves; answers whether it was counted (only a counted one may ``requestEnded()``).
    public func requestStarted() -> Bool {
        lock.withLock {
            guard enabled else { return false }
            inFlight += 1
            generation += 1
            return true
        }
    }

    public func requestEnded() {
        changed { inFlight = max(0, inFlight - 1); answered += 1 }
    }

    /// A skeleton block or a picture's placeholder came on screen (+1) or went (-1).
    public func placeholder(_ delta: Int) {
        changed { placeholders = max(0, placeholders + delta) }
    }

    private func changed(_ update: () -> Void) {
        let due: (Int, @Sendable (TimeInterval, @escaping @Sendable () -> Void) -> Void)? = lock.withLock {
            guard enabled else { return nil }
            update()
            generation += 1
            guard !said, inFlight == 0, placeholders == 0, answered > 0 else { return nil }
            return (generation, schedule)
        }
        guard let (at, schedule) = due else { return }
        schedule(Self.quiet) { [self] in settle(at) }
    }

    private func settle(_ at: Int) {
        let words: (String, @Sendable (String) -> Void)? = lock.withLock {
            guard enabled, !said, at == generation, inFlight == 0, placeholders == 0 else { return nil }
            said = true
            return (token, say)
        }
        if let (token, say) = words { say("ready \(token)") }
    }
}

/// Counts every /api/v1 call on its way for ``VisualReady`` (nothing unless a launch asked for it).
public struct VisualReadyMiddleware: ClientMiddleware {
    public init() {}

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let counted = VisualReady.shared.requestStarted()
        defer { if counted { VisualReady.shared.requestEnded() } }
        return try await next(request, body, baseURL)
    }
}
#endif
