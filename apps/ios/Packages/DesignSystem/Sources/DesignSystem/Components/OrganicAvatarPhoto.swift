import Nuke
import NukeUI
import SwiftUI

/// A photo cover-fitted into exactly the room it is offered (the web's `object-fit: cover`, Android's
/// `ContentScale.Crop` in a sized box). The room is taken first and the picture laid over it: a bare
/// `scaledToFill()` reports the picture's own proportions, so a photo stored before avatars were cut
/// square (a tall one) stood taller than its avatar and its clip ran down past the rim.
/// Decoded at the size it is drawn (`side` points, at 3×), never the whole cover or photo (audit I2).
struct OrganicAvatarPhoto: View {
    let url: URL
    /// Asked for once when `url` fails (a card thumb's smaller cover → the cover itself, B2).
    var fallback: URL? = nil
    let side: CGFloat
    var body: some View {
        Color.clear
            .overlay {
                CoverLazyImage(url: url, fallback: fallback, request: { ImageSizeBuckets.request($0, square: side) }) { image, _, _ in
                    if let image { image.resizable().scaledToFill() }
                }
            }
            .clipped()
    }
}
