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

    /// §U2.2: at night the blank disc stands 3 : 1 off the page (the web's `.disc path`: the muted ink at 66 % over the
    /// cream). The night's cream-dark it wore was about 1.1 : 1 there, and the disc read as a bare ring. By day it is the
    /// waiting disc's cream-dark, as before.
    @Test func theBlankDiscStandsOffTheNightPage() throws {
        func luminance(_ color: UIColor) -> CGFloat {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: &a)
            func lin(_ v: CGFloat) -> CGFloat { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }
        func contrast(_ a: UIColor, _ b: UIColor) -> CGFloat {
            let (x, y) = (luminance(a), luminance(b))
            return (max(x, y) + 0.05) / (min(x, y) + 0.05)
        }
        for accent in Accent.allCases {
            let night = UITraitCollection { $0.userInterfaceStyle = .dark; $0.accent = accent }
            let day = UITraitCollection { $0.userInterfaceStyle = .light; $0.accent = accent }
            let page = Palette.resolved(.cream, accent: accent, scheme: .dark)
            let disc = UIColor(FaceStack.discFill).resolvedColor(with: night)
            #expect(contrast(disc, page) >= 3, "\(accent): \(contrast(disc, page))")
            let dayDisc = UIColor(FaceStack.discFill).resolvedColor(with: day)
            #expect(abs(luminance(dayDisc) - luminance(Palette.resolved(.creamDark, accent: accent, scheme: .light))) < 0.002, "\(accent)")
        }

        // And the stack draws it: the disc's middle, rendered at night on the night page, clears 3 : 1.
        let renderer = ImageRenderer(content: FaceStack(faces: [], more: true).environment(\.colorScheme, .dark))
        renderer.scale = 2
        let image = try #require(renderer.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        let i = ((height / 2) * width + width / 2) * 4
        let middle = UIColor(red: CGFloat(pixels[i]) / 255, green: CGFloat(pixels[i + 1]) / 255, blue: CGFloat(pixels[i + 2]) / 255, alpha: 1)
        let page = Palette.resolved(.cream, accent: .terracotta, scheme: .dark)
        // The night disc itself (not the day's paper, which would clear 3 : 1 on the night page too).
        var want: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0, 0, 0, 0)
        UIColor(FaceStack.discFill).resolvedColor(with: UITraitCollection { $0.userInterfaceStyle = .dark })
            .getRed(&want.r, green: &want.g, blue: &want.b, alpha: &want.a)
        var got: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0, 0, 0, 0)
        middle.getRed(&got.r, green: &got.g, blue: &got.b, alpha: &got.a)
        #expect(abs(got.r - want.r) < 0.02 && abs(got.g - want.g) < 0.02 && abs(got.b - want.b) < 0.02, "\(pixels[i ..< i + 3])")
        #expect(contrast(middle, page) >= 3, "\(pixels[i ..< i + 3]): \(contrast(middle, page))")
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

/// A wide window's list of who resonated (§U2.5) is a menu sheet: a row's face stands 20 in from the sheet's pen line
/// and the name 10 after the face, at 14, with 8 of paper above the first row and below the last, as the web's popover
/// (TapPeople.module.css `.list[data-size='popover']`, TapFaces.module.css `.popoverBody`). They stood 12 and 12 at 15
/// with 6 above and below, the dialogs' rows, which only a dialog pulls back to its own padding.
@MainActor @Suite(.serialized) struct TapsPopoverRowsTests {
    @Test func aFaceStandsTwentyInAndTheNameTenAfterIt() async throws {
        #expect(TapRowMeasure.popover == TapRowMeasure(height: 52, face: 28, inset: 20, gap: 10, name: 14))
        // The dialogs' rows are not the popover's: 12 a side, pulled back by their scroll's -12.
        #expect(TapRowMeasure.dialog == TapRowMeasure(height: 60, face: 36, inset: 12, gap: 12, name: 15))

        let people = TapPeople { _ in TapList(people: [TapPerson(author: Fixture.author("dora"), note: nil)], nextPageToken: nil) }
        await people.load()
        let width = TapListMetrics.popoverWidth
        let drawn = try DrawnPixels(TapsPopoverRows(people: people) { _ in }.frame(width: width).background(Tokens.cream))
        // 8 above, the row's 52, 8 below (the web's .popoverBody); it was 6 and 6.
        #expect(drawn.width == Int(width * 2) && drawn.height == Int((TapListMetrics.popoverRow + 16) * 2),
                "\(drawn.width) × \(drawn.height)")
        let paper = try DrawnPixels(Color.clear.frame(width: 4, height: 4).background(Tokens.cream)).rgb(2, 2)
        // The columns anything is drawn in: the face, then — after the paper between them — the name.
        let inked = (0 ..< drawn.width).map { x in
            (0 ..< drawn.height).contains { y in zip(drawn.rgb(x, y), paper).reduce(0) { $0 + abs($1.0 - $1.1) } > 30 }
        }
        let faceStart = try #require(inked.firstIndex(of: true))
        let faceEnd = try #require(inked[faceStart...].firstIndex(of: false))
        let nameStart = try #require(inked[faceEnd...].firstIndex(of: true))
        let face = CGFloat(faceStart) / 2, name = CGFloat(nameStart) / 2
        // The face's rim (its pen half outside the shape) at 20; it stood at 12.
        #expect(face >= 20 - 1.5 && face <= 20 + 1, "\(face)")
        // The name's ink 10 after the face's 28, a glyph's side bearing in; it began at 52.
        #expect(name >= 20 + 28 + 10 - 0.5 && name <= 20 + 28 + 10 + 3, "\(name)")
    }
}
