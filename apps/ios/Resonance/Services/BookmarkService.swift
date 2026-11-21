import FirebaseFirestore
import Foundation
import ResonanceKit

/// Bookmarks (收藏): users/{uid}/bookmarks/{cardId}, owner-only, never counted and never notified. With
/// `features.apiSocial` (Phase 2 of the middleware decouple) through `/api/v1` — PUT/DELETE /me/bookmarks/{cardId},
/// whether one is kept read from the card itself (`CardDetail.bookmarked`); otherwise written straight to Firestore
/// like the web's client did (lib/db/firestore/client/bookmarks.ts), the older path kept one release.
struct BookmarkService {
    let uid: String
    /// Told after a bookmark is added or removed (the card box's shelf of them comes from the API).
    var onWrite: @Sendable () -> Void = {}
    /// The `/api/v1` path; nil: Firestore.
    var social: SocialAPI? = nil
    /// The card as the API reads it (the API path's `isBookmarked`).
    var reading: ReadingAPI? = nil
    private var db: Firestore { FirebaseBootstrap.db }

    /// Which path this service takes.
    var usesAPI: Bool { social != nil }

    private func ref(_ cardId: String) -> DocumentReference {
        db.collection("users").document(uid).collection("bookmarks").document(cardId)
    }

    func isBookmarked(_ cardId: String) async throws -> Bool {
        if social != nil, let reading {
            return try await reading.card(cardId).bookmarked ?? false
        }
        return try await ref(cardId).getDocument().exists
    }

    /// Flips the bookmark; the doc id is the card id, so this is idempotent.
    /// Returns the new state.
    func toggle(_ cardId: String) async throws -> Bool {
        if social != nil {
            return try await set(cardId, saved: !(try await isBookmarked(cardId)))
        }
        let doc = ref(cardId)
        defer { onWrite() }
        if try await doc.getDocument().exists {
            try await doc.delete()
            return false
        }
        try await doc.setData(["cardId": cardId, "createdAt": FieldValue.serverTimestamp()])
        return true
    }

    /// The API path: the bookmark as the reader now wants it (the state the screen already shows — nothing read
    /// first; PUT and DELETE are idempotent). The older path flips (`toggle`). Returns the state it has.
    func set(_ cardId: String, saved: Bool) async throws -> Bool {
        guard let social else { return try await toggle(cardId) }
        defer { onWrite() }
        if saved { try await social.bookmark(cardId) } else { try await social.removeBookmark(cardId) }
        return saved
    }
}
