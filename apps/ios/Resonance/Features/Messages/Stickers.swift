import CryptoKit
import Foundation
import ImageIO
import Observation
import ResonanceKit
import UIKit

// Round 22: the 小紙團 stickers as the app has them — the web's catalog and files bundled as they are
// (project.yml: public/stickers → the bundle's stickers/), a sticker this build doesn't carry read from the
// site once and kept, what each one is called, the ones this account sent last, and how many play at once.

/// The stickers the app knows and where their files are. The catalog is the bundle's; a sticker it lacks (a
/// pack newer than this build) is fetched from the site (`/stickers/<pack>/<id>.webp`, the API's origin) into
/// Caches, and one that can't be read there either is drawn as its message's fallback words.
@MainActor @Observable
final class StickerLibrary {
    static let shared = StickerLibrary()

    /// The bundled catalog (empty when it can't be read — every sticker then reads from the site or as words).
    let catalog: StickerCatalog
    /// The stickers this account sent last, newest first (the panel's 🕘 tab).
    private(set) var recents: [StickerRef] = []
    /// Stickers the bundle lacks that the site couldn't give either: drawn as their message's words.
    private(set) var unavailable: Set<StickerRef> = []
    /// Stickers the bundle lacks, read from the site and kept on the device.
    private(set) var fetched: Set<StickerRef> = []

    /// The site the files of a sticker this build doesn't carry are read from (the API's origin).
    @ObservationIgnored var origin: URL?
    @ObservationIgnored private let bundleRoot: URL?
    @ObservationIgnored private let cacheRoot: URL
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var account: String?
    @ObservationIgnored private var fetching: [String: Task<Bool, Never>] = [:]
    @ObservationIgnored private let images = NSCache<NSString, UIImage>()

    init(bundle: Bundle = .main, defaults: UserDefaults = .standard,
         cacheRoot: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "Stickers")) {
        bundleRoot = bundle.url(forResource: "stickers", withExtension: nil)
        catalog = bundleRoot.flatMap { try? Data(contentsOf: $0.appending(path: "catalog.json")) }.flatMap(StickerCatalog.decode)
            ?? StickerCatalog(version: 0, packs: [])
        self.cacheRoot = cacheRoot
        self.defaults = defaults
        images.totalCostLimit = 24 * 1024 * 1024
    }

    // MARK: Names

    /// What the sticker is called in the interface's language, or nil for one this build doesn't know.
    func name(_ ref: StickerRef) -> String? { catalog.name(ref, Strings.shared.language) }

    /// Its name, else 「貼圖」 (a sticker this build doesn't know, whose words are the message's own).
    func label(_ ref: StickerRef) -> String { name(ref) ?? L10n.Messages.stickerUnknown }

    // MARK: Files

    /// The bundled file of `ref` (its animation, or its still: the thumb, the art's hero pose), if this build carries it.
    func bundled(_ ref: StickerRef, thumb: Bool = false) -> URL? {
        guard catalog.knows(ref), let bundleRoot else { return nil }
        let file = bundleRoot.appending(path: "\(ref.pack)/\(ref.id)\(thumb ? ".thumb" : "").webp")
        return FileManager.default.fileExists(atPath: file.path) ? file : nil
    }

    /// The file to draw `ref` from now: the bundle's, else a copy read from the site earlier.
    func file(_ ref: StickerRef, thumb: Bool = false) -> URL? {
        if let bundled = bundled(ref, thumb: thumb) { return bundled }
        let kept = cached(ref, thumb: thumb)
        return FileManager.default.fileExists(atPath: kept.path) ? kept : nil
    }

    /// The pack's tab icon (its character's head).
    func icon(_ pack: StickerCatalog.Pack) -> URL? {
        guard let file = bundleRoot?.appending(path: pack.icon), FileManager.default.fileExists(atPath: file.path) else { return nil }
        return file
    }

    /// Whether the sticker can be drawn now, or soon (read from the site): false once the site couldn't give it.
    func drawable(_ ref: StickerRef) -> Bool { !unavailable.contains(ref) }

    /// Reads a sticker this build doesn't carry from the site (both files, once) and keeps it; whether it now has it.
    @discardableResult
    func fetch(_ ref: StickerRef) async -> Bool {
        if file(ref) != nil, file(ref, thumb: true) != nil { return true }
        guard ref.isWellFormed, let origin else {
            unavailable.insert(ref)
            return false
        }
        let key = "\(ref.pack)/\(ref.id)"
        if let running = fetching[key] { return await running.value }
        let version = catalog.entry(ref)?.sticker.v
        let targets = [(false, cached(ref, thumb: false)), (true, cached(ref, thumb: true))]
        let task = Task<Bool, Never> {
            for (thumb, target) in targets {
                var components = URLComponents(url: origin.appending(path: ref.path(thumb: thumb)), resolvingAgainstBaseURL: false)
                if let version { components?.queryItems = [URLQueryItem(name: "v", value: version)] }
                guard let url = components?.url,
                      let (data, response) = try? await URLSession.shared.data(from: url),
                      (response as? HTTPURLResponse)?.statusCode == 200,
                      let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0
                else { return false }
                try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                guard (try? data.write(to: target, options: .atomic)) != nil else { return false }
            }
            return true
        }
        fetching[key] = task
        let ok = await task.value
        fetching[key] = nil
        if ok { fetched.insert(ref) } else { unavailable.insert(ref) }
        return ok
    }

    /// The still of `ref` at `side` points (its thumb file, the hero pose), decoded off the main thread and kept.
    func still(_ ref: StickerRef, side: CGFloat) async -> UIImage? {
        let pixels = Int((side * UITraitCollection.current.displayScale).rounded())
        let key = "\(ref.pack)/\(ref.id)|\(pixels)" as NSString
        if let kept = images.object(forKey: key) { return kept }
        var url = file(ref, thumb: true)
        if url == nil, !catalog.knows(ref), await fetch(ref) { url = file(ref, thumb: true) }
        guard let url else { return nil }
        let image = await Task.detached(priority: .userInitiated) { Self.decode(url, maxPixels: pixels) }.value
        if let image { images.setObject(image, forKey: key, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4)) }
        return image
    }

    /// The still at hand now, if one was decoded at that size.
    func stillAtHand(_ ref: StickerRef, side: CGFloat) -> UIImage? {
        let pixels = Int((side * UITraitCollection.current.displayScale).rounded())
        return images.object(forKey: "\(ref.pack)/\(ref.id)|\(pixels)" as NSString)
    }

    nonisolated static func decode(_ url: URL, maxPixels: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixels),
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

    private func cached(_ ref: StickerRef, thumb: Bool) -> URL {
        cacheRoot.appending(path: "\(ref.pack)/\(ref.id)\(thumb ? ".thumb" : "").webp")
    }

    // MARK: Recents

    /// The account whose recents the panel shows (another account's are forgotten on the device).
    func use(account uid: String?) {
        guard uid != account else { return }
        account = uid
        var all = defaults.dictionary(forKey: Self.recentsKey) as? [String: [String]] ?? [:]
        let mine = uid.map(Self.digest)
        all = all.filter { $0.key == mine }
        defaults.set(all, forKey: Self.recentsKey)
        recents = mine.flatMap { all[$0] }.map { $0.compactMap(Self.ref(from:)) } ?? []
    }

    /// `ref` was sent: it leads the recents.
    func sent(_ ref: StickerRef) {
        guard let account else { return }
        recents = StickerRecents.adding(ref, to: recents)
        var all = defaults.dictionary(forKey: Self.recentsKey) as? [String: [String]] ?? [:]
        all[Self.digest(account)] = recents.map { "\($0.pack)/\($0.id)" }
        defaults.set(all, forKey: Self.recentsKey)
    }

    /// The recents the catalog still has.
    var shownRecents: [StickerRef] { StickerRecents.known(recents, in: catalog) }

    private static let recentsKey = "stickers.recents"

    private static func ref(from stored: String) -> StickerRef? {
        let parts = stored.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        let ref = StickerRef(pack: parts[0], id: parts[1])
        return ref.isWellFormed ? ref : nil
    }

    /// An account's key: a digest of its uid, never the uid.
    nonisolated static func digest(_ uid: String) -> String {
        SHA256.hash(data: Data(uid.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Playback

/// Who may animate (round 22 §4.5): a sticker plays its two loops the first time it comes on screen — once
/// per message for as long as the app runs — and again on a tap; at most three at once, the newest taking the
/// place of the one playing longest. Pure; ``StickerPlayback`` keeps one for the app.
nonisolated struct StickerPlaybackLimiter: Equatable {
    static let maxPlaying = 3

    /// Playing now, the longest playing first.
    private(set) var playing: [String] = []
    /// Played on their own already (a tap still replays them).
    private(set) var played: Set<String> = []

    /// Whether `key` plays as it comes on screen: only the first time.
    func autoplays(_ key: String) -> Bool { !played.contains(key) }

    /// `key` starts playing; the keys that stop to make room.
    mutating func start(_ key: String) -> [String] {
        played.insert(key)
        playing.removeAll { $0 == key }
        playing.append(key)
        let over = max(0, playing.count - Self.maxPlaying)
        let stopped = Array(playing.prefix(over))
        playing.removeFirst(over)
        return stopped
    }

    /// `key` stopped (it ended, left the screen, or was stopped).
    mutating func end(_ key: String) {
        playing.removeAll { $0 == key }
    }
}

/// The app's ``StickerPlaybackLimiter``, with the way to stop each sticker playing.
@MainActor final class StickerPlayback {
    static let shared = StickerPlayback()

    private(set) var limiter = StickerPlaybackLimiter()
    private var stops: [String: () -> Void] = [:]

    func autoplays(_ key: String) -> Bool { limiter.autoplays(key) }

    /// `key` is about to play; `stop` stops it should a newer one need its place.
    func start(_ key: String, stop: @escaping () -> Void) {
        stops[key] = stop
        for other in limiter.start(key) {
            stops.removeValue(forKey: other)?()
        }
    }

    func end(_ key: String) {
        limiter.end(key)
        stops[key] = nil
    }

    /// Motion is quiet: Reduce Motion, or Low Power Mode — only the key pose is drawn.
    static var still: Bool {
        UIAccessibility.isReduceMotionEnabled || ProcessInfo.processInfo.isLowPowerModeEnabled
    }
}

/// A sticker drawn by UIKit: its still (the thumb — the art's hero pose) at rest; `play()` animates the file
/// frame by frame with `CGAnimateImageDataWithBlock` (never every frame decoded up front) for its two loops.
/// While it plays only the animation's frames are drawn — never the still under them, whose pose would show
/// through the frames' clear parts — and once it ends (or is stopped) the still is back: the still until the
/// first frame is decoded, the frames, the still again. Leaving the window frees what it read.
final class StickerPlayerView: UIView {
    private let imageView = UIImageView()
    private var run = 0
    private var onEnd: (() -> Void)?
    /// The still shown whenever it isn't playing.
    private var still: UIImage?

    override init(frame: CGRect) {
        super.init(frame: frame)
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: leadingAnchor), imageView.trailingAnchor.constraint(equalTo: trailingAnchor),
            imageView.topAnchor.constraint(equalTo: topAnchor), imageView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        isAccessibilityElement = false
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    var isPlaying: Bool { onEnd != nil }

    /// The still shown at rest (replaced by the frames while it plays, back once they end).
    func rest(on image: UIImage?) {
        still = image
        guard !isPlaying else { return }
        imageView.image = image
    }

    /// Plays the animation in `file` `loops` times; `ended` once it stops, however it stops.
    func play(_ file: URL, loops: Int = 2, ended: @escaping () -> Void) {
        stop()
        run += 1
        let mine = run
        onEnd = ended
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let data = try? Data(contentsOf: file, options: .mappedIfSafe),
                  let source = CGImageSourceCreateWithData(data as CFData, nil) else {
                await self?.finish(mine)
                return
            }
            let frames = CGImageSourceGetCount(source)
            let loop = Self.loopSeconds(source, frames: frames)
            await self?.start(data, frames: frames, loop: loop, loops: loops, run: mine)
        }
    }

    private func start(_ data: Data, frames: Int, loop: TimeInterval, loops: Int, run mine: Int) {
        guard run == mine else { return }
        guard frames > 1 else {
            // A still (a placeholder until the art lands): nothing to play.
            return finish(mine)
        }
        var last = -1
        var plays = 0
        let status = CGAnimateImageDataWithBlock(data as CFData, nil) { [weak self] index, image, stop in
            MainActor.assumeIsolated {
                guard let self, self.run == mine else {
                    stop.pointee = true
                    return
                }
                if index < last { plays += 1 }
                last = index
                self.imageView.image = UIImage(cgImage: image)
                if plays >= loops {
                    stop.pointee = true
                    self.finish(mine)
                }
            }
        }
        guard status == noErr else { return finish(mine) }
        // The file may stop by itself after its own loops (it bakes two in): the slot is let go then too.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(loop * Double(loops) + 0.3))
            self?.finish(mine)
        }
    }

    /// Stops playing now, the still back in its place.
    func stop() {
        guard onEnd != nil else { return }
        let ended = onEnd
        onEnd = nil
        run += 1
        imageView.image = still
        ended?()
    }

    private func finish(_ mine: Int) {
        guard run == mine, let ended = onEnd else { return }
        onEnd = nil
        imageView.image = still
        ended()
    }

    /// One loop's length: the frames' delays as the file keeps them (about 2 s when it says nothing).
    nonisolated private static func loopSeconds(_ source: CGImageSource, frames: Int) -> TimeInterval {
        var total: TimeInterval = 0
        for i in 0..<frames {
            guard let props = CGImageSourceCopyPropertiesAtIndex(source, i, nil) as? [CFString: Any] else { continue }
            let webp = props[kCGImagePropertyWebPDictionary] as? [CFString: Any]
            let gif = props[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            let delay = (webp?[kCGImagePropertyWebPUnclampedDelayTime] ?? webp?[kCGImagePropertyWebPDelayTime]
                ?? gif?[kCGImagePropertyGIFUnclampedDelayTime] ?? gif?[kCGImagePropertyGIFDelayTime]) as? Double
            total += delay ?? 1.0 / 12
        }
        return total > 0 ? total : 2
    }
}
