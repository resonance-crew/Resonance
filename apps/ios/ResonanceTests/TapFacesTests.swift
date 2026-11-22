import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Who resonated, as faces with no words (round 26 §U2; the owner: 「不要寫這樣的文字，直接放那個頭像就好」): three faces at
/// most, each stepping in by 0.34 of a face, and nothing after them (round 29 §S5 took the blank disc away — never a
/// number either); each face its own drawing lying straight on the next (no paper pad, no ring); the group one button
/// opening the list, except when the only face is the reader's own; and a screen reader hears who they are.
@MainActor @Suite(.serialized) struct TapFacesTests {
    @Test func threeFacesStepIn() {
        // 28 faces with nothing around them (they stood on 34 pads), each 18.48 after the last.
        #expect(abs(FaceStack.step(28) - 28 * 0.66) < 0.001)
        #expect(abs(FaceStack.width(count: 3, size: 28) - (2 * 28 * 0.66 + 28)) < 0.001)
        // Never more than three faces, whatever is handed over.
        #expect(abs(FaceStack.width(count: 5, size: 28) - FaceStack.width(count: 3, size: 28)) < 0.001)
        #expect(FaceStack.width(count: 0, size: 28) == 0)
    }

    @Test func theStackIsAsWideAsItsFacesAndSaysNothingItself() {
        let faces = ["dora", "eli", "fay"].map { TapFaces.face(Fixture.author($0)) }
        let stack = FaceStack(faces: faces)
        let size = UIHostingController(rootView: stack.fixedSize()).sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(abs(size.width - FaceStack.width(count: 3, size: 28)) < 0.5)
        // A face's own 28: nothing around it (its pad made it 34).
        #expect(abs(size.height - 28) < 0.5)
    }

    /// No paper pad under a face any more (the owner, 2026-11-19: 「它的這個框 border 外面還有一個白色的框，所以它又會讓那個重疊的
    /// 區域又變更大」): each face lies straight on the one behind it, by day and at night — just past the front face's rim
    /// the face behind shows (it was the pad's paper there, and the front face 3 further on), and where they overlap the
    /// front face's fill covers the one behind, so the one behind still reads as behind.
    @Test func eachFaceLiesStraightOnTheOneBehindIt() throws {
        let front = FaceStack.Face(id: "a", initials: "", imageURL: nil, color: Color(red: 1, green: 0, blue: 0), seed: 7)
        let behind = FaceStack.Face(id: "b", initials: "", imageURL: nil, color: Color(red: 0, green: 0, blue: 1), seed: 9)
        func drawn(_ stack: FaceStack, _ scheme: ColorScheme) throws -> (pixels: [UInt8], width: Int, height: Int) {
            let renderer = ImageRenderer(content: stack.background(Color.black).environment(\.colorScheme, scheme))
            renderer.scale = 2
            let image = try #require(renderer.cgImage)
            let width = image.width, height = image.height
            var pixels = [UInt8](repeating: 0, count: width * height * 4)
            let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                                 space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return (pixels, width, height)
        }
        func rgb(_ d: (pixels: [UInt8], width: Int, height: Int), x: CGFloat) -> [Int] {
            let i = ((d.height / 2) * d.width + Int(x * 2)) * 4
            return [Int(d.pixels[i]), Int(d.pixels[i + 1]), Int(d.pixels[i + 2])]
        }
        for scheme in [ColorScheme.light, .dark] {
            let two = try drawn(FaceStack(faces: [front, behind]), scheme)
            // The faces' own boxes: 28 tall, the second's 28 one step on.
            #expect(two.height == 56 && abs(CGFloat(two.width) - 2 * (FaceStack.step(28) + 28)) <= 1, "\(scheme): \(two.width) × \(two.height)")
            // 2.5 past the front face's edge (its pen reaches 0.9 out), mid-height: the face behind.
            let past = rgb(two, x: 28 + 2.5)
            #expect(past[2] > 200 && past[0] < 60 && past[1] < 60, "\(scheme): \(past)")
            // Inside the overlap, a little past where the face behind begins: still the front face.
            let over = rgb(two, x: FaceStack.step(28) + 4)
            #expect(over[0] > 200 && over[1] < 60 && over[2] < 60, "\(scheme): \(over)")
        }
    }

    @Test func aReaderHearsWhoResonatedNeverACount() {
        var tap = TapState(Fixture.tap(faces: ["dora", "eli"], more: true))
        let spoken = tap.spoken(viewer: "alice", language: .zhTW)
        #expect(spoken == L10n.Card.Tap.facesReader(names: "dora、eli，" + L10n.Card.Tap.more))
        // On: they hear themselves first.
        _ = tap.flip(viewer: Fixture.author("alice"))
        #expect(tap.spoken(viewer: "alice", language: .zhTW).hasPrefix(L10n.Card.Tap.selfOnly))
        let digits = tap.spoken(viewer: "alice", language: .zhTW).filter(\.isNumber)
        #expect(digits.isEmpty)
    }

    @Test func theReadersOwnFaceAloneIsNoButton() {
        var tap = TapState(Fixture.tap())
        _ = tap.flip(viewer: Fixture.author("alice"))
        #expect(tap.onlyMine(viewer: "alice"))
        #expect(tap.spoken(viewer: "alice") == L10n.Card.Tap.selfOnly)
        // With someone else's face beside it, the group opens the list.
        let shared = TapState(Fixture.tap(mine: true, faces: ["alice", "dora"]))
        #expect(!shared.onlyMine(viewer: "alice"))
    }

    /// A fourth face is no longer drawn (round 29 §S5: no blank disc) — it is still heard: 「等人」 after the names.
    @Test func aFourthFaceIsHeardNotDrawn() {
        var tap = TapState(Fixture.tap(faces: ["dora", "eli", "fay"]))
        #expect(!tap.showsMore)
        _ = tap.flip(viewer: Fixture.author("alice"))
        #expect(tap.shownFaces.map(\.id) == ["alice", "dora", "eli"])
        #expect(tap.showsMore)
    }

    @Test func theFacesAreOneButtonForAScreenReader() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 300)
        let spoken = L10n.Card.Tap.facesReader(names: "dora、eli")
        window.rootViewController = UIHostingController(rootView: VStack {
            TapFaces(faces: ["dora", "eli"].map { Fixture.author($0) }, spoken: spoken, isButton: true) {}
            Spacer()
        })
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var found: [NSObject] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window).filter { !($0.accessibilityLabel ?? "").isEmpty }
            return found.contains { $0.accessibilityLabel == spoken }
        }
        let faces = try #require(found.first { $0.accessibilityLabel == spoken })
        #expect(faces.accessibilityTraits.contains(.button))
        // The faces themselves say nothing (no initials read out one by one).
        #expect(found.filter { $0.accessibilityLabel == "DO" || $0.accessibilityLabel == "EL" }.isEmpty)
    }
}
