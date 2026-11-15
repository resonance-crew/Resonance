import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit

/// The contract's cover frame (`FeedCard.imageFrame`, round 25 §G1) and the stored one (`media.frame` on a card
/// or a draft, written straight to Firestore by the writer) as the design system draws them.
nonisolated enum CoverFrames {
    /// `media.frame` as a reader may use it — its four numbers in range — or nil (the centre).
    static func of(media: [String: Any]?) -> CoverFraming? {
        guard let f = media?["frame"] as? [String: Any] else { return nil }
        func num(_ k: String) -> Double? { (f[k] as? NSNumber)?.doubleValue }
        guard let cx = num("cx"), let cy = num("cy"), let zoom = num("zoom"), let ar = num("ar") else { return nil }
        let frame = CoverFraming(cx: cx, cy: cy, zoom: zoom, ar: ar)
        return frame.isValid ? frame : nil
    }

    /// The frame as `media.frame` stores it: exactly its four numbers (the rules' `validMedia` takes no other key).
    static func fields(_ frame: CoverFraming) -> [String: Any] {
        ["cx": frame.cx, "cy": frame.cy, "zoom": frame.zoom, "ar": frame.ar]
    }
}

extension Components.Schemas.CoverFrame {
    nonisolated var framing: CoverFraming? {
        let f = CoverFraming(cx: cx, cy: cy, zoom: zoom, ar: ar)
        return f.isValid ? f : nil
    }
}

extension FeedCard {
    /// Where its cover is looked at (`imageFrame`); nil draws it centred, as before round 25.
    nonisolated var coverFraming: CoverFraming? { imageFrame?.value1.framing }
}
