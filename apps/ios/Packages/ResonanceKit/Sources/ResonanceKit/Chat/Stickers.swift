import Foundation

// Round 22: the 小紙團 stickers and the albums of pictures sent together. Pure: the catalog as the web
// publishes it (public/stickers/catalog.json), the references a message carries, and how an album's
// pictures are laid out in one grid. The twins of Android's kit/chat Stickers.kt.

/// A sticker a message carries (its document's `sticker: { pack, id }`): a pack of the catalog and a
/// sticker in it. Ids are stored in messages for good, so they are only ever compared, never read.
public struct StickerRef: Equatable, Hashable, Sendable, Codable {
    public let pack: String
    public let id: String

    public init(pack: String, id: String) {
        self.pack = pack
        self.id = id
    }

    /// The ids the contract takes (`[a-z0-9-]`, a pack up to 32, a sticker up to 40).
    public var isWellFormed: Bool { Self.valid(pack, max: 32) && Self.valid(id, max: 40) }

    /// The `sticker` field of a message document, or nil for none (or one that isn't well formed).
    public static func from(_ map: [String: Any]?) -> StickerRef? {
        guard let map, let pack = map["pack"] as? String, let id = map["id"] as? String else { return nil }
        let ref = StickerRef(pack: pack, id: id)
        return ref.isWellFormed ? ref : nil
    }

    /// The sticker's file as the site serves it, relative to its origin (`/stickers/<pack>/<id>.webp`).
    public func path(thumb: Bool = false) -> String {
        "stickers/\(pack)/\(id)\(thumb ? ".thumb" : "").webp"
    }

    private static func valid(_ s: String, max: Int) -> Bool {
        !s.isEmpty && s.utf8.count <= max && s.utf8.allSatisfy { ($0 >= 0x61 && $0 <= 0x7A) || ($0 >= 0x30 && $0 <= 0x39) || $0 == 0x2D }
    }
}

/// One of several pictures sent together (its document's `album: { id, index, count }`): the album's
/// own id, this picture's place in it and how many it has (2 to 10).
public struct AlbumRef: Equatable, Hashable, Sendable {
    public let id: String
    public let index: Int
    public let count: Int

    public init(id: String, index: Int, count: Int) {
        self.id = id
        self.index = index
        self.count = count
    }

    /// The most pictures one send carries (the contract's `count` and the composer's strip).
    public static let maxCount = 10

    /// The `album` field of a message document, or nil for none (or one out of the contract's bounds).
    public static func from(_ map: [String: Any]?) -> AlbumRef? {
        guard let map, let id = map["id"] as? String, !id.isEmpty,
              let index = (map["index"] as? NSNumber)?.intValue, let count = (map["count"] as? NSNumber)?.intValue,
              (2...maxCount).contains(count), (0..<count).contains(index) else { return nil }
        return AlbumRef(id: id, index: index, count: count)
    }
}

/// The sticker catalog (public/stickers/catalog.json, written from src/lib/stickers): the packs in the
/// picker's order, each with its character's name, its tab icon and its stickers, each with its names
/// (zh-TW and en: what VoiceOver, the list and a quote say), its length, its frames and the version of
/// its files (the `?v=` of its site address).
public struct StickerCatalog: Decodable, Equatable, Sendable {
    public struct Pack: Decodable, Equatable, Sendable, Identifiable {
        public let id: String
        public let hero: String?
        public let name: [String: String]
        public let icon: String
        public let iconV: String?
        public let stickers: [Sticker]

        public init(id: String, hero: String? = nil, name: [String: String], icon: String, iconV: String? = nil, stickers: [Sticker]) {
            self.id = id
            self.hero = hero
            self.name = name
            self.icon = icon
            self.iconV = iconV
            self.stickers = stickers
        }

        /// The character's name in `language` (zh-TW when it has none in it).
        public func name(_ language: Strings.Language) -> String {
            name[language.rawValue] ?? name["zh-TW"] ?? id
        }
    }

    public struct Sticker: Decodable, Equatable, Sendable {
        public let id: String
        public let name: [String: String]
        public let durationMs: Int?
        public let frames: Int?
        public let v: String?

        public init(id: String, name: [String: String], durationMs: Int? = nil, frames: Int? = nil, v: String? = nil) {
            self.id = id
            self.name = name
            self.durationMs = durationMs
            self.frames = frames
            self.v = v
        }

        public func name(_ language: Strings.Language) -> String {
            name[language.rawValue] ?? name["zh-TW"] ?? id
        }
    }

    public let version: Int
    public let packs: [Pack]

    public init(version: Int, packs: [Pack]) {
        self.version = version
        self.packs = packs
    }

    /// The catalog file's bytes, or nil for anything that isn't one.
    public static func decode(_ data: Data) -> StickerCatalog? {
        try? JSONDecoder().decode(StickerCatalog.self, from: data)
    }

    /// The pack and sticker `ref` names, if this catalog has it.
    public func entry(_ ref: StickerRef) -> (pack: Pack, sticker: Sticker)? {
        guard let pack = packs.first(where: { $0.id == ref.pack }),
              let sticker = pack.stickers.first(where: { $0.id == ref.id }) else { return nil }
        return (pack, sticker)
    }

    public func knows(_ ref: StickerRef) -> Bool { entry(ref) != nil }

    /// What the sticker is called in `language` — or, for one this catalog doesn't know, nil.
    public func name(_ ref: StickerRef, _ language: Strings.Language) -> String? {
        entry(ref)?.sticker.name(language)
    }

    /// Every sticker in the picker's order, with its pack.
    public var all: [StickerRef] {
        packs.flatMap { pack in pack.stickers.map { StickerRef(pack: pack.id, id: $0.id) } }
    }
}

/// The stickers a person sent last (the panel's 🕘 tab): the newest first, each once, at most `limit`.
public enum StickerRecents {
    public static let limit = 8

    /// `recents` after `ref` was sent.
    public static func adding(_ ref: StickerRef, to recents: [StickerRef]) -> [StickerRef] {
        Array(([ref] + recents.filter { $0 != ref }).prefix(limit))
    }

    /// The ones `catalog` still has (a pack that left the app takes its stickers off the tab).
    public static func known(_ recents: [StickerRef], in catalog: StickerCatalog) -> [StickerRef] {
        recents.filter(catalog.knows)
    }
}

/// How an album's pictures share its grid (round 22 §3): two side by side, three as one big over two, four
/// two by two, five to ten in rows of three — a remainder of one taken with the row before it as two rows
/// of two, so no picture stands alone at the foot. Each element is a row's number of pictures.
public enum AlbumGrid {
    public static func rows(count: Int) -> [Int] {
        switch count {
        case ..<1: return []
        case 1: return [1]
        case 2: return [2]
        case 3: return [1, 2]
        case 4: return [2, 2]
        default:
            var rows = Array(repeating: 3, count: count / 3)
            switch count % 3 {
            case 1:
                rows.removeLast()
                rows += [2, 2]
            case 2: rows.append(2)
            default: break
            }
            return rows
        }
    }

    /// The grid's height for `count` pictures `width` wide, `gap` between them: a row of one is two
    /// thirds of the width tall, a row of two half, a row of three a third — square tiles, the big one 3 : 2.
    public static func height(count: Int, width: Double, gap: Double) -> Double {
        let rows = rows(count: count)
        guard !rows.isEmpty else { return 0 }
        return rows.map { rowHeight(tiles: $0, width: width, gap: gap) }.reduce(0, +) + gap * Double(rows.count - 1)
    }

    public static func rowHeight(tiles: Int, width: Double, gap: Double) -> Double {
        switch tiles {
        case 1: return (width * 2 / 3).rounded()
        default: return ((width - gap * Double(tiles - 1)) / Double(tiles)).rounded()
        }
    }
}
