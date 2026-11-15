import DesignSystem
import FirebaseFirestore
import ImageIO
import ResonanceKit
import SwiftUI
import UIKit

/// A picture under a frame (round 5 B7; round 25 §G3 made it the cover's too): the avatar's square mask, or a
/// cover's frame in the feed card's shape. The picture is never smaller than the frame (`scale` ≥ the larger of
/// `frame.width / iw` and `frame.height / ih`), may be zoomed through `zoomRange` times that (1…4 for the avatar,
/// 1…2 for a cover), and is moved by its centre's offset from the frame's centre, in the stage's points — always
/// clamped so the frame stays covered. What the frame shows is `cropRect`, in the image's pixels: exactly the
/// future avatar, or the crop `CoverFraming.coverCrop` gives a cover's box at the same frame.
struct AvatarCrop: Equatable {
    /// The image's size in pixels, upright (its orientation applied) and downsampled.
    let imageSize: CGSize
    /// The frame on the stage: the avatar's mask (`S − 48` square), a cover's 0.62.
    private(set) var frame: CGSize
    /// How far it zooms past just covering the frame.
    let zoomRange: ClosedRange<CGFloat>
    private(set) var zoom: CGFloat = 1
    /// The photo's centre from the frame's centre, in stage points.
    private(set) var offset: CGSize = .zero

    /// The avatar's zoom (1…4).
    static let zoomRange: ClosedRange<CGFloat> = 1...4
    /// A cover's (1…2: its 2048-px source goes soft beyond).
    static let coverZoomRange: ClosedRange<CGFloat> = 1...2

    /// The avatar's square mask, `mask` across.
    init(imageSize: CGSize, mask: CGFloat) {
        self.init(imageSize: imageSize, frame: CGSize(width: mask, height: mask), zoomRange: Self.zoomRange)
    }

    init(imageSize: CGSize, frame: CGSize, zoomRange: ClosedRange<CGFloat>) {
        self.imageSize = imageSize
        self.frame = frame
        self.zoomRange = zoomRange
    }

    /// A cover's frame on the stage, opened where `cover` (its stored frame) looked — the centre without one.
    init(imageSize: CGSize, frame: CGSize, cover: CoverFraming?) {
        self.init(imageSize: imageSize, frame: frame, zoomRange: Self.coverZoomRange)
        guard let cover, cover.isValid else { return }
        zoom = min(max(CGFloat(cover.zoom), zoomRange.lowerBound), zoomRange.upperBound)
        let s = scale
        offset = CGSize(width: (imageSize.width / 2 - CGFloat(cover.cx) * imageSize.width) * s,
                        height: (imageSize.height / 2 - CGFloat(cover.cy) * imageSize.height) * s)
        clamp()
    }

    /// The avatar's mask: its frame's width.
    var mask: CGFloat { frame.width }

    /// Stage points per image pixel at zoom 1: the picture just covers the frame.
    var minScale: CGFloat {
        max(frame.width / max(1, imageSize.width), frame.height / max(1, imageSize.height))
    }
    var scale: CGFloat { minScale * zoom }

    /// Something has moved from where it opened at the centre (重設 shows).
    var moved: Bool { abs(zoom - zoomRange.lowerBound) > 0.001 || abs(offset.width) > 0.5 || abs(offset.height) > 0.5 }

    /// Back to the centre at zoom 1.
    mutating func reset() {
        zoom = zoomRange.lowerBound
        offset = .zero
    }

    /// The photo moved by `delta` stage points, then clamped.
    mutating func pan(by delta: CGSize) {
        offset = CGSize(width: offset.width + delta.width, height: offset.height + delta.height)
        clamp()
    }

    /// Zoomed to `z` (clamped to its range) keeping the image point under `anchor` (from the frame's centre,
    /// in stage points: the frame's centre for the slider and the keys, the fingers' centroid for a pinch, the
    /// pointer for the wheel) where it is, then clamped.
    mutating func zoom(to z: CGFloat, about anchor: CGPoint = .zero) {
        let next = min(max(z, zoomRange.lowerBound), zoomRange.upperBound)
        let ratio = next / zoom
        offset = CGSize(width: anchor.x - (anchor.x - offset.width) * ratio,
                        height: anchor.y - (anchor.y - offset.height) * ratio)
        zoom = next
        clamp()
    }

    /// The slider's place, 0…1, on a multiplying scale (round 25 §G3.3): equal steps of the slider are equal
    /// ratios of zoom, as a pinch and the wheel are — so the three are one control.
    var sliderValue: Double {
        let lo = Double(zoomRange.lowerBound), hi = Double(zoomRange.upperBound)
        guard hi > lo else { return 0 }
        return log(Double(zoom) / lo) / log(hi / lo)
    }

    mutating func setSlider(_ v: Double) {
        let lo = Double(zoomRange.lowerBound), hi = Double(zoomRange.upperBound)
        zoom(to: CGFloat(lo * pow(hi / lo, min(max(v, 0), 1))))
    }

    /// The same framing on a stage of another size (a rotation, the window resized): the offset scaled with
    /// the frame.
    mutating func resize(mask newMask: CGFloat) {
        resize(frame: CGSize(width: newMask, height: frame.height * (frame.width > 0 ? newMask / frame.width : 1)))
    }

    mutating func resize(frame newFrame: CGSize) {
        guard newFrame.width > 0, frame.width > 0, newFrame != frame else { return }
        let f = newFrame.width / frame.width
        offset = CGSize(width: offset.width * f, height: offset.height * f)
        frame = newFrame
        clamp()
    }

    private mutating func clamp() {
        let s = scale
        let maxX = max(0, (imageSize.width * s - frame.width) / 2)
        let maxY = max(0, (imageSize.height * s - frame.height) / 2)
        offset = CGSize(width: min(max(offset.width, -maxX), maxX), height: min(max(offset.height, -maxY), maxY))
    }

    /// What the frame shows, in image pixels.
    var cropRect: CGRect {
        let s = scale
        let w = frame.width / s, h = frame.height / s
        return CGRect(x: imageSize.width / 2 - offset.width / s - w / 2,
                      y: imageSize.height / 2 - offset.height / s - h / 2,
                      width: w, height: h)
    }

    /// The square the upload is drawn at: the crop's own pixels, between 256 (what the server keeps)
    /// and 512.
    var outputSide: Int { min(512, max(256, Int(cropRect.width.rounded()))) }

    /// Where a cover is looked at (`media.frame`): the crop's centre in fractions of the picture, the zoom, and
    /// the picture's proportions.
    var coverFrame: CoverFraming {
        let r = cropRect
        let w = max(1, imageSize.width), h = max(1, imageSize.height)
        return CoverFraming(cx: min(max(Double(r.midX / w), 0), 1), cy: min(max(Double(r.midY / h), 0), 1),
                            zoom: Double(zoom), ar: min(max(Double(w / h), CoverFraming.arRange.lowerBound), CoverFraming.arRange.upperBound))
    }

    /// The keyboard's and VoiceOver's steps (the web's KEY_PAN / KEY_PAN_FAST / KEY_ZOOM).
    static let keyPan: CGFloat = 8
    static let keyPanFast: CGFloat = 32
    static let keyZoom: CGFloat = 1.1
    /// The wheel's zoom per point scrolled (the web's WHEEL_ZOOM).
    static let wheelZoom: CGFloat = 0.002
}

/// How large a crop stage is drawn (round 25 §G3.1): the dialog's width up to `cap`, and never taller than the
/// window's height − 200 (the width follows), so a phone held sideways keeps the frame and its buttons on one
/// screen. `aspect` is the stage's height ÷ width; `margin` the room round the frame (48 in all, 24 a side).
enum CropStageSize {
    static let avatarCap: CGFloat = 400
    static let coverCap: CGFloat = 480
    /// The Mac's window shows the app at 77 %: a stage of 560 there looks like an iPad's 480.
    static let coverCapMac: CGFloat = 560
    static let margin: CGFloat = 48
    static let headroom: CGFloat = 200

    static func stage(width: CGFloat, windowHeight: CGFloat, cap: CGFloat, aspect: CGFloat) -> CGSize {
        let tallest = max(0, windowHeight - headroom)
        let w = max(0, min(cap, width, aspect > 0 ? tallest / aspect : width))
        return CGSize(width: w, height: w * aspect)
    }

    /// The avatar's square stage.
    static func avatar(width: CGFloat, windowHeight: CGFloat) -> CGSize {
        stage(width: width, windowHeight: windowHeight, cap: avatarCap, aspect: 1)
    }

    /// A cover's stage: its 0.62 frame with the margin round it.
    static func cover(width: CGFloat, windowHeight: CGFloat, mac: Bool = CropStageSize.isMac) -> CGSize {
        let cap = mac ? coverCapMac : coverCap
        let ratio = CGFloat(CoverFraming.Box.feed)
        let tallest = max(margin, windowHeight - headroom)
        let w = max(0, min(cap, width, (tallest - margin) / ratio + margin))
        return CGSize(width: w, height: max(0, w - margin) * ratio + margin)
    }

    /// The frame inside a stage.
    static func frame(stage: CGSize, aspect frameAspect: CGFloat) -> CGSize {
        let w = max(0, stage.width - margin)
        return CGSize(width: w, height: frameAspect == 1 ? max(0, stage.height - margin) : w * frameAspect)
    }

    static var isMac: Bool { ProcessInfo.processInfo.isMacCatalystApp || ProcessInfo.processInfo.isiOSAppOnMac }
}

/// Reading and drawing the photo (round 5 B7).
nonisolated enum AvatarImage {
    /// The picked file decoded upright (EXIF orientation applied), at most 2048 on its long side, an
    /// animated GIF's first frame; nil when it can't be read as a picture.
    static func load(_ data: Data, maxSide: Int = 2048) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0 else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }

    /// The crop drawn on cream first (a transparent picture never turns black), `side` pixels square,
    /// as JPEG at 0.9.
    static func render(_ image: CGImage, crop: CGRect, side: Int) -> Data? {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { context in
            Palette.shared(.cream).setFill() // stored for everyone to see: light, whatever this device wears
            context.fill(CGRect(origin: .zero, size: size))
            let k = CGFloat(side) / crop.width
            UIImage(cgImage: image).draw(in: CGRect(x: -crop.minX * k, y: -crop.minY * k,
                                                    width: CGFloat(image.width) * k, height: CGFloat(image.height) * k))
        }
        return drawn.jpegData(compressionQuality: 0.9)
    }
}

/// Saving a framed photo (round 5 B7): uploaded as an avatar (the server fits it to 256), then
/// written on the profile the way the web writes it — the person's own `users/{uid}` document,
/// `avatarUrl` merged in (the rules take a stored file's URL from its owner; `PATCH /api/v1/me`
/// has no such field) — and the profile asked for again so every avatar of theirs follows.
struct AvatarSaver {
    var upload: (Data) async throws -> URL
    var write: ([String: Any]) async throws -> Void
    var refresh: () async -> Void

    /// What goes on the profile document.
    static func fields(_ url: URL) -> [String: Any] { ["avatarUrl": url.absoluteString] }

    func save(_ jpeg: Data) async throws {
        let url = try await upload(jpeg)
        try await write(Self.fields(url))
        await refresh()
    }

    @MainActor static func live(_ session: SessionStore, uid: String) -> AvatarSaver {
        AvatarSaver(
            upload: { try await session.writing.upload($0, filename: "avatar.jpg", purpose: "avatar") },
            write: { try await FirebaseBootstrap.db.collection("users").document(uid).setData($0, merge: true) },
            refresh: {
                // Written past the API: the HTTP cache asks the server again, and Me comes back with it.
                session.noteOwnWrite()
                await session.loadMe()
            })
    }
}

/// The crop modal's inside (round 5 B7): title, the hint, the stage, the zoom row (and 重設 once something moved),
/// then Cancel and 使用 at the bottom right. 使用 closes it at once (round 21): the photo goes up behind it, shown on
/// the avatar meanwhile; a photo that can't be framed says so above the actions. The stage is the shared one
/// (``CropStage``, round 25 §G3).
struct AvatarCropContent: View {
    let image: CGImage
    var busy = false
    let error: String?
    /// The window's height: the stage never stands taller than it − 200.
    var windowHeight: CGFloat = 844
    let onCancel: () -> Void
    let onUse: (_ crop: CGRect, _ side: Int) -> Void
    @State private var width: CGFloat = 0
    @State private var crop: AvatarCrop?

    private var stage: CGSize { CropStageSize.avatar(width: width, windowHeight: windowHeight) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Settings.Profile.cropTitle)
            Text(L10n.Settings.Profile.cropHint)
                .font(AppFonts.body(13.5))
                .foregroundStyle(Tokens.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if stage.width > CropStageSize.margin, let binding = Binding($crop) {
                CropStage(image: image, crop: binding, size: stage, outline: .avatar, label: L10n.Settings.Profile.cropStage)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 16)
                    .allowsHitTesting(!busy)
                CropZoomRow(crop: binding).padding(.top, 14).disabled(busy)
            }
            if let error { ModalError(error).padding(.top, 12) }
            ModalActions {
                OrganicButton(L10n.Settings.Profile.cropCancel, variant: .tonal, size: .sm, action: onCancel)
            } verb: {
                OrganicButton(L10n.Settings.Profile.cropUse, variant: .solid, size: .sm) {
                    guard let crop else { return }
                    onUse(crop.cropRect, crop.outputSide)
                }
                .workingLabel(L10n.Settings.Profile.cropUseShort)
            }
            .padding(.top, 20)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .onChange(of: stage, initial: true) { _, size in
            let frame = CropStageSize.frame(stage: size, aspect: 1)
            guard frame.width > 0 else { return }
            if crop == nil {
                crop = AvatarCrop(imageSize: CGSize(width: image.width, height: image.height), mask: frame.width)
            } else {
                crop?.resize(frame: frame)
            }
        }
    }
}

/// The zoom row under a stage: − slider + on the multiplying scale (``AvatarCrop/sliderValue``), and 重設 at its
/// end once something has moved (round 25 §G3.2).
struct CropZoomRow: View {
    @Binding var crop: AvatarCrop

    var body: some View {
        HStack(spacing: 10) {
            OrganicIcon(.minus, size: 16).foregroundStyle(Tokens.textMuted).accessibilityHidden(true)
            OrganicSlider(value: Binding(get: { crop.sliderValue }, set: { crop.setSlider($0) }), in: 0...1,
                          label: L10n.Crop.zoom)
            OrganicIcon(.plus, size: 16).foregroundStyle(Tokens.textMuted).accessibilityHidden(true)
            if crop.moved {
                OrganicButton(L10n.Crop.reset, variant: .text, size: .sm) { crop.reset() }
                    .fixedSize()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.16), value: crop.moved)
    }
}

/// What a stage's frame is: the avatar's round-ish mask, or a cover's own outline (the feed card's picture).
enum CropOutline {
    case avatar
    case cover(seed: Double)
}

/// The stage (round 5 B7, shared by the cover in round 25 §G3): the dialog's darker paper in the picture frame's
/// outline, the photo moved and zoomed under a scrim that leaves the frame clear, outlined in cream. One finger
/// (or the pointer) moves it; two pinch about their moving centre; on an iPad's or the Mac's pointer the wheel
/// zooms, the arrow keys move (8, with Shift 32) and + / − zoom; VoiceOver has the four moves beside the slider.
struct CropStage: View {
    let image: CGImage
    @Binding var crop: AvatarCrop
    let size: CGSize
    let outline: CropOutline
    let label: String
    @FocusState private var focused: Bool
    /// The shade over the photo outside the crop (--photo-shade at 0.5: the same in both schemes).
    static let scrim = Tokens.photoShade.opacity(0.5)

    var body: some View {
        let stageShape = AutoWobRectShape(radius: 16, seed: 79, curve: 0.8)
        let frame = crop.frame
        let s = crop.scale
        ZStack {
            stageShape.fill(Tokens.creamDark)
            Image(decorative: image, scale: 1)
                .resizable()
                .interpolation(.high)
                .frame(width: CGFloat(image.width) * s, height: CGFloat(image.height) * s)
                .offset(crop.offset)
        }
        .frame(width: size.width, height: size.height)
        // Over the photo: the scrim everywhere but the frame's shape, and that shape's cream line.
        .overlay {
            CropScrimShape(frame: frame, outline: outline)
                .fill(Self.scrim, style: FillStyle(eoFill: true))
                .allowsHitTesting(false)
        }
        .overlay {
            CropOutlineLine(outline: outline)
                .frame(width: frame.width, height: frame.height)
                .allowsHitTesting(false)
        }
        .clipShape(stageShape)
        .contentShape(Rectangle())
        // A finger or the pointer drags; two fingers move with their centre and pinch about it.
        .gesture(CropPan { crop.pan(by: $0) })
        .gesture(CropPinch { ratio, at in crop.zoom(to: crop.zoom * ratio, about: centred(at)) })
        // The wheel (a mouse's, a trackpad's scroll) zooms about the pointer.
        .gesture(CropWheel { dy, at in crop.zoom(to: crop.zoom * exp(-dy * AvatarCrop.wheelZoom), about: centred(at)) })
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(phases: [.down, .repeat]) { press in key(press) }
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityAction(named: L10n.Crop.moveUp) { crop.pan(by: CGSize(width: 0, height: -AvatarCrop.keyPanFast)) }
        .accessibilityAction(named: L10n.Crop.moveDown) { crop.pan(by: CGSize(width: 0, height: AvatarCrop.keyPanFast)) }
        .accessibilityAction(named: L10n.Crop.moveLeft) { crop.pan(by: CGSize(width: -AvatarCrop.keyPanFast, height: 0)) }
        .accessibilityAction(named: L10n.Crop.moveRight) { crop.pan(by: CGSize(width: AvatarCrop.keyPanFast, height: 0)) }
    }

    /// A point on the stage, from the frame's centre.
    private func centred(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x - size.width / 2, y: p.y - size.height / 2) }

    /// The arrow keys move the picture (8, with Shift 32), + and − zoom: the web's AvatarCropModal keys.
    private func key(_ press: KeyPress) -> KeyPress.Result {
        let step = press.modifiers.contains(.shift) ? AvatarCrop.keyPanFast : AvatarCrop.keyPan
        switch press.key {
        case .upArrow: crop.pan(by: CGSize(width: 0, height: -step))
        case .downArrow: crop.pan(by: CGSize(width: 0, height: step))
        case .leftArrow: crop.pan(by: CGSize(width: -step, height: 0))
        case .rightArrow: crop.pan(by: CGSize(width: step, height: 0))
        default:
            switch press.characters {
            case "+", "=": crop.zoom(to: crop.zoom * AvatarCrop.keyZoom)
            case "-", "_": crop.zoom(to: crop.zoom / AvatarCrop.keyZoom)
            default: return .ignored
            }
        }
        return .handled
    }
}

/// The frame's cream line over the photo.
private struct CropOutlineLine: View {
    let outline: CropOutline

    var body: some View {
        let style = StrokeStyle(lineWidth: Tokens.ink, lineJoin: .round)
        switch outline {
        case .avatar: AvatarOutlineShape(seed: 77).stroke(Tokens.photoInk.opacity(0.9), style: style)
        case let .cover(seed): OrganicImageShape(seed: seed, radius: 18, bleed: 0).stroke(Tokens.photoInk.opacity(0.9), style: style)
        }
    }
}

/// The stage with the frame's shape cut out of its middle (even-odd).
nonisolated struct CropScrimShape: Shape {
    let frame: CGSize
    var outline: CropOutline = .avatar

    /// The avatar's square mask.
    init(mask: CGFloat) {
        frame = CGSize(width: mask, height: mask)
    }

    init(frame: CGSize, outline: CropOutline) {
        self.frame = frame
        self.outline = outline
    }

    func path(in rect: CGRect) -> Path {
        var p = Path(rect)
        let box = CGRect(x: rect.midX - frame.width / 2, y: rect.midY - frame.height / 2, width: frame.width, height: frame.height)
        switch outline {
        case .avatar: p.addPath(AvatarOutlineShape(seed: 77).path(in: box))
        case let .cover(seed): p.addPath(OrganicImageShape(seed: seed, radius: 18, bleed: 0).path(in: box))
        }
        return p
    }
}

/// One finger (or the pointer, or two fingers' centre) dragging the picture: each change's movement, in points.
/// A UIKit pan (its translation is the touches' centroid's), so two fingers move with their centre while
/// ``CropPinch`` zooms about it — a SwiftUI drag follows the first finger alone.
struct CropPan: UIGestureRecognizerRepresentable {
    let moved: (CGSize) -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.maximumNumberOfTouches = 2
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        guard recognizer.state == .began || recognizer.state == .changed else { return }
        let t = recognizer.translation(in: recognizer.view)
        recognizer.setTranslation(.zero, in: recognizer.view)
        moved(CGSize(width: t.x, height: t.y))
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> CropGestureCoordinator { CropGestureCoordinator() }
}

/// Two fingers pinching: each change's ratio, about where the fingers are now (round 25 §G3.4: their moving centre,
/// not where they began).
struct CropPinch: UIGestureRecognizerRepresentable {
    let pinched: (_ ratio: CGFloat, _ at: CGPoint) -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPinchGestureRecognizer {
        let pinch = UIPinchGestureRecognizer()
        pinch.delegate = context.coordinator
        return pinch
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPinchGestureRecognizer, context: Context) {
        guard recognizer.state == .began || recognizer.state == .changed, recognizer.scale > 0 else { return }
        let ratio = recognizer.scale
        recognizer.scale = 1
        pinched(ratio, context.converter.localLocation)
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> CropGestureCoordinator { CropGestureCoordinator() }
}

/// A mouse's wheel or a trackpad's scroll over the stage (an iPad's pointer, the Mac): each change's vertical
/// scroll in points, and where the pointer is. Touches never start it.
struct CropWheel: UIGestureRecognizerRepresentable {
    let scrolled: (_ dy: CGFloat, _ at: CGPoint) -> Void

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let wheel = UIPanGestureRecognizer()
        wheel.allowedScrollTypesMask = .all
        wheel.allowedTouchTypes = []
        wheel.delegate = context.coordinator
        return wheel
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        guard recognizer.state == .began || recognizer.state == .changed else { return }
        let t = recognizer.translation(in: recognizer.view)
        recognizer.setTranslation(.zero, in: recognizer.view)
        // Scrolling down (content up) zooms out, as the web's wheel does.
        scrolled(-t.y, context.converter.localLocation)
    }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> CropGestureCoordinator { CropGestureCoordinator() }
}

/// The stage's recognizers work together (a pan and a pinch at once).
final class CropGestureCoordinator: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }
}
