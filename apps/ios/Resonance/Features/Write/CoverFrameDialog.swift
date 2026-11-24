import DesignSystem
import GameController
import ResonanceKit
import SwiftUI

/// 調整封面 (round 25 §G2): the cover under a frame in the feed card's shape (0.62, the cover's own outline), dimmed
/// outside it, on the stage the avatar shares (``CropStage``); the zoom slider and 重設 once something moved; 取消 · 完成.
/// 完成 hands back where the cover is looked at (`media.frame`) — nothing is uploaded, and the card's colour stays
/// the whole picture's.
struct CoverFrameContent: View {
    let image: CGImage
    /// The cover's frame as it is now: the stage opens there.
    let frame: CoverFraming?
    /// The cover's outline (the preview's: ``StoryCardView`` seed + 5).
    let seed: Double
    /// The window's height: the stage never stands taller than it − 200.
    let windowHeight: CGFloat
    let onCancel: () -> Void
    let onDone: (CoverFraming) -> Void
    @State private var width: CGFloat = 0
    @State private var crop: AvatarCrop?
    /// The axes a drag found no room in (round 33 §Q5): across, up and down.
    @State private var blocked = NoRoomHint()

    private var stage: CGSize { CropStageSize.cover(width: width, windowHeight: windowHeight) }

    /// The hint by the input at hand: a pointer's (the Mac, an iPad with a mouse or trackpad) or touch's.
    static var pointer: Bool { CropStageSize.isMac || GCMouse.current != nil }
    static var hint: String { pointer ? L10n.Write.CoverFrame.hintPointer : L10n.Write.CoverFrame.hintTouch }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Write.CoverFrame.title)
            Text(Self.hint)
                .font(AppFonts.body(13.5))
                .foregroundStyle(Tokens.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            if stage.width > CropStageSize.margin, let binding = Binding($crop) {
                let hinted = blocked.shows(binding.wrappedValue)
                CropStage(image: image, crop: binding, size: stage, outline: .cover(seed: seed), label: L10n.Write.CoverFrame.stage) {
                    blocked.pushed(across: $0)
                }
                // Round 33 §Q5: once a drag pushes along an axis the picture has no room in, the line under the frame says
                // so, until a zoom gives that axis room — on the dimmed picture in the stage's margin under the frame (the
                // web's place), so nothing below it ever moves.
                .overlay(alignment: .bottom) {
                    Text(L10n.Write.CoverFrame.zoomToMove)
                        .font(AppFonts.body(12))
                        .foregroundStyle(Tokens.photoInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(height: CropStageSize.margin / 2)
                        .opacity(hinted ? 1 : 0)
                        .accessibilityHidden(!hinted)
                        .animation(.easeOut(duration: 0.16), value: hinted)
                        .allowsHitTesting(false)
                        .accessibilityIdentifier("cover-frame-zoom-to-move")
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
                CropZoomRow(crop: binding).padding(.top, 14)
            }
            ModalActions {
                OrganicButton(L10n.Write.CoverFrame.cancel, variant: .tonal, size: .sm, action: onCancel)
            } verb: {
                OrganicButton(L10n.Write.CoverFrame.done, variant: .solid, size: .sm) {
                    guard let crop else { return }
                    onDone(crop.coverFrame)
                }
            }
            .padding(.top, 20)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .onChange(of: crop) { _, now in if let now { blocked.settle(now) } }
        .onChange(of: stage, initial: true) { _, size in
            let frame = CropStageSize.frame(stage: size, aspect: CGFloat(CoverFraming.Box.feed))
            guard frame.width > 0 else { return }
            if crop == nil {
                crop = AvatarCrop(imageSize: CGSize(width: image.width, height: image.height), frame: frame, cover: self.frame)
            } else {
                crop?.resize(frame: frame)
            }
        }
    }


    /// The dialog's width: the stage's cap and the modal's padding round it.
    static var maxWidth: CGFloat { (CropStageSize.isMac ? CropStageSize.coverCapMac : CropStageSize.coverCap) + 48 }
}

/// The cover's picture read for the dialog: the stored file, upright, at most 2048 on its long side.
enum CoverFramePicture {
    static func load(_ url: URL) async -> CGImage? {
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        return await Task.detached(priority: .userInitiated) { AvatarImage.load(data) }.value
    }
}

/// When 調整封面 says 放大後才能移動 (round 33 §Q5): once a drag has pushed along an axis the picture has no room in at its
/// zoom, until a zoom gives that axis room — the web's and Android's choice too, so the window opens as quietly as
/// before. A zoom that gives the axis room forgets the push.
struct NoRoomHint: Equatable {
    private(set) var across = false
    private(set) var upDown = false

    mutating func pushed(across axis: Bool) {
        if axis { across = true } else { upDown = true }
    }

    /// Whether it shows for `crop` now; an axis with room again is forgotten.
    func shows(_ crop: AvatarCrop) -> Bool {
        (across && crop.room.width < AvatarCrop.noRoom) || (upDown && crop.room.height < AvatarCrop.noRoom)
    }

    /// The pushes a zoom that gave room has answered, forgotten.
    mutating func settle(_ crop: AvatarCrop) {
        if crop.room.width >= AvatarCrop.noRoom { across = false }
        if crop.room.height >= AvatarCrop.noRoom { upDown = false }
    }
}
