import CoreGraphics
import DesignSystem
import Foundation
import Testing
@testable import Resonance

/// Framing a cover (round 25 §G): `coverCrop` read case by case from native/fixtures/cover-frame.json (the web's and
/// Android's tests read the same file), the stage's maths (the crop it shows is the crop every renderer cuts, its size
/// with the height rule, the multiplying slider, 重設), and the frame as `media` stores it.
@MainActor @Suite struct CoverFrameTests {
    private struct Fixture: Decodable {
        struct Frame: Decodable { let cx, cy, zoom, ar: Double }
        struct Crop: Decodable { let x, y, w, h: Double }
        struct Case: Decodable {
            let name: String
            let ar: Double
            let frame: Frame?
            let boxRatio: Double
            let crop: Crop
        }
        let cases: [Case]
    }

    private static func fixture() throws -> Fixture {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../..").standardized
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: root.appendingPathComponent("native/fixtures/cover-frame.json")))
    }

    @Test func coverCropIsTheWebsCaseForCase() throws {
        let cases = try Self.fixture().cases
        #expect(cases.count >= 100)
        for c in cases {
            let frame = c.frame.map { CoverFraming(cx: $0.cx, cy: $0.cy, zoom: $0.zoom, ar: $0.ar) }
            let r = CoverFraming.coverCrop(ar: c.ar, frame: frame, boxRatio: c.boxRatio)
            let ok = abs(r.minX - c.crop.x) < 1e-5 && abs(r.minY - c.crop.y) < 1e-5
                && abs(r.width - c.crop.w) < 1e-5 && abs(r.height - c.crop.h) < 1e-5
            #expect(ok, "\(c.name): \(r) ≠ \(c.crop)")
        }
    }

    @Test func aFrameOutOfRangeIsTheCentre() {
        let wild = CoverFraming(cx: 1.4, cy: 0.5, zoom: 3, ar: 2)
        #expect(!wild.isValid)
        #expect(CoverFraming.coverCrop(ar: 2, frame: wild, boxRatio: 0.62) == CoverFraming.coverCrop(ar: 2, frame: nil, boxRatio: 0.62))
        #expect(CoverFrames.of(media: ["frame": ["cx": 0.2, "cy": 0.3, "zoom": 1.5, "ar": 1.5]]) == CoverFraming(cx: 0.2, cy: 0.3, zoom: 1.5, ar: 1.5))
        #expect(CoverFrames.of(media: ["frame": ["cx": 0.2, "cy": 0.3, "zoom": 2.5, "ar": 1.5]]) == nil)
        #expect(CoverFrames.of(media: ["url": "x"]) == nil)
    }

    /// What the stage's frame shows is the very crop `coverCrop` cuts for the feed card's box: the dialog shows what
    /// the feed will.
    @Test func theStageShowsTheFeedCardsCrop() {
        let image = CGSize(width: 2000, height: 1000)
        let frame = CGSize(width: 432, height: 432 * 0.62)
        var crop = AvatarCrop(imageSize: image, frame: frame, cover: nil)
        crop.zoom(to: 1.5, about: CGPoint(x: 60, y: -20))
        crop.pan(by: CGSize(width: -90, height: 40))
        let stored = crop.coverFrame
        #expect(stored.isValid && abs(stored.ar - 2) < 1e-9)
        let cut = CoverFraming.coverCrop(ar: stored.ar, frame: stored, boxRatio: 0.62)
        let shown = crop.cropRect
        #expect(abs(cut.minX * image.width - shown.minX) < 0.5 && abs(cut.minY * image.height - shown.minY) < 0.5)
        #expect(abs(cut.width * image.width - shown.width) < 0.5 && abs(cut.height * image.height - shown.height) < 0.5)
        // Opened again on that frame, the stage stands where it was left.
        let again = AvatarCrop(imageSize: image, frame: frame, cover: stored)
        #expect(abs(again.cropRect.minX - shown.minX) < 0.5 && abs(again.cropRect.minY - shown.minY) < 0.5 && abs(again.zoom - 1.5) < 1e-9)
        // On a stage of another size (the window turned) the framing holds.
        var turned = again
        turned.resize(frame: CGSize(width: 300, height: 300 * 0.62))
        #expect(abs(turned.cropRect.minX - shown.minX) < 0.5 && abs(turned.cropRect.width - shown.width) < 0.5)
    }

    @Test func aCoverZoomsOneToTwoOnAMultiplyingSliderAndResets() {
        var crop = AvatarCrop(imageSize: CGSize(width: 1600, height: 1200), frame: CGSize(width: 400, height: 248), cover: nil)
        #expect(!crop.moved && crop.sliderValue == 0)
        crop.zoom(to: 5)
        #expect(crop.zoom == 2 && abs(crop.sliderValue - 1) < 1e-9)
        crop.setSlider(0.5)
        #expect(abs(crop.zoom - sqrt(2)) < 1e-9, "half the slider is half the ratio: √2, not 1.5")
        #expect(crop.moved)
        crop.pan(by: CGSize(width: 30, height: 0))
        crop.reset()
        #expect(!crop.moved && crop.zoom == 1 && crop.offset == .zero)
        // The avatar's slider is the same control over 1…4.
        var avatar = AvatarCrop(imageSize: CGSize(width: 800, height: 800), mask: 300)
        avatar.setSlider(0.5)
        #expect(abs(avatar.zoom - 2) < 1e-9)
    }

    /// The stage takes the dialog's width up to its cap (480, the Mac's 560, the avatar's 400) and never stands taller
    /// than the window − 200: a phone held sideways keeps the frame and its buttons on one screen.
    @Test func theStageNeverStandsTallerThanTheWindowLessTwoHundred() {
        let roomy = CropStageSize.cover(width: 600, windowHeight: 1200, mac: false)
        #expect(roomy.width == 480 && abs(roomy.height - (432 * 0.62 + 48)) < 1e-9)
        #expect(CropStageSize.cover(width: 700, windowHeight: 1200, mac: true).width == 560)
        // A phone on its side: 390 tall leaves 190 for the stage, and the width follows.
        let sideways = CropStageSize.cover(width: 780, windowHeight: 390, mac: false)
        #expect(abs(sideways.height - 190) < 1e-6 && sideways.width < 480)
        let frame = CropStageSize.frame(stage: sideways, aspect: 0.62)
        #expect(abs(frame.height + 48 - sideways.height) < 1e-6, "the frame keeps its 24 a side")
        #expect(CropStageSize.avatar(width: 600, windowHeight: 1000) == CGSize(width: 400, height: 400))
        #expect(CropStageSize.avatar(width: 600, windowHeight: 500) == CGSize(width: 300, height: 300))
        #expect(CropStageSize.avatar(width: 280, windowHeight: 1000) == CGSize(width: 280, height: 280))
    }

    /// The frame rides inside `media`: written with its four numbers once framed, read back, and gone with the picture.
    @Test func theFrameIsStoredInsideMedia() {
        var values = DraftValues(title: "Rain", story: "Out in it.")
        #expect(DraftService.media(values) == nil)
        values.imageURL = URL(string: "https://example.com/c.jpg")
        values.imageLabel = "c.jpg"
        #expect(DraftService.media(values)?["frame"] == nil)
        values.imageFrame = CoverFraming(cx: 0.3, cy: 0.6, zoom: 1.25, ar: 1.5)
        let media = DraftService.media(values)
        let frame = media?["frame"] as? [String: Any]
        #expect(Set(frame.map { Array($0.keys) } ?? []) == ["cx", "cy", "zoom", "ar"])
        #expect(CoverFrames.of(media: media) == values.imageFrame)
        values.imageURL = nil
        #expect(DraftService.media(values) == nil)
    }
}
