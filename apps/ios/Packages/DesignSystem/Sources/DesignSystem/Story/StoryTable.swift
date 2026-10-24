import StoryFormat
import SwiftUI
import UIKit

/// A story's table, quietly (round 8 §5.2; src/styles/story.css `.story-table`, the web's StoryTable):
/// the numbers, kept in one place.
public nonisolated enum StoryTable {
    /// A column is at least this many em wide, and past the other its words wrap (`.story-cell`).
    public static let minColumnEm: CGFloat = 4
    public static let maxColumnEm: CGFloat = 18
    /// A cell's padding: 8 above and below, 14 a side — none before the first column and none after
    /// the last, so the table starts and ends on the text column's edges.
    public static let cellPadV: CGFloat = 8
    public static let cellPadH: CGFloat = 14
    /// The story's pen rule under the header row (INK_LIGHT, the muted ink at 0.6) and the hairline
    /// between body rows (1, the same ink at 0.3) — drawn by hand but calm (round 9 §6): the header's
    /// wobbles ±1.0 and runs 1.5 past the table at each end, a row's ±0.7 and stops 2 short; nothing
    /// after the last row.
    public static let headRule: CGFloat = Tokens.inkLight
    public static let headRuleInk: Double = 0.6
    public static let headRuleAmp: Double = 1.0
    public static let headRuleOvershoot: CGFloat = 1.5
    public static let rowRule: CGFloat = 1
    public static let rowRuleInk: Double = 0.3
    public static let rowRuleAmp: Double = 0.7
    public static let rowRuleInset: CGFloat = 2
    /// No rule ever swings more than this either side of its line.
    public static let maxRuleAmp: Double = 1.2

    /// How many turns a rule `width` long takes: one per ~90, at least three (the web's `ruleSteps`).
    public static func ruleSteps(_ width: CGFloat) -> Int { max(3, Int((Double(width) / 90).rounded())) }

    /// A rule's seed: the table's own (its header's words, so the same story draws the same pen) and the
    /// row it lies under (0 the header's).
    public static func ruleSeed(table: Int, row: Int) -> Double { Double(abs(table % 9973) + 1 + row * 37) }

    /// The points of a rule `length` long (from `start`, at height `y`), swinging at most `amp`
    /// (never past ``maxRuleAmp``) — the headers' wavy line, at a table's scale.
    public static func rulePoints(start: CGFloat, length: CGFloat, y: CGFloat, amp: Double, seed: Double) -> [CGPoint] {
        let swing = min(amp, maxRuleAmp)
        return wavyPoints(Double(max(0, length)), y0: Double(y), amp: swing, seed: seed, steps: ruleSteps(length))
            .map { CGPoint(x: Double(start) + $0.x, y: $0.y) }
    }
    /// How far the paper fades in on a side that has more to see.
    public static let fade: CGFloat = 24

    /// Each column's width (`natural`: its cells' words on one line, row by row, the header first):
    /// its widest cell's, at least `minColumnEm` and at most `maxColumnEm` em — past which the words wrap.
    public static func columnWidths(_ natural: [[CGFloat]], em: CGFloat) -> [CGFloat] {
        let columns = natural.map(\.count).max() ?? 0
        return (0..<columns).map { c in
            let widest = natural.compactMap { c < $0.count ? $0[c] : nil }.max() ?? 0
            return min(max(widest, minColumnEm * em), maxColumnEm * em)
        }
    }

    /// How wide the table stands: its columns and the padding between them.
    public static func width(_ columns: [CGFloat]) -> CGFloat {
        columns.reduce(0, +) + CGFloat(max(0, columns.count - 1)) * 2 * cellPadH
    }

    /// Which side of a table wider than its column has more to see (the web's `tableMore`), with a
    /// point's slack either way.
    public enum More: Equatable, Sendable {
        case none, start, end, both

        var fadesStart: Bool { self == .start || self == .both }
        var fadesEnd: Bool { self == .end || self == .both }
    }

    public static func more(offset: CGFloat, content: CGFloat, container: CGFloat) -> More {
        guard content - container > 1 else { return .none }
        switch (offset > 1, offset + container < content - 1) {
        case (true, true): return .both
        case (true, false): return .start
        case (false, true): return .end
        case (false, false): return .none
        }
    }

    /// Where a cell's words start (round 9 §6): at the start edge, every cell — the header's too —
    /// whatever the delimiter row's colons asked for (the source keeps them; a table reads down its
    /// columns' starts, and a centred header over start-aligned cells read as two tables).
    public static func alignment(_ alignment: TableAlignment) -> NSTextAlignment { .natural }
}

extension EnvironmentValues {
    /// What VoiceOver names a story's table (the app's `card.table`: 表格 / Table).
    @Entry public var storyTableLabel = "Table"
}

/// A story's table as the reader draws it (round 8 §5.2, round 9 §6): rules, not boxes — no frame and
/// no lines between columns, the story's pen rule under the header row and a hairline between body
/// rows, each a calm hand-drawn line seeded by the table and its row. The body's face at 0.94 em on 1.6
/// lines, the header row in the story's bold, every cell at its start edge, figures tabular
/// (``ProseStyle/tableCell(header:alignment:)``); each column as
/// wide as its words on one line, between 4 and 18 em, wrapping past that. Wider than the column it
/// scrolls sideways inside it — never the page —, the side with more fading into the paper until
/// scrolled to that end. VoiceOver finds it as one named region (表格) holding its cells in order.
struct StoryTableView: View {
    let head: [[InlineRun]]
    let rows: [[[InlineRun]]]
    let alignments: [TableAlignment]
    /// The text it is set in (the body's, or a quote's: its ink).
    let style: ProseStyle
    let onOpenURL: (URL) -> Void
    @Environment(\.storyTableLabel) private var label
    @State private var more = StoryTable.More.none

    /// A cell's words, and how they are measured and drawn.
    private struct Cell {
        let text: NSAttributedString
        let font: UIFont
        let lineHeight: CGFloat
    }

    var body: some View {
        let headCells = head.indices.map { cell(head[$0], column: $0, header: true) }
        let bodyCells = rows.map { row in row.indices.map { cell(row[$0], column: $0, header: false) } }
        let em = style.tableCell(header: false, alignment: .natural).font.pointSize
        let widths = StoryTable.columnWidths(([headCells] + bodyCells).map { $0.map { Self.naturalWidth($0.text) } }, em: em)
        let table = seedFromString(headCells.map(\.text.string).joined(separator: "|"))
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                row(headCells, widths: widths)
                rule(header: true, row: 0, table: table, widths: widths)
                ForEach(Array(bodyCells.enumerated()), id: \.offset) { i, cells in
                    if i > 0 { rule(header: false, row: i, table: table, widths: widths) }
                    row(cells, widths: widths)
                }
            }
            // Room for the header rule's overshoot, which the scroll view would clip at its edges; the
            // table itself stays on the text column's edges.
            .padding(.horizontal, StoryTable.headRuleOvershoot + 1)
        }
        .padding(.horizontal, -(StoryTable.headRuleOvershoot + 1))
        // A table that fits its column doesn't move under a sideways drag.
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .onScrollGeometryChange(for: StoryTable.More.self) { geo in
            StoryTable.more(offset: geo.contentOffset.x, content: geo.contentSize.width, container: geo.containerSize.width)
        } action: { _, now in
            more = now
        }
        .mask {
            HStack(spacing: 0) {
                LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                    .frame(width: more.fadesStart ? StoryTable.fade : 0)
                Color.black
                LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(width: more.fadesEnd ? StoryTable.fade : 0)
            }
            .animation(.easeOut(duration: 0.15), value: more)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func cell(_ runs: [InlineRun], column: Int, header: Bool) -> Cell {
        let alignment = StoryTable.alignment(column < alignments.count ? alignments[column] : .start)
        let cellStyle = style.tableCell(header: header, alignment: alignment)
        return Cell(text: cellStyle.attributed(runs), font: cellStyle.font, lineHeight: cellStyle.lineHeight)
    }

    /// One row: each cell in its column's width, top-aligned, padded 8 × 14 (none outside the table's
    /// first and last columns).
    private func row(_ cells: [Cell], widths: [CGFloat]) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(widths.enumerated()), id: \.offset) { c, width in
                Group {
                    if c < cells.count, cells[c].text.length > 0 {
                        CSSTextView(cells[c].text, font: cells[c].font, lineHeight: cells[c].lineHeight, language: style.language,
                                    onOpenURL: onOpenURL)
                    } else {
                        Color.clear.frame(height: 0)
                    }
                }
                .frame(width: width, alignment: .leading)
                .padding(.vertical, StoryTable.cellPadV)
                .padding(.leading, c == 0 ? 0 : StoryTable.cellPadH)
                .padding(.trailing, c == widths.count - 1 ? 0 : StoryTable.cellPadH)
            }
        }
    }

    /// A rule across the whole table, in the pen: under the header a little past both ends, between
    /// rows a little short of them. It scrolls with the columns (it is inside the table's scroll), under
    /// the fading edges.
    private func rule(header: Bool, row: Int, table: Int, widths: [CGFloat]) -> some View {
        let width = StoryTable.width(widths)
        let weight = header ? StoryTable.headRule : StoryTable.rowRule
        let amp = header ? StoryTable.headRuleAmp : StoryTable.rowRuleAmp
        let room = CGFloat(StoryTable.maxRuleAmp) + weight
        return StoryTableRuleShape(header: header, seed: StoryTable.ruleSeed(table: table, row: row), amp: amp)
            .stroke(Tokens.textMuted.opacity(header ? StoryTable.headRuleInk : StoryTable.rowRuleInk),
                    style: StrokeStyle(lineWidth: weight, lineCap: .round))
            // The rule keeps its old place in the rows (its own weight tall), swinging over and under it.
            .frame(width: width, height: 2 * room)
            .padding(.vertical, (weight - 2 * room) / 2)
            .accessibilityHidden(true)
    }

    /// The words on one line, as TextKit lays them out (a point's slack, so they never wrap a word early).
    static func naturalWidth(_ text: NSAttributedString) -> CGFloat {
        guard text.length > 0 else { return 0 }
        let size = CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        return ceil(text.boundingRect(with: size, options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).width) + 1
    }
}

/// A table's rule, by hand: the header's across the table and 1.5 past either end, a row's stopping 2
/// short of them, along the middle of its box.
private nonisolated struct StoryTableRuleShape: Shape {
    let header: Bool
    let seed: Double
    let amp: Double

    func path(in rect: CGRect) -> Path {
        let start = header ? rect.minX - StoryTable.headRuleOvershoot : rect.minX + StoryTable.rowRuleInset
        let length = header ? rect.width + 2 * StoryTable.headRuleOvershoot : rect.width - 2 * StoryTable.rowRuleInset
        let pts = StoryTable.rulePoints(start: start, length: length, y: rect.midY, amp: amp, seed: seed)
        guard let first = pts.first else { return Path() }
        var p = Path()
        p.move(to: first)
        for i in 1..<pts.count {
            let a = pts[i - 1], b = pts[i]
            let midX = (a.x + b.x) / 2
            p.addCurve(to: b, control1: CGPoint(x: midX, y: a.y), control2: CGPoint(x: midX, y: b.y))
        }
        return p
    }
}
