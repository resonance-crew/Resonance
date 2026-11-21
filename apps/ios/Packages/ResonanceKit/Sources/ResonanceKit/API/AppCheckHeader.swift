import Foundation
import HTTPTypes
import OpenAPIRuntime
import Synchronization

/// The app's current Firebase App Check token, as the app last heard it
/// (App Attest in release builds; see FirebaseBootstrap). The API only
/// watches it for now — nothing is refused without one — so a request never
/// waits for a token: it carries the one at hand, or none.
public enum AppCheckHeader {
    public static let name = HTTPField.Name("X-Firebase-AppCheck")!

    private static let token = Mutex<String?>(nil)

    /// The token to send from now on (nil: none).
    public static func set(_ value: String?) {
        token.withLock { $0 = value?.isEmpty == false ? value : nil }
    }

    public static var current: String? { token.withLock { $0 } }
}

extension URLRequest {
    /// Adds `X-Firebase-AppCheck` when `token` is at hand (nil or empty: the request goes
    /// without — App Check is only watched, so a call never waits for or fails on one). The
    /// web's routes outside the contract (/api/upload, /api/generate-image, /api/cards/*,
    /// /api/account/*) take it here as v1 takes it from `AppCheckMiddleware`, the way
    /// Android's one OkHttp client gives it to every /api/ call.
    mutating func attachAppCheck(_ token: String?) {
        guard let token, !token.isEmpty else { return }
        setValue(token, forHTTPHeaderField: AppCheckHeader.name.rawName)
    }
}

/// Adds `X-Firebase-AppCheck` when the app has a token at hand.
struct AppCheckMiddleware: ClientMiddleware {
    let token: @Sendable () -> String?

    init(token: @escaping @Sendable () -> String? = { AppCheckHeader.current }) {
        self.token = token
    }

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let value = token() else { return try await next(request, body, baseURL) }
        var attested = request
        attested.headerFields[AppCheckHeader.name] = value
        return try await next(attested, body, baseURL)
    }
}
