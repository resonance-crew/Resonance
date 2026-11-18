import SwiftUI

/// Who resonated, as faces (round 26 §U2, the web's AvatarGroup): at most three avatars in a row, each stepping in
/// over the one after it by 0.34 of a face, the first on top — then, when there are more, a blank paper disc (the
/// avatar's own shape in ``discFill`` with the faces' pen line, never a number: the owner wants who, not how many).
/// Under each face a pad of the same shape grown by 6, filled with the paper it sits on, so a face reads clear of
/// the one it lies over — no stroke ring, no shadow (M3). The row's faces come and go by their ids (the viewer's
/// own slides in first when they resonate); the caller animates the change.
public struct FaceStack: View {
    /// One face: the avatar's drawing, keyed by who it is.
    public struct Face: Identifiable, Equatable {
        public let id: String
        public let initials: String
        public let imageURL: URL?
        public let color: Color
        public let seed: Double

        public init(id: String, initials: String, imageURL: URL?, color: Color, seed: Double) {
            self.id = id
            self.initials = initials
            self.imageURL = imageURL
            self.color = color
            self.seed = seed
        }
    }

    let faces: [Face]
    let more: Bool
    var size: CGFloat
    var paper: Color

    /// At most this many faces; past them, the blank disc.
    public static let maxFaces = 3
    /// How far a face steps in over the one after it, as a share of a face.
    public static let overlap: CGFloat = 0.34
    /// How much bigger than a face its pad is (3 a side).
    public static let padGrow: CGFloat = 6
    /// The faces' size on the card page (the apps' 28; the Mac's 77 % makes it 21.6).
    public static let size: CGFloat = 28
    /// The blank disc's seed (its own shape, the same on every card).
    static let discSeed: Double = 113
    /// The blank disc's paper, the web's `.disc path` (AvatarGroup.module.css): the waiting disc's (`avatar-wait`, the
    /// cream-dark) by day; at night the muted ink at 66 % over the cream — the night's cream-dark sat about 1.1 : 1
    /// against the page and the disc read as a bare ring, where §U2.2 asks for 3 : 1. Still no one's colour.
    public nonisolated static let discFill: Color = Palette.made { accent, scheme in
        func token(_ t: PaletteToken) -> (L: Double, C: Double, H: Double, alpha: Double) {
            OKLCHColor.components(Palette.oklch(t, accent: accent, scheme: scheme)) ?? (0, 0, 0, 1)
        }
        guard scheme == .dark else { return token(.avatarWait) }
        return Palette.mixOKLCH(token(.textMuted), 0.66, token(.cream))
    }

    public init(faces: [Face], more: Bool, size: CGFloat = FaceStack.size, paper: Color = Tokens.cream) {
        self.faces = Array(faces.prefix(Self.maxFaces))
        self.more = more
        self.size = size
        self.paper = paper
    }

    /// From one face's start to the next one's.
    public static func step(_ size: CGFloat) -> CGFloat { size * (1 - overlap) }

    /// The row's width for `count` faces and the disc (`more`), pads included.
    public static func width(count: Int, more: Bool, size: CGFloat) -> CGFloat {
        let items = min(count, maxFaces) + (more ? 1 : 0)
        guard items > 0 else { return 0 }
        return CGFloat(items - 1) * step(size) + size + padGrow
    }

    public var body: some View {
        let items = faces.count + (more ? 1 : 0)
        HStack(spacing: Self.step(size) - (size + Self.padGrow)) {
            ForEach(Array(faces.enumerated()), id: \.element.id) { i, face in
                padded(seed: face.seed) {
                    HandDrawnAvatar(initials: face.initials, imageURL: face.imageURL, color: face.color, size: size, seed: face.seed)
                }
                // The first on top, each next one under it.
                .zIndex(Double(items - i))
                .transition(.asymmetric(insertion: .offset(x: -Self.step(size)).combined(with: .opacity),
                                        removal: .offset(x: -Self.step(size)).combined(with: .opacity)))
            }
            if more {
                padded(seed: Self.discSeed) {
                    let shape = HandDrawnAvatar.shape(size: size, seed: Self.discSeed)
                    shape.fill(Self.discFill)
                        .frame(width: size, height: size)
                        .overlay { shape.stroke(Tokens.avatarStroke, style: StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round)) }
                }
                .zIndex(0)
                .transition(.opacity)
            }
        }
        .accessibilityHidden(true)
    }

    /// `content` on its pad: the avatar's shape grown by 6 in the paper under it.
    private func padded(seed: Double, @ViewBuilder content: () -> some View) -> some View {
        let grown = size + Self.padGrow
        return ZStack {
            HandDrawnAvatar.shape(size: grown, seed: seed).fill(paper).frame(width: grown, height: grown)
            content()
        }
        .frame(width: grown, height: grown)
    }
}
