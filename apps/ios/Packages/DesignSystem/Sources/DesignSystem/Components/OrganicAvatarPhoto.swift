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
    let side: CGFloat
    var body: some View {
        Color.clear
            .overlay {
                LazyImage(request: ImageSizeBuckets.request(url, square: side)) { state in
                    if let image = state.image { image.resizable().scaledToFill() }
                }
            }
            .clipped()
    }
}
