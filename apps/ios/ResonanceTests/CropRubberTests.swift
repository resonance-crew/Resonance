import CoreGraphics
import DesignSystem
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 33 §Q5 (the owner: 「無拖動空間時給輕微橡皮筋回彈，並在框下方提示「放大後才能移動」」): in 調整封面 (and the avatar's
/// stage, which is the same ``CropStage``) a drag the picture can't follow still moves it a little, against resistance,
/// at most 24, and it springs back when the fingers lift; while the picture has no room in an axis at its zoom, the
/// line under the frame says 放大後才能移動.
@MainActor @Suite struct CropRubberTests {
    /// A 3:2 cover (the AI's 1536 × 1024) in a phone's 352 × 218 frame: at zoom 1 it is the frame's width exactly.
    private func cover(zoom: CGFloat = 1) -> AvatarCrop {
        var crop = AvatarCrop(imageSize: CGSize(width: 1536, height: 1024), frame: CGSize(width: 352, height: 352 * 0.62), cover: nil)
        crop.zoom(to: zoom)
        return crop
    }

    @Test func aDragWithNoRoomStretchesALittleWithResistance() {
        var crop = cover()
        var rubber = CropRubber()
        rubber.drag(CGSize(width: 30, height: 0), crop: &crop)
        #expect(crop.offset == .zero, "the picture itself has nowhere to go")
        #expect(rubber.stretch.width > 0 && rubber.stretch.width < 30, "it follows, less than the finger: \(rubber.stretch.width)")
        // Each further point is worth less, and it never goes past 24.
        let first = rubber.stretch.width
        rubber.drag(CGSize(width: 30, height: 0), crop: &crop)
        #expect(rubber.stretch.width - first < first)
        for _ in 0..<40 { rubber.drag(CGSize(width: 50, height: 0), crop: &crop) }
        #expect(rubber.stretch.width <= CropRubber.most && rubber.stretch.width > CropRubber.most - 1)
        // Left: the other side, the same.
        var other = CropRubber()
        other.drag(CGSize(width: -30, height: 0), crop: &crop)
        #expect(other.stretch.width < 0)
        // Lifted: back where it may be.
        rubber.release()
        #expect(rubber.stretch == .zero && rubber.pull == .zero)
    }

    @Test func aDragPastItsLimitMovesToTheLimitThenStretches() {
        var crop = cover(zoom: 1.5)
        let room = crop.room.width
        #expect(room > 40)
        var rubber = CropRubber()
        rubber.drag(CGSize(width: room + 20, height: 0), crop: &crop)
        #expect(abs(crop.offset.width - room) < 0.001, "to its limit")
        #expect(abs(rubber.pull.width - 20) < 0.001)
        #expect(abs(rubber.stretch.width - CropRubber.band(20)) < 0.001)
        // Back the other way: the pull goes first, then the picture moves again.
        rubber.drag(CGSize(width: -30, height: 0), crop: &crop)
        #expect(rubber.pull.width == 0 && rubber.stretch.width == 0)
        #expect(abs(crop.offset.width - (room - 10)) < 0.001)
    }

    @Test func underReduceMotionNothingStretches() {
        var crop = cover()
        var rubber = CropRubber()
        rubber.drag(CGSize(width: 40, height: 0), crop: &crop, stretches: false)
        #expect(rubber.stretch == .zero && rubber.pull == .zero)
        // The stage reads Reduce Motion for it, and springs back on the fingers' lift.
        let source = try? String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Settings/AvatarCrop.swift").standardized, encoding: .utf8)
        #expect(source?.contains("rubber.drag(delta, crop: &crop, stretches: !reduceMotion)") == true)
        #expect(source?.contains("withAnimation(CropRubber.springBack) { rubber.release() }") == true)
        #expect(source?.contains("if [.ended, .cancelled, .failed].contains(recognizer.state) { return ended() }") == true)
    }

    /// The hint (the web's and Android's choice): not when the window opens, but once a drag pushes along an axis with
    /// no room, until a zoom gives that axis room.
    @Test func theHintShowsOnceADragFindsNoRoomUntilAZoomGivesIt() {
        var crop = cover()
        #expect(crop.lacksRoom)
        var hint = NoRoomHint()
        #expect(!hint.shows(crop), "the window opens quietly")
        // Up and down a 3:2 picture has a sliver of room at zoom 1: no push. Across it has none.
        #expect(CropRubber.noRoomAxis(CGSize(width: 2, height: 20), crop: crop) == nil)
        let axis = CropRubber.noRoomAxis(CGSize(width: 20, height: 3), crop: crop)
        #expect(axis == true)
        hint.pushed(across: true)
        #expect(hint.shows(crop))
        // Zoomed in: room across, the hint goes and the push is forgotten.
        crop.zoom(to: 1.3)
        #expect(!hint.shows(crop))
        hint.settle(crop)
        crop.zoom(to: 1)
        #expect(!hint.shows(crop))
        // A portrait photo: no room across at zoom 1, room up and down.
        let portrait = AvatarCrop(imageSize: CGSize(width: 1024, height: 1536), frame: CGSize(width: 352, height: 352 * 0.62), cover: nil)
        #expect(portrait.room.width < AvatarCrop.noRoom && portrait.room.height > 100)
        #expect(CropRubber.noRoomAxis(CGSize(width: 0, height: 30), crop: portrait) == nil)
        #expect(CropRubber.noRoomAxis(CGSize(width: -30, height: 0), crop: portrait) == true)
        // The words, both languages, with no full stop.
        #expect(Strings.shared.string("write.coverFrame.zoomToMove") == L10n.Write.CoverFrame.zoomToMove)
        #expect(!L10n.Write.CoverFrame.zoomToMove.hasSuffix("。") && !L10n.Write.CoverFrame.zoomToMove.hasSuffix("."))
    }
}
