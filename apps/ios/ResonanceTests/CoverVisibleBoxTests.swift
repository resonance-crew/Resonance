import CoreGraphics
import DesignSystem
import Foundation
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 33 §Q4 (the owner: 「预览与调整框基准框统一 — 对可见框（不含 imageBleed 外扩）计算裁切，外扩仅作画面延伸」): a card's
/// cover is drawn ``organicImageBleed`` larger than its box on every side for its wobbly clip, and until this round the
/// frame's crop was the bled box's — the card showed the middle ~88 % of what 調整封面 framed, in another shape. Now the
/// crop is the visible box's. Pixel checks: a picture whose every pixel says where it is (red: x, green: y) is drawn
/// in the 調整封面 stage and in a feed card's bled cover box on the frame the stage hands back; a few points of the
/// frame and of the card's visible box must show the same place of the picture.
@MainActor @Suite struct CoverVisibleBoxTests {
    /// A `w` × `h` picture whose red is its x (0…255 across) and green its y.
    private func gradient(_ w: Int, _ h: Int) throws -> CGImage {
        let ctx = try #require(CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                         space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let data = try #require(ctx.data).assumingMemoryBound(to: UInt8.self)
        let row = ctx.bytesPerRow
        for y in 0..<h {
            // CoreGraphics' rows run bottom-up in the drawn picture: row 0 of the buffer is the top.
            let g = UInt8((Double(y) + 0.5) / Double(h) * 255)
            for x in 0..<w {
                let p = data + y * row + x * 4
                p[0] = UInt8((Double(x) + 0.5) / Double(w) * 255)
                p[1] = g
                p[2] = 0
                p[3] = 255
            }
        }
        return try #require(ctx.makeImage())
    }

    private struct Pixels {
        let width: Int, height: Int
        let data: [UInt8]
        /// The picture's place (fractions of its width and height) the pixel at (x, y) shows.
        func place(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            let i = (Int(y) * width + Int(x)) * 4
            return CGPoint(x: Double(data[i]) / 255, y: Double(data[i + 1]) / 255)
        }
    }

    private func render(_ view: some View) throws -> Pixels {
        let renderer = ImageRenderer(content: view.environment(\.colorScheme, .light))
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let ctx = try #require(CGContext(data: &data, width: image.width, height: image.height, bitsPerComponent: 8,
                                         bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                         bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return Pixels(width: image.width, height: image.height, data: data)
    }

    /// The points sampled, as fractions of the frame (and of the card's visible box): off the outline, inside both.
    private static let samples: [CGPoint] = [
        CGPoint(x: 0.2, y: 0.25), CGPoint(x: 0.8, y: 0.25), CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.2, y: 0.75), CGPoint(x: 0.8, y: 0.75),
    ]

    /// The cases: a 1536 × 1024 cover (the AI's) and a portrait 1024 × 1536 photo, at zoom 1 and 1.5, moved off the centre.
    private static let cases: [(w: Int, h: Int, zoom: CGFloat, pan: CGSize)] = [
        (1536, 1024, 1, CGSize(width: 0, height: 9)),
        (1536, 1024, 1.5, CGSize(width: -60, height: 30)),
        (1024, 1536, 1, CGSize(width: 0, height: -120)),
        (1024, 1536, 1.5, CGSize(width: 50, height: 160)),
    ]

    /// The largest gap, in the card's points, between where the stage and the card show the same sample.
    /// Also the gradient's step there: one of its 256 levels, in the card's points (what a sample can't tell apart).
    private func drift(picture w: Int, _ h: Int, zoom: CGFloat, pan: CGSize, bleedCrop: Bool,
                       framed: Bool = true) throws -> (gap: CGFloat, step: CGFloat) {
        let picture = try gradient(w, h)
        // The stage, as 調整封面 lays it out on a phone (a 400 stage: a 352 × 218 frame).
        let stageSize = CGSize(width: 400, height: (400 - CropStageSize.margin) * CGFloat(CoverFraming.Box.feed) + CropStageSize.margin)
        let frameSize = CropStageSize.frame(stage: stageSize, aspect: CGFloat(CoverFraming.Box.feed))
        var crop = AvatarCrop(imageSize: CGSize(width: w, height: h), frame: frameSize, cover: nil)
        crop.zoom(to: zoom)
        crop.pan(by: pan)
        let framing = crop.coverFrame
        let stage = try render(CropStage(image: picture, crop: .constant(crop), size: stageSize, outline: .cover(seed: 5), label: ""))

        // The card: a phone's 360 band at the feed's 0.62, its cover box grown by the bleed on every side.
        let visible = CGSize(width: 360, height: (360 * CoverFraming.Box.feed).rounded())
        let bleed = organicImageBleed(visible.width, visible.height)
        let bled = CGSize(width: visible.width + 2 * bleed, height: visible.height + 2 * bleed)
        let card = try render(FramedCover(Image(decorative: picture, scale: 1), pictureSize: CGSize(width: w, height: h),
                                          bleed: bleedCrop ? bleed : 0)
            .frame(width: bled.width, height: bled.height)
            .coverFraming(framed ? framing : nil))

        var worst: CGFloat = 0
        var step: CGFloat = 0
        for s in Self.samples {
            let a = stage.place((stageSize.width - frameSize.width) / 2 + s.x * frameSize.width,
                                (stageSize.height - frameSize.height) / 2 + s.y * frameSize.height)
            let b = card.place(bleed + s.x * visible.width, bleed + s.y * visible.height)
            // The gap in the picture's fractions, as the card's points: how far off the card's own picture it lies.
            let shownW = visible.width / (frameSize.width / (CGFloat(w) * crop.scale))
            let shownH = visible.height / (frameSize.height / (CGFloat(h) * crop.scale))
            worst = max(worst, abs(a.x - b.x) * shownW, abs(a.y - b.y) * shownH)
            step = max(shownW, shownH) / 255
        }
        return (worst, step)
    }

    @Test func theCardsVisibleBoxShowsWhatTheFrameShowed() throws {
        var report: [String] = []
        for c in Self.cases {
            let (now, step) = try drift(picture: c.w, c.h, zoom: c.zoom, pan: c.pan, bleedCrop: true)
            let (before, _) = try drift(picture: c.w, c.h, zoom: c.zoom, pan: c.pan, bleedCrop: false)
            report.append("\(c.w)×\(c.h) zoom \(c.zoom): \(String(format: "%.1f", now)) pt, a level \(String(format: "%.1f", step)) pt"
                + " (bled crop: \(String(format: "%.1f", before)) pt)")
            // A couple of points past what the gradient can tell apart (one of its 256 levels across the shown part).
            #expect(now <= step + 2, "\(c.w)×\(c.h) zoom \(c.zoom): \(now) pt off (a level is \(step))")
            #expect(before > now + 6, "the bled box's crop drifted further (\(before) vs \(now))")
        }
        // No stored frame (the lead, round 33): the card must match 調整封面 after 重設 — the centred frame at zoom 1.
        for (w, h) in [(1536, 1024), (1024, 1536)] {
            let (now, step) = try drift(picture: w, h, zoom: 1, pan: .zero, bleedCrop: true, framed: false)
            report.append("\(w)×\(h) no frame: \(String(format: "%.1f", now)) pt, a level \(String(format: "%.1f", step)) pt")
            #expect(now <= step + 2, "\(w)×\(h) no frame: \(now) pt off")
        }
        print("§Q4 drift: " + report.joined(separator: "; "))
    }

    /// The bleed carries the same picture outward: the placement is the visible box's crop, set in by the bleed, and the
    /// picture never covers less of the visible box than all of it.
    @Test func thePlacementIsTheVisibleBoxsCropSetInByTheBleed() {
        let frame = CoverFraming(cx: 0.3, cy: 0.6, zoom: 1.5, ar: 1.5)
        let visible = CGSize(width: 360, height: 223)
        let bleed: CGFloat = 22
        let bled = CGSize(width: visible.width + 2 * bleed, height: visible.height + 2 * bleed)
        let place = CoverLayout.placement(box: bled, pictureSize: CGSize(width: 1536, height: 1024), frame: frame, bleed: bleed)
        let plain = CoverLayout.placement(box: visible, pictureSize: CGSize(width: 1536, height: 1024), frame: frame)
        #expect(abs(place.width - plain.width) < 0.001 && abs(place.height - plain.height) < 0.001)
        #expect(abs(place.minX - (plain.minX + bleed)) < 0.001 && abs(place.minY - (plain.minY + bleed)) < 0.001)
        let shown = CGRect(x: bleed, y: bleed, width: visible.width, height: visible.height)
        #expect(place.insetBy(dx: -0.001, dy: -0.001).contains(shown))
        // At zoom 1 a 3:2 picture is all of the 0.62 box's width: nothing past its sides, so the bleed there stays empty
        // (the lead's final word: no underlay — the card's own paper shows and the swing ends at the picture's edge).
        let edge = CoverLayout.coverage(box: bled, pictureSize: CGSize(width: 1536, height: 1024),
                                        frame: CoverFraming(cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5), bleed: bleed)
        #expect(abs(edge.minX - bleed) < 0.001 && abs(edge.width - visible.width) < 0.001)
        #expect(edge.minY < bleed)
    }

    /// Every framed cover in a bled box hands its bleed on: the card's (``OrganicImage``) and the share picture's.
    @Test func theBledCoversPassTheirBleed() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../Packages/DesignSystem/Sources/DesignSystem").standardized
        let image = try String(contentsOf: root.appendingPathComponent("Components/OrganicImage.swift"), encoding: .utf8)
        #expect(image.contains("FramedCover(image, pictureSize: pictureSize, bleed: bleed)"))
        #expect(image.contains(".mask { FramedCoverMask(pictureSize: pictureSize, bleed: bleed) }"))
        let share = try String(contentsOf: root.appendingPathComponent("Cards/ShareCardView.swift"), encoding: .utf8)
        #expect(share.contains("FramedCover(Image(uiImage: image), pictureSize: image.size, bleed: bleed)"))
    }

    /// The lead's final word (round 33): where the exact crop ends inside the bleed nothing is drawn — under a loaded
    /// picture the placeholder never shows there (``FramedCoverMask``), and inside the box the crop is exact.
    @Test func noPlaceholderShowsPastTheLoadedPicture() throws {
        let picture = try gradient(1536, 1024)
        let visible = CGSize(width: 360, height: (360 * CoverFraming.Box.feed).rounded())
        let bleed = organicImageBleed(visible.width, visible.height)
        let bled = CGSize(width: visible.width + 2 * bleed, height: visible.height + 2 * bleed)
        for framing in [CoverFraming(cx: 0.5, cy: 0.5, zoom: 1, ar: 1.5), nil] {
            let drawn = try render(ZStack {
                Color(red: 0, green: 0, blue: 1) // a placeholder: blue, which the picture never has
                FramedCover(Image(decorative: picture, scale: 1), pictureSize: CGSize(width: 1536, height: 1024), bleed: bleed)
            }
            .mask { FramedCoverMask(pictureSize: CGSize(width: 1536, height: 1024), bleed: bleed) }
            .frame(width: bled.width, height: bled.height)
            .coverFraming(framing))
            func pixel(_ x: CGFloat, _ y: CGFloat) -> (blue: UInt8, alpha: UInt8) {
                let i = (Int(y) * drawn.width + Int(x)) * 4
                return (drawn.data[i + 2], drawn.data[i + 3])
            }
            // The bleed past the picture's sides: nothing (transparent), never the placeholder.
            for x in [CGFloat(2), bled.width - 3] {
                let p = pixel(x, bled.height / 2)
                #expect(p.alpha < 10, "\(String(describing: framing)) at \(x): alpha \(p.alpha), blue \(p.blue)")
            }
            // Above, where the picture has more (a 3:2 picture at zoom 1 is ~8 taller than the box), it carries on into
            // the bleed.
            let top = pixel(bled.width / 2, bleed - 4)
            #expect(top.alpha > 245 && top.blue < 40)
            // Inside the box: the exact crop, edge to edge.
            let left = drawn.place(bleed + 1, bled.height / 2), right = drawn.place(bleed + visible.width - 2, bled.height / 2)
            #expect(left.x < 0.02 && right.x > 0.98, "\(left) \(right)")
        }
    }

    /// Post-merge review (round 33): the thought map's thumb draws a 64 box (56 seen + 4 a side) and its crop is the
    /// 56's — a square, on the inner 56 — for a landscape and a portrait cover, framed or not.
    @Test func theMapsThumbIsCutForItsSeen56() throws {
        #expect(MapNodeView.thumbSide + 2 * MapNodeView.thumbBleed == 64)
        let box = CGSize(width: 64, height: 64)
        for picture in [CGSize(width: 1536, height: 1024), CGSize(width: 1024, height: 1536)] {
            for frame in [nil, CoverFraming(cx: 0.4, cy: 0.6, zoom: 1.5, ar: Double(picture.width / picture.height))] {
                let place = CoverLayout.placement(box: box, pictureSize: picture, frame: frame, bleed: 4)
                let crop = CoverFraming.coverCrop(ar: Double(picture.width / picture.height), frame: frame, boxRatio: 1)
                // The crop's corners land on the inner 56's.
                #expect(abs(place.minX + crop.minX * place.width - 4) < 0.001)
                #expect(abs(place.minY + crop.minY * place.height - 4) < 0.001)
                #expect(abs(crop.width * place.width - 56) < 0.001 && abs(crop.height * place.height - 56) < 0.001)
            }
        }
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/ThoughtMap/MapNodeView.swift").standardized, encoding: .utf8)
        #expect(source.contains("bleed: Self.thumbBleed)"))
        let image = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Packages/DesignSystem/Sources/DesignSystem/Components/OrganicImage.swift").standardized, encoding: .utf8)
        #expect(image.contains("if let image { FramedCover(image, pictureSize: pictureSize, bleed: bleed) }"))
    }
}
