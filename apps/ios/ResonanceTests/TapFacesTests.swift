import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Who resonated, as faces with no words (round 26 §U2; the owner: 「不要寫這樣的文字，直接放那個頭像就好」): three faces at
/// most, each stepping in by 0.34 of a face, then a blank paper disc when there are more — never a number; a pad of the
/// face's own shape in the page's paper under each, no ring; the group one button opening the list, except when the
/// only face is the reader's own; and a screen reader hears who they are.
@MainActor @Suite(.serialized) struct TapFacesTests {
    @Test func threeFacesStepInAndTheDiscStandsForTheRest() {
        // 28 faces on 34 pads, each 18.48 after the last.
        #expect(abs(FaceStack.step(28) - 28 * 0.66) < 0.001)
        #expect(abs(FaceStack.width(count: 3, more: false, size: 28) - (2 * 28 * 0.66 + 34)) < 0.001)
        #expect(abs(FaceStack.width(count: 3, more: true, size: 28) - (3 * 28 * 0.66 + 34)) < 0.001)
        // Never more than three faces, whatever is handed over.
        #expect(abs(FaceStack.width(count: 5, more: false, size: 28) - FaceStack.width(count: 3, more: false, size: 28)) < 0.001)
        #expect(FaceStack.width(count: 0, more: false, size: 28) == 0)
    }

    @Test func theStackIsAsWideAsItsFacesAndSaysNothingItself() {
        let faces = ["dora", "eli", "fay"].map { TapFaces.face(Fixture.author($0)) }
        let stack = FaceStack(faces: faces, more: true)
        let size = UIHostingController(rootView: stack.fixedSize()).sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(abs(size.width - FaceStack.width(count: 3, more: true, size: 28)) < 0.5)
        #expect(abs(size.height - 34) < 0.5)
    }

    /// The pad under a face is the page's paper: where a face lies over the next one, the cream shows between them.
    @Test func eachFaceSitsOnAPadOfThePagesPaper() throws {
        let faces = ["dora", "eli"].map { TapFaces.face(Fixture.author($0)) }
        let renderer = ImageRenderer(content: FaceStack(faces: faces, more: false, paper: .white).background(Color.black))
        renderer.scale = 2
        let image = try #require(renderer.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        // Just past the first face's right edge, mid-height: the first face's pad (white), not the second face's ink.
        let x = Int((3 + 28 + 1.5) * 2), y = height / 2
        let i = (y * width + x) * 4
        #expect(pixels[i] > 240 && pixels[i + 1] > 240 && pixels[i + 2] > 240, "\(pixels[i ..< i + 3])")
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

    @Test func aFourthFaceBecomesTheDisc() {
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
            TapFaces(faces: ["dora", "eli"].map { Fixture.author($0) }, more: false, spoken: spoken, isButton: true) {}
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
