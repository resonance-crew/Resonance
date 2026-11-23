import Foundation
import Nuke

/// How much memory the decoded pictures may keep (Nuke's `ImageCache.shared`, the one `ImagePipeline.shared` reads).
/// Nuke's own default is 15 % of the device's memory, up to 768 MB — on a 6 GB iPhone the whole 768 MB, beside
/// Firebase, the editor's and the puppets' web views and the system's own share, which is how an app is ended in the
/// background or in a long scroll. 8 % of the memory, between 64 MB and 256 MB, keeps a feed's worth of covers (a
/// phone's 1280 × 768 cover is under 4 MB, so 256 MB holds about 65) and every avatar, and what scrolls past again comes
/// back from the disk cache at a thumbnail's decode. Applied once at launch, before any picture is asked for.
public nonisolated enum ImageMemory {
    public static let floor = 64 * 1024 * 1024
    public static let ceiling = 256 * 1024 * 1024
    /// Pictures kept at most, whatever their size: a list of 40 pt faces at 128 px is 64 KB each.
    public static let countLimit = 500

    /// The memory cache's limit (bytes) on a device with `physicalMemory` bytes.
    public static func costLimit(physicalMemory: UInt64) -> Int {
        let share = Double(physicalMemory) * 0.08
        return min(max(Int(share.rounded(.down)), floor), ceiling)
    }

    /// Sets the shared memory cache's limits — the cache the shared pipeline uses (its configuration's default).
    public static func apply(physicalMemory: UInt64 = ProcessInfo.processInfo.physicalMemory) {
        let cache = ImageCache.shared
        cache.costLimit = costLimit(physicalMemory: physicalMemory)
        cache.countLimit = countLimit
    }
}
