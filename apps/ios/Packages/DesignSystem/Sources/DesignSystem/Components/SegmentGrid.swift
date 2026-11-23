import SwiftUI

// MARK: - Segmented grid (SegmentedGrid.tsx, lib/design/segmentGrid.ts)

/// The grid's geometry, the web's `segmentGrid` to the point: which column counts it tries, which seeds its
/// seams take (the first row's are the bar's own, `seed + i·37 + 11`) and each cell's region in its own frame —
/// its inner sides the seams it shares with its neighbours, each wobbling only between the cells' corners, its
/// outer sides pushed past the grid (the outline trims them).
public nonisolated enum SegmentGridGeometry {
    /// 4 → 2 → 1 for four cells (3 → 2 → 1 for three …).
    public static func columnSteps(_ count: Int) -> [Int] {
        var steps: [Int] = []
        var cols = count
        while cols >= 1 {
            if !steps.contains(cols) { steps.append(cols) }
            cols = cols > 2 ? Int((Double(cols) / 2).rounded(.up)) : cols - 1
        }
        return steps
    }

    /// The first column count in which the widest cell's own width fits an equal share of `room`; one column
    /// whatever it measures.
    public static func columns(room: CGFloat, naturals: [CGFloat]) -> Int {
        guard let widest = naturals.max() else { return 1 }
        for cols in columnSteps(naturals.count) where cols == 1 || widest * CGFloat(cols) <= room + 0.5 {
            return cols
        }
        return 1
    }

    public static func downSeed(_ seed: Double, cols: Int, r: Int, c: Int) -> Double {
        seed + Double((r * (cols - 1) + (c - 1)) * 37 + 11)
    }

    public static func acrossSeed(_ seed: Double, cols: Int, r: Int, c: Int) -> Double {
        seed + 1000 + Double(((r - 1) * cols + c) * 37 + 23)
    }

    public static func pad(rowHeight h: Double) -> Double { max(12, h * 0.3) }

    /// The bar's wave down at `x` over `h`, its ends unmoved (`boundaryPoints` without its stubs).
    public static func down(x: Double, h: Double, seed: Double) -> [CGPoint] {
        Array(boundaryPoints(x: x, h: h, seed: seed, amp: 1.6, pad: 0).dropFirst().dropLast())
    }

    /// The same wave turned on its side: across at `y` over `w`.
    static func across(y: Double, w: Double, seed: Double) -> [CGPoint] {
        down(x: y, h: w, seed: seed).map { CGPoint(x: $0.y, y: $0.x) }
    }

    /// Cell (r, c)'s region in its own `w` × `h` frame, clockwise from its top-left corner.
    public static func region(r: Int, c: Int, cols: Int, rows: Int, w: Double, h: Double, seed: Double) -> [CGPoint] {
        let pad = pad(rowHeight: h)
        let l = c == 0, rt = c == cols - 1, t = r == 0, b = r == rows - 1
        let x0 = l ? -pad : 0, x1 = rt ? w + pad : w, y0 = t ? -pad : 0, y1 = b ? h + pad : h
        let top = t ? [CGPoint(x: x0, y: y0), CGPoint(x: x1, y: y0)]
            : [CGPoint(x: x0, y: 0)] + across(y: 0, w: w, seed: acrossSeed(seed, cols: cols, r: r, c: c)) + [CGPoint(x: x1, y: 0)]
        let right = rt ? [CGPoint(x: x1, y: y0), CGPoint(x: x1, y: y1)]
            : [CGPoint(x: w, y: y0)] + down(x: w, h: h, seed: downSeed(seed, cols: cols, r: r, c: c + 1)) + [CGPoint(x: w, y: y1)]
        let bottom = b ? [CGPoint(x: x1, y: y1), CGPoint(x: x0, y: y1)]
            : ([CGPoint(x: x0, y: h)] + across(y: h, w: w, seed: acrossSeed(seed, cols: cols, r: r + 1, c: c)) + [CGPoint(x: x1, y: h)]).reversed()
        let left = l ? [CGPoint(x: x0, y: y1), CGPoint(x: x0, y: y0)]
            : ([CGPoint(x: 0, y: y0)] + down(x: 0, h: h, seed: downSeed(seed, cols: cols, r: r, c: c)) + [CGPoint(x: 0, y: y1)]).reversed()
        return top + right + bottom + left
    }

    /// The seams a cell cuts in its own frame: the one on its left (not the first column) and the one on its top
    /// (not the first row), an end on the grid's edge running past it.
    public static func seams(r: Int, c: Int, cols: Int, rows: Int, w: Double, h: Double, seed: Double) -> [[CGPoint]] {
        let pad = pad(rowHeight: h)
        var out: [[CGPoint]] = []
        if c > 0 {
            out.append([CGPoint(x: 0, y: r == 0 ? -pad : 0)] + down(x: 0, h: h, seed: downSeed(seed, cols: cols, r: r, c: c))
                + [CGPoint(x: 0, y: r == rows - 1 ? h + pad : h)])
        }
        if r > 0 {
            out.append([CGPoint(x: c == 0 ? -pad : 0, y: 0)] + across(y: 0, w: w, seed: acrossSeed(seed, cols: cols, r: r, c: c))
                + [CGPoint(x: c == cols - 1 ? w + pad : w, y: 0)])
        }
        return out
    }
}

/// A cell's share of the grid's face, in its own frame.
nonisolated struct GridCellRegion: Shape {
    let r: Int, c: Int, cols: Int, rows: Int
    let seed: Double

    func path(in rect: CGRect) -> Path {
        Path(polyline: SegmentGridGeometry.region(r: r, c: c, cols: cols, rows: rows, w: Double(rect.width),
                                                  h: Double(rect.height), seed: seed)).closed()
            .offsetBy(dx: rect.minX, dy: rect.minY)
    }
}

/// The seams a cell cuts (its left and top), as the pen draws them.
nonisolated struct GridCellSeams: Shape {
    let r: Int, c: Int, cols: Int, rows: Int
    let seed: Double

    func path(in rect: CGRect) -> Path {
        var p = Path()
        for seam in SegmentGridGeometry.seams(r: r, c: c, cols: cols, rows: rows, w: Double(rect.width),
                                              h: Double(rect.height), seed: seed) {
            p.addPath(Path(polyline: seam))
        }
        return p.offsetBy(dx: rect.minX, dy: rect.minY)
    }
}

/// Cells of one size, `cols` to a row: at its ideal size `cols` times the widest cell's own width (what
/// `ViewThatFits` weighs), offered a width it shares it evenly; every row as tall as the tallest cell, 48 at least.
struct EqualGridLayout: Layout {
    let cols: Int
    var minHeight: CGFloat = 48

    private func cell(_ subviews: Subviews) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        return CGSize(width: sizes.map(\.width).max() ?? 0, height: max(minHeight, sizes.map(\.height).max() ?? 0))
    }

    private func rows(_ subviews: Subviews) -> Int { max(1, Int((Double(subviews.count) / Double(cols)).rounded(.up))) }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let one = cell(subviews)
        let height = one.height * CGFloat(rows(subviews))
        guard let width = proposal.width, width.isFinite else { return CGSize(width: one.width * CGFloat(cols), height: height) }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let w = bounds.width / CGFloat(cols)
        let h = bounds.height / CGFloat(rows(subviews))
        for (i, subview) in subviews.enumerated() {
            let r = i / cols, c = i % cols
            subview.place(at: CGPoint(x: bounds.minX + CGFloat(c) * w, y: bounds.minY + CGFloat(r) * h),
                          proposal: ProposedViewSize(width: w, height: h))
        }
    }
}

/// A segmented choice as one fused grid (SegmentedGrid.tsx): the bar's track, its seams cut in the paper, the
/// chosen cell in its own face — one row while every glyph beside its whole words fits an equal share of the
/// column, else two to a row, else one (the largest text sizes on the narrowest phone). A cell never cuts,
/// shrinks or wraps its words and never drops its glyph. Its cells are buttons, so it has no pen line.
public struct SegmentedGrid: View {
    let segments: [SegmentSpec]
    var seed: Double
    var fill: Color
    var seam: Color

    public init(_ segments: [SegmentSpec], seed: Double = 71, fill: Color = Tokens.buttonTonal, seam: Color = Tokens.cream) {
        self.segments = segments
        self.seed = seed
        self.fill = fill
        self.seam = seam
    }

    public var body: some View {
        let steps = SegmentGridGeometry.columnSteps(segments.count)
        // Each candidate its own child (a ForEach in a ViewThatFits is weighed as one): 4, 2, then 1 to a row.
        ViewThatFits(in: .horizontal) {
            grid(steps[0])
            if steps.count > 1 { grid(steps[1]) }
            if steps.count > 2 { grid(steps[2]) }
            if steps.count > 3 { grid(steps[steps.count - 1]) }
        }
        .accessibilityElement(children: .contain)
    }

    private func grid(_ cols: Int) -> some View {
        let rows = max(1, Int((Double(segments.count) / Double(cols)).rounded(.up)))
        return EqualGridLayout(cols: cols) {
            ForEach(Array(segments.enumerated()), id: \.element.id) { i, spec in
                GridCell(spec: spec, r: i / cols, c: i % cols, cols: cols, rows: rows, seed: seed, gridFill: fill, seam: seam)
            }
        }
        .clipShape(SegmentedBarShape(seed: seed))
    }
}

/// One cell: its glyph and whole words centred, on its region of the face with the grain, the press's wash and
/// the seams on its left and top.
private struct GridCell: View {
    let spec: SegmentSpec
    let r: Int, c: Int, cols: Int, rows: Int
    let seed: Double
    let gridFill: Color
    let seam: Color

    var body: some View {
        Button(action: spec.action) {
            HStack(spacing: OrganicButtonStyle.iconGap) {
                if let icon = spec.icon {
                    OrganicIcon(icon, size: 16, color: spec.ink, strokeWidth: 1.6)
                }
                Text(spec.label)
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(spec.ink)
                    .lineLimit(1)
                    .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(SegmentPressStyle(region: AnyShape(GridCellRegion(r: r, c: c, cols: cols, rows: rows, seed: seed)),
                                       fill: spec.fill ?? gridFill, pressInk: spec.pressInk, held: spec.held,
                                       seam: r == 0 && c == 0 ? nil : AnyShape(GridCellSeams(r: r, c: c, cols: cols, rows: rows, seed: seed)),
                                       seamColor: seam))
        .accessibilityLabel(spec.accessibilityLabel ?? spec.label)
        .accessibilityAddTraits(spec.selected == true ? .isSelected : [])
    }
}
