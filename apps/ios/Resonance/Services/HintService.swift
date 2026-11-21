import FirebaseFirestore
import Foundation
import ResonanceKit

/// The web's first-time hints (lib/hints.ts): a hint shows for its first
/// three displays, then stays quiet. The count lives on the device
/// (`hint:{key}`, as the web's localStorage) and is mirrored to the profile's
/// `hintsSeen` map, so a hint seen on the web counts here too — through PATCH /me with `features.apiSocial`
/// (Phase 2 of the middleware decouple: the server keeps the larger count per key), else on the profile document
/// itself (the older path, kept one release).
struct HintService {
    /// HINT_LIMIT.
    static let limit = 3
    let uid: String
    /// The `/api/v1` path; nil: Firestore.
    var social: SocialAPI? = nil
    /// The account's profile as the API reads it (GET /me's `hintsSeen`).
    var profile: ProfileAPI? = nil

    /// Whether to show the hint this time — asking counts as one display.
    func claim(_ key: String) async -> Bool {
        let defaults = UserDefaults.standard
        let localKey = "hint:\(key)"
        if let social {
            let seen = (try? await profile?.me())??.hintsSeen?.additionalProperties[key] ?? 0
            let count = max(defaults.integer(forKey: localKey), seen)
            guard count < Self.limit else { return false }
            defaults.set(count + 1, forKey: localKey)
            // Best effort, as below.
            _ = try? await social.updateMe(hintsSeen: [key: count + 1])
            return true
        }
        let user = FirebaseBootstrap.db.collection("users").document(uid)
        let hintsSeen = (try? await user.getDocument())?.data()?["hintsSeen"] as? [String: Any]
        let count = max(defaults.integer(forKey: localKey), (hintsSeen?[key] as? NSNumber)?.intValue ?? 0)
        guard count < Self.limit else { return false }
        defaults.set(count + 1, forKey: localKey)
        // Best effort, like syncHintCount: the device's count still governs here.
        try? await user.updateData(["hintsSeen.\(key)": count + 1])
        return true
    }
}
