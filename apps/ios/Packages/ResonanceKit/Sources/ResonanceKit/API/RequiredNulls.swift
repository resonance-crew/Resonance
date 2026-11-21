import Foundation
import HTTPTypes
import OpenAPIRuntime

/// A request field the contract requires but lets be `null` (round 27's `TapPassageRequest.passage`: null clears the
/// pick) is a Swift optional in the generated types, and the generated encoder drops a nil one — `{}` instead of
/// `{"passage":null}`, which the server refuses (400: the field is required). Every request passes through here, and
/// such a field missing from a JSON object body is written back as `null` (`RequiredNulls.fields`, by operation).
public struct RequiredNullsMiddleware: ClientMiddleware {
    public init() {}

    public func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let keys = RequiredNulls.fields[operationID], let body else { return try await next(request, body, baseURL) }
        let data = try await Data(collecting: body, upTo: 1024 * 1024)
        return try await next(request, HTTPBody(RequiredNulls.fill(data, keys: keys)), baseURL)
    }
}

public enum RequiredNulls {
    /// The operations whose request body has a required, nullable field, and those fields.
    static let fields: [String: [String]] = [
        "setTapPassage": ["passage"],
    ]

    /// `data` with each of `keys` it lacks set to null; anything but a JSON object is left as it is.
    static func fill(_ data: Data, keys: [String]) -> Data {
        guard var object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return data }
        let missing = keys.filter { object[$0] == nil }
        guard !missing.isEmpty else { return data }
        for key in missing { object[key] = NSNull() }
        return (try? JSONSerialization.data(withJSONObject: object)) ?? data
    }
}
