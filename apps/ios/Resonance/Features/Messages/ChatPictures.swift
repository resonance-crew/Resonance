import Foundation
import ImageIO
import ResonanceKit
import UIKit
import UniformTypeIdentifiers

// Pictures in chat (round 7 §4): what the composer makes of a picture picked from the library, and
// the pictures of the account's conversations as the thread draws them.

/// A picture picked for the next message: what is uploaded and the picture drawn meanwhile.
nonisolated struct PickedPicture: Equatable, Sendable {
    let upload: Outbox.Picture
    /// The picture itself, drawn above the field and — once sent — in the thread until the server has it.
    let preview: UIImage
}

/// Readies a picture from the photo library for sending (round 7 §4.1): the server takes JPEG, PNG,
/// WebP and GIF up to 4 MB, so a GIF that fits goes as it is (it stays animated) and anything else —
/// HEIC included — is made a JPEG at most 2048 px on its longest side, upright, at 0.85 (less, step by
/// step, for a picture that would still be over the limit). Nil for bytes that are no picture.
nonisolated enum ChatPictures {
    static let maxBytes = 4 * 1024 * 1024
    static let maxSide = 2048
    static let qualities: [CGFloat] = [0.85, 0.75, 0.65, 0.5]

    static func prepare(_ data: Data) -> PickedPicture? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else { return nil }
        if isGIF(data), data.count <= maxBytes, let size = pixelSize(source), let first = CGImageSourceCreateImageAtIndex(source, 0, nil) {
            return PickedPicture(upload: Outbox.Picture(data: data, contentType: "image/gif", width: size.width, height: size.height),
                                 preview: UIImage(cgImage: first))
        }
        // Upright (the photo's own orientation applied) and no larger than the server keeps it.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let picture = UIImage(cgImage: image)
        for quality in qualities {
            guard let jpeg = picture.jpegData(compressionQuality: quality) else { return nil }
            if jpeg.count <= maxBytes || quality == qualities.last {
                return PickedPicture(upload: Outbox.Picture(data: jpeg, contentType: "image/jpeg", width: image.width, height: image.height),
                                     preview: picture)
            }
        }
        return nil
    }

    static func isGIF(_ data: Data) -> Bool {
        data.starts(with: Array("GIF87a".utf8)) || data.starts(with: Array("GIF89a".utf8))
    }

    private static func pixelSize(_ source: CGImageSource) -> (width: Int, height: Int)? {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue, width > 0, height > 0
        else { return nil }
        return (width, height)
    }
}

/// The pictures of the account's conversations (round 7 §4.3), read through the API with the
/// viewer's credentials — never a plain image loader: GET /api/v1/chat-images/{id}, the thread's size
/// for a bubble, as kept for the viewer — decoded off the main thread and kept in memory, the
/// account's HTTP cache keeping the bytes (they never change). A picture sent from here is drawn
/// from the device under the id the server keeps it by (`keep`), until a read replaces it. One read
/// at a time per picture and size; a picture that couldn't be read is asked for again only when the
/// screen says so. Emptied when another account signs in.
@MainActor final class ChatImageStore {
    enum Size: String, Sendable { case thumb, full }

    typealias Fetch = @Sendable (_ id: String, _ size: Size) async throws -> Data

    private let cache = NSCache<NSString, UIImage>()
    private var reads: [String: (id: Int, task: Task<UIImage?, Never>)] = [:]
    private var nextRead = 0
    private var life = 0
    private let fetch: Fetch
    /// How many reads went to the server (a test's count).
    private(set) var fetches = 0

    init(fetch: @escaping Fetch) {
        self.fetch = fetch
        // Decoded pictures: a thread's worth, then the oldest go (their bytes stay in the HTTP cache).
        cache.totalCostLimit = 96 * 1024 * 1024
    }

    /// The picture, if it is at hand now.
    func cached(_ id: String, _ size: Size) -> UIImage? {
        cache.object(forKey: Self.key(id, size) as NSString)
    }

    /// The picture at `size`, read if it isn't at hand — nil when it couldn't be (offline, the server's
    /// trouble, or gone: a conversation deleted takes its pictures with it).
    func image(_ id: String, _ size: Size) async -> UIImage? {
        if let kept = cached(id, size) { return kept }
        let key = Self.key(id, size)
        if let read = reads[key] { return await read.task.value }
        nextRead += 1
        let read = nextRead
        let started = life
        let fetch = fetch
        fetches += 1
        let task = Task<UIImage?, Never> {
            guard let data = try? await fetch(id, size) else { return nil }
            return await Self.decode(data)
        }
        reads[key] = (read, task)
        let image = await task.value
        if reads[key]?.id == read { reads[key] = nil }
        if let image, started == life { remember(image, key) }
        return image
    }

    /// A picture sent from here, drawn from the device under the id the server keeps it by (the
    /// message's client id) at either size, until the server's own is read.
    func keep(_ image: UIImage, for id: String) {
        remember(image, Self.key(id, .thumb))
        remember(image, Self.key(id, .full))
    }

    /// Another account: nothing of this one's pictures stays in memory.
    func clear() {
        life += 1
        cache.removeAllObjects()
        reads.values.forEach { $0.task.cancel() }
        reads = [:]
    }

    private func remember(_ image: UIImage, _ key: String) {
        let pixels = (image.cgImage.map { $0.width * $0.height } ?? Int(image.size.width * image.size.height * image.scale * image.scale))
        cache.setObject(image, forKey: key as NSString, cost: pixels * 4)
    }

    private static func key(_ id: String, _ size: Size) -> String { "\(id)|\(size.rawValue)" }

    /// Decoded off the main thread, ready to draw.
    nonisolated private static func decode(_ data: Data) async -> UIImage? {
        await Task.detached(priority: .userInitiated) { UIImage(data: data)?.preparingForDisplay() }.value
    }
}

/// How big a picture is drawn in its bubble (round 7 §4.3): its shape from its size as kept, so
/// nothing moves when it arrives — as wide as a bubble may be, at most 320 tall, the shown shape
/// held between 1:2 and 2:1 (the picture cover-cropped past that). A picture of unknown size is square.
nonisolated enum MessagePictureSize {
    static let maxHeight: CGFloat = 320
    static let narrowest: CGFloat = 0.5
    static let widest: CGFloat = 2

    static func of(width: Int, height: Int, maxWidth: CGFloat) -> CGSize {
        let aspect = width > 0 && height > 0 ? min(widest, max(narrowest, CGFloat(width) / CGFloat(height))) : 1
        let shownWidth = min(maxWidth, maxHeight * aspect)
        return CGSize(width: shownWidth.rounded(), height: (shownWidth / aspect).rounded())
    }
}
