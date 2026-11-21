import Foundation

/// The story's leaves in its order, and where each picked sentence lies among them (round 29 §P3): what the
/// author's page washes. A leaf is named by its path through the blocks, as the story view walks them — a block's
/// place among its siblings, then a list item's place and its own blocks', a quote's children's, a table's row (0 the
/// header, then 1…) and column.
public nonisolated enum PassageLeaves {
    /// One sentence found in a leaf: the pick's id, its place among the found sentences in the story's order (the
    /// faces' `passage-faces-N`), and its range in the leaf's own text (UTF-16, `end` exclusive).
    public struct Mark: Hashable, Sendable {
        public let id: String
        public let order: Int
        public let start: Int
        public let end: Int

        public init(id: String, order: Int, start: Int, end: Int) {
            self.id = id
            self.order = order
            self.start = start
            self.end = end
        }

        public var range: NSRange { NSRange(location: start, length: end - start) }
    }

    /// Every drawn text of the story, in its order, with its path.
    public static func leaves(_ blocks: [StoryBlock], path: [Int] = []) -> [(path: [Int], text: String)] {
        var out: [(path: [Int], text: String)] = []
        func text(_ runs: [InlineRun]) -> String { runs.map(\.text).joined() }
        for (i, block) in blocks.enumerated() {
            let here = path + [i]
            switch block {
            case let .paragraph(runs), let .heading(_, runs), let .soleLink(_, _, runs):
                out.append((here, text(runs)))
            case let .quote(children):
                out += leaves(children, path: here)
            case let .list(_, _, items):
                for (k, item) in items.enumerated() { out += leaves(item, path: here + [k]) }
            case let .table(head, rows, _):
                for (c, cell) in head.enumerated() { out.append((here + [0, c], text(cell))) }
                for (r, row) in rows.enumerated() {
                    for (c, cell) in row.enumerated() { out.append((here + [r + 1, c], text(cell))) }
                }
            case .blank, .image, .cardEmbed, .rule, .code:
                break
            }
        }
        return out
    }

    /// Each leaf's found sentences, by its path: each sentence the first leaf in the story's order that holds it
    /// (``PassageRange``), numbered in the story's order (the leaf, then where it starts). A sentence no leaf holds
    /// is left out — no wash, no faces.
    public static func marks(_ blocks: [StoryBlock], sentences: [(id: String, text: String)]) -> [[Int]: [Mark]] {
        guard !sentences.isEmpty else { return [:] }
        let all = leaves(blocks)
        let texts = all.map(\.text)
        var found: [(leaf: Int, start: Int, end: Int, id: String)] = []
        for sentence in sentences where !found.contains(where: { $0.id == sentence.id }) {
            guard let hit = PassageRange.find(in: texts, sentence.text) else { continue }
            found.append((hit.leaf, hit.start, hit.end, sentence.id))
        }
        found.sort { ($0.leaf, $0.start) < ($1.leaf, $1.start) }
        var out: [[Int]: [Mark]] = [:]
        for (order, f) in found.enumerated() {
            out[all[f.leaf].path, default: []].append(Mark(id: f.id, order: order, start: f.start, end: f.end))
        }
        return out
    }
}
