import DesignSystem
import Foundation
import SwiftUI
import Testing
@testable import Resonance

/// Round 18 (2026-10-28, the owner's review of round 17): flat again. Every menu sheet is the theme's menu
/// paper inside one hand-drawn pen line — the header's grey, a card's own menu its card's pen — with no grain
/// and no shadow; 封鎖 rests on the warning yellow, a destructive row on a red wash; the toast and the
/// thread's pill are made as a card is, the accent's light wash inside a line of the accent.
@MainActor @Suite struct RoundEighteenMenuTests {
    private func resolved(_ color: Color, _ style: UIUserInterfaceStyle) -> UIColor {
        UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    private func rgba(_ color: Color, _ style: UIUserInterfaceStyle) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved(color, style).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    private func same(_ a: Color, _ b: Color) -> Bool {
        [UIUserInterfaceStyle.light, .dark].allSatisfy { style in
            let x = rgba(a, style), y = rgba(b, style)
            return abs(x.r - y.r) < 0.004 && abs(x.g - y.g) < 0.004 && abs(x.b - y.b) < 0.004 && abs(x.a - y.a) < 0.004
        }
    }

    private func sameHue(_ a: Color, _ b: Color, _ style: UIUserInterfaceStyle) -> Bool {
        let x = rgba(a, style), y = rgba(b, style)
        return abs(x.r - y.r) < 0.004 && abs(x.g - y.g) < 0.004 && abs(x.b - y.b) < 0.004
    }

    @Test func theSheetsPenIsTheHeadersGreyOrItsCardsPen() {
        // The theme's menus: the header's quiet grey, never the accent.
        #expect(same(MenuSheetColors.pen(hue: nil), Tokens.fieldBorderHover))
        #expect(!same(MenuSheetColors.pen(hue: nil), Tokens.terracotta))
        // A card's own menu (the card box's ⋯, the trash, 更換封面): its card's pen and its card's menu paper.
        #expect(same(MenuSheetColors.pen(hue: 140), Palette.hue(.pen, 140)))
        #expect(same(MenuSheetColors.paper(hue: 140), Palette.hue(.menu, 140)))
    }

    @Test func theSheetsPaperIsTheMenuPaperNeverRaisedAtNight() {
        #expect(same(MenuSheetColors.paper(hue: nil), Tokens.menuPaper))
        #expect(same(PressSheet.paper, Tokens.menuPaper))
    }

    @Test func blockRestsOnTheWarningYellowAndADestructiveRowOnRed() {
        let block = OrganicMenuItem(id: "block", title: "封鎖", icon: .ban, warn: true) {}
        let delete = OrganicMenuItem(id: "delete", title: "刪除對話", icon: .trash, danger: true) {}
        let signOut = OrganicMenuItem(id: "signOut", title: "登出", icon: .flag) {}
        #expect([block, delete, signOut].map(\.tone) == [.warn, .danger, .plain])
        // 登出 and every plain row: the bare paper.
        #expect(MenuRowInks.rest(.plain) == nil)
        // A destructive row: the danger hue at 11 %, its press at 15 %.
        #expect(same(MenuRowInks.rest(.danger)!, Tokens.danger.opacity(0.11)))
        #expect(same(MenuRowInks.press(.danger), Tokens.danger.opacity(0.15)))
        // 封鎖: the yellow, see-through — 32 % by day, 90 % at night (the night yellow is a deep olive).
        let rest = MenuRowInks.rest(.warn)!
        #expect(abs(rgba(rest, .light).a - 0.32) < 0.005)
        #expect(abs(rgba(rest, .dark).a - 0.90) < 0.005)
        #expect(sameHue(rest, Tokens.yellow, .light) && sameHue(rest, Tokens.yellow, .dark))
        // Its press: the yellow at 30 % by day, the text ink at 8 % at night.
        let press = MenuRowInks.press(.warn)
        #expect(abs(rgba(press, .light).a - 0.30) < 0.005 && sameHue(press, Tokens.yellow, .light))
        #expect(abs(rgba(press, .dark).a - 0.08) < 0.005 && sameHue(press, Tokens.text, .dark))
        // Its words are the text ink and its glyph the menu's pen, as any row's; a destructive row's the danger ink.
        let warnInks = MenuRowInks.of(block, pressed: false)
        #expect(same(warnInks.label, Tokens.text) && same(warnInks.glyph, Tokens.terracotta))
        let dangerInks = MenuRowInks.of(delete, pressed: false)
        #expect(same(dangerInks.label, Tokens.dangerFill) && same(dangerInks.glyph, Tokens.dangerFill))
        // A row that is both is told as the destructive one.
        #expect(OrganicMenuItem(id: "x", title: "x", icon: .trash, danger: true, warn: true) {}.tone == .danger)
    }

    @Test func aRowsInkReachesPastTheWobble() {
        // The wobble swings up to ~4 out of the box: a press reaches further past the far corner than that.
        #expect(MenuSheetMetrics.brushReach >= 8)
    }

    @Test func theSheetCastsNoShadow() throws {
        // 10 under the sheet's foot (past the most the wobble and its line can reach): nothing drawn, by day or night.
        let items = [OrganicMenuItem(id: "report", title: "檢舉", icon: .flag) {},
                     OrganicMenuItem(id: "block", title: "封鎖", icon: .ban, warn: true) {}]
        let height = MenuSheetMetrics.height(rows: 2)
        for scheme in [ColorScheme.light, .dark] {
            let bitmap = try MenuBitmap(OrganicMenuPanel(items: items, seed: 7) { _ in }.padding(20).environment(\.colorScheme, scheme))
            #expect(bitmap.alpha(x: bitmap.width / 2, y: Int(20 + height / 2)) > 200)
            let below = Int(20 + height + 10)
            for x in stride(from: 30, to: bitmap.width - 30, by: 7) {
                #expect(bitmap.alpha(x: x, y: below) == 0)
            }
        }
    }
}

/// A view drawn at 1x on nothing, as RGBA bytes (row 0 the top).
@MainActor struct MenuBitmap {
    let pixels: [UInt8]
    let width: Int
    let height: Int

    init(_ view: some View) throws {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        width = image.width
        height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        self.pixels = pixels
    }

    func alpha(x: Int, y: Int) -> UInt8 { pixels[(y * width + x) * 4 + 3] }
}

@MainActor @Suite struct RoundEighteenPillTests {
    @Test func theToastAndThePillAreMadeAsACardIs() {
        // The accent's light wash inside a line of the accent.
        #expect(OrganicPill.fill == Tokens.terracottaLight)
        #expect(OrganicPill.pen == Tokens.terracotta)
        // The toast with a card's corners; the thread's pill round.
        #expect(OrganicPill.toastRadius == 16)
        #expect(OrganicPill.shape(.toast).radius == 16)
        #expect(OrganicPill.shape(.small).radius == 18)
    }

    @Test func noShadowUnderTheToast() throws {
        let bitmap = try MenuBitmap(OrganicPill(text: "已移到垃圾桶", size: .toast).padding(20))
        #expect(bitmap.alpha(x: bitmap.width / 2, y: bitmap.height / 2) > 200)
        // 8 under its foot, nothing at all.
        let y = bitmap.height - 20 + 8
        for x in stride(from: 30, to: bitmap.width - 30, by: 9) {
            #expect(bitmap.alpha(x: x, y: y) == 0)
        }
    }
}
