import Nuke
import SwiftUI
import UIKit

/// The share card made into pictures on the device (share.spec §4.7): `ImageRenderer` over the pure
/// SwiftUI views, its environment pinned (light, the default text size) — the picture is for other
/// people, whatever this phone's settings.
@MainActor public enum ShareCardRenderer {
    /// The 1080 × 1920 composite: opaque, sRGB, JPEG at the recipe's quality — a JPEG-backed image,
    /// so what is saved or sent is the JPEG.
    public static func composite(_ content: ShareCardContent) -> UIImage? {
        guard let image = render(ShareCardCanvas(content), scale: ShareCardRecipe.scale, opaque: true),
              let jpeg = image.jpegData(compressionQuality: ShareCardRecipe.jpegQuality) else { return nil }
        return UIImage(data: jpeg, scale: 1)
    }

    /// Instagram's sticker: the card alone on transparency, @2 (624 px wide), PNG.
    public static func sticker(_ content: ShareCardContent) -> Data? {
        render(ShareCardSticker(content), scale: ShareCardRecipe.stickerScale, opaque: false)?.pngData()
    }

    /// Instagram's background: the backdrop alone, 1080 × 1920 JPEG.
    public static func backdrop(palette: Int) -> Data? {
        render(ShareCardBackdrop(palette: palette), scale: ShareCardRecipe.scale, opaque: true)?
            .jpegData(compressionQuality: ShareCardRecipe.jpegQuality)
    }

    static func render(_ view: some View, scale: CGFloat, opaque: Bool) -> UIImage? {
        // A picture that leaves the device is light terracotta, whatever this device wears (spec §1.5).
        let renderer = ImageRenderer(content: view
            .environment(\.colorScheme, .light)
            .environment(\.accent, .terracotta)
            .environment(\.dynamicTypeSize, .large))
        renderer.scale = scale
        renderer.isOpaque = opaque
        return renderer.uiImage
    }
}

/// The pictures a share card holds, fetched through the app's image pipeline before it is drawn
/// (`ImageRenderer` draws no image still on its way): the page's cover is in its cache already.
public enum ShareCardImages {
    /// The picture at `url`, or nil — none, a failure, or no answer within `patience` (the card is
    /// then drawn without it: a share never waits on a slow cover).
    public static func load(_ url: URL?, patience: Duration = .milliseconds(1500)) async -> UIImage? {
        guard let url else { return nil }
        return await withTaskGroup(of: UIImage?.self) { group in
            group.addTask { try? await ImagePipeline.shared.image(for: url) }
            group.addTask {
                try? await Task.sleep(for: patience)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
