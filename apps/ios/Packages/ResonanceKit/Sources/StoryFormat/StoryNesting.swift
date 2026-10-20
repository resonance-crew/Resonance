import Foundation

/// How deep a story's quotes and lists may open on one line for its Markdown to be parsed at all.
/// Apple's parser builds its tree recursively, and a few thousand levels (a story of `> > > …`,
/// which the rules let run to 200 000 characters) run it out of stack — a crash, not a slow read;
/// the web's reader has no such floor. No story worth reading nests this deep: the reader draws one
/// that does as its words (`StoryParser.parse`), and a share card quotes none of it.
public nonisolated enum StoryNesting {
    public static let limit = 32

    /// Whether a line of the story opens more than `limit` quotes and list items at its start (a
    /// `>`, a bullet or a number followed by a space each count; a guess on the deep side, read in
    /// one pass over the bytes).
    public static func tooDeep(_ story: String, limit: Int = limit) -> Bool {
        let bytes = Array(story.utf8)
        let space: Set<UInt8> = [0x20, 0x09]
        var i = 0
        while i < bytes.count {
            var depth = 0
            scan: while i < bytes.count, bytes[i] != 0x0A {
                while i < bytes.count, space.contains(bytes[i]) { i += 1 }
                guard i < bytes.count else { break }
                switch bytes[i] {
                case UInt8(ascii: ">"):
                    i += 1
                case UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "+"):
                    guard i + 1 < bytes.count, space.contains(bytes[i + 1]) else { break scan }
                    i += 2
                case UInt8(ascii: "0")...UInt8(ascii: "9"):
                    var j = i
                    while j < bytes.count, j - i < 9, (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(bytes[j]) { j += 1 }
                    guard j + 1 < bytes.count, bytes[j] == UInt8(ascii: ".") || bytes[j] == UInt8(ascii: ")"),
                          space.contains(bytes[j + 1]) else { break scan }
                    i = j + 2
                default:
                    break scan
                }
                depth += 1
                if depth > limit { return true }
            }
            // On to the next line.
            while i < bytes.count, bytes[i] != 0x0A { i += 1 }
            i += 1
        }
        return false
    }
}
