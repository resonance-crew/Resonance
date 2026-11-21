import SwiftUI

/// Who resonated, as faces (round 26 §U2, the web's AvatarGroup): at most three avatars in a row, each stepping in
/// over the one after it by 0.34 of a face, the first on top — and nothing after them: no blank disc, no number, no "+"
/// (round 29 §S5, the owner: 「不要把當有第四、第五個的時候顯示成灰色，這樣子好像又怪怪的」 — who else there is, the list says).
/// Each face is its own drawing and nothing else — its fill, its initials or photo, its pen outline — lying straight
/// on the one after it: the front face's fill covers what it lies over and its own pen line is what parts them (the
/// owner, 2026-11-19: 「它的這個框 border 外面還有一個白色的框，所以它又會讓那個重疊的區域又變更大」 — the paper pad each face
/// sat on is gone). No ring, no shadow (M3). The row's faces come and go by their ids (the viewer's own slides in
/// first when they resonate); the caller animates the change.
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
    var size: CGFloat

    /// At most this many faces, and nothing after them.
    public static let maxFaces = 3
    /// How far a face steps in over the one after it, as a share of a face.
    public static let overlap: CGFloat = 0.34
    /// The faces' size on the card page (the apps' 28; the Mac's 77 % makes it 21.6).
    public static let size: CGFloat = 28

    public init(faces: [Face], size: CGFloat = FaceStack.size) {
        self.faces = Array(faces.prefix(Self.maxFaces))
        self.size = size
    }

    /// From one face's start to the next one's.
    public static func step(_ size: CGFloat) -> CGFloat { size * (1 - overlap) }

    /// The row's width for `count` faces (at most three): the faces' own boxes, nothing around them.
    public static func width(count: Int, size: CGFloat) -> CGFloat {
        let items = min(count, maxFaces)
        guard items > 0 else { return 0 }
        return CGFloat(items - 1) * step(size) + size
    }

    public var body: some View {
        HStack(spacing: Self.step(size) - size) {
            ForEach(Array(faces.enumerated()), id: \.element.id) { i, face in
                HandDrawnAvatar(initials: face.initials, imageURL: face.imageURL, color: face.color, size: size, seed: face.seed)
                    // The first on top, each next one under it.
                    .zIndex(Double(faces.count - i))
                    .transition(.asymmetric(insertion: .offset(x: -Self.step(size)).combined(with: .opacity),
                                            removal: .offset(x: -Self.step(size)).combined(with: .opacity)))
            }
        }
        .accessibilityHidden(true)
    }
}
