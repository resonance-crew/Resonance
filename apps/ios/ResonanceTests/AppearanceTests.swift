@testable import Resonance
import DesignSystem
import Foundation
import SwiftUI
import Testing
import UIKit

/// Dark mode and the themes (spec §2, §4 iOS): the generated palette is palette.ts's to the digit
/// (native/fixtures/palette.json, which the web writes and Android reads too), every `Tokens` colour
/// resolves by the interface style and the theme trait wherever it is drawn, and Settings → 外觀
/// keeps its choice on the device.
@Suite struct AppearanceTests {
    struct Fixture: Decodable {
        let tokens: [String]
        let accents: [String: [String: [String: String]]]
        let hueInks: [String: [String: [Double]]]
        struct Avatar: Decodable { let stored: String; let scheme: String; let fill: String }
        let avatars: [Avatar]
    }

    static let fixture: Fixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native/fixtures/palette.json").standardized
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    /// palette.json's tolerance: 0.002 L, 0.002 C, 0.5° H (a hue is meaningless without chroma).
    static func same(_ a: String, _ b: String) -> Bool {
        guard let x = OKLCHColor.components(a), let y = OKLCHColor.components(b) else { return false }
        let dh = abs((x.H - y.H + 540).truncatingRemainder(dividingBy: 360) - 180)
        return abs(x.L - y.L) <= 0.002 && abs(x.C - y.C) <= 0.002 && (dh <= 0.5 || max(x.C, y.C) < 0.002)
            && abs(x.alpha - y.alpha) <= 0.002
    }

    /// A colour's Display P3 components.
    static func p3(_ color: UIColor) -> [CGFloat] {
        let space = CGColorSpace(name: CGColorSpace.displayP3)!
        return color.cgColor.converted(to: space, intent: .defaultIntent, options: nil)!.components!
    }

    static func close(_ a: UIColor, _ b: UIColor, within e: CGFloat = 0.002) -> Bool {
        zip(p3(a), p3(b)).allSatisfy { abs($0 - $1) <= e }
    }

    static func traits(_ scheme: PaletteScheme, _ accent: Accent) -> UITraitCollection {
        UITraitCollection { traits in
            traits.userInterfaceStyle = scheme == .dark ? .dark : .light
            traits.accent = accent
        }
    }

    @Test func theTokensAreThePalettesInItsOrder() {
        #expect(PaletteToken.allCases.map(\.paletteName) == Self.fixture.tokens)
        #expect(Accent.allCases.map(\.rawValue) == Array(["terracotta", "sage", "lavender", "yellow"]))
        #expect(Set(Self.fixture.accents.keys) == Set(Accent.allCases.map(\.rawValue)))
    }

    @Test(arguments: Accent.allCases, PaletteScheme.allCases)
    func everyThemeInEverySchemeIsPaletteJson(_ accent: Accent, _ scheme: PaletteScheme) throws {
        let table = try #require(Self.fixture.accents[accent.rawValue]?[scheme.rawValue])
        for token in PaletteToken.allCases {
            let want = try #require(table[token.paletteName])
            #expect(Self.same(Palette.oklch(token, accent: accent, scheme: scheme), want), "\(accent) \(scheme) \(token.paletteName)")
            // The colour drawn is the one the oklch() names (P3, as the tables store it).
            let c = try #require(OKLCHColor.components(want))
            let made = UIColor(OKLCHColor.color(c.L, c.C, c.H, alpha: c.alpha))
            #expect(Self.close(Palette.resolved(token, accent: accent, scheme: scheme), made), "\(accent) \(scheme) \(token.paletteName) drawn")
        }
    }

    @Test(arguments: Accent.allCases, PaletteScheme.allCases)
    func aTokenResolvesByTheTraitsItIsDrawnIn(_ accent: Accent, _ scheme: PaletteScheme) {
        let traits = Self.traits(scheme, accent)
        for token in [PaletteToken.cream, .text, .terracotta, .buttonFill, .bubbleMine, .cardFill3, .scrim] {
            #expect(Self.close(Palette.uiColor(token).resolvedColor(with: traits), Palette.resolved(token, accent: accent, scheme: scheme)))
        }
        #expect(Self.close(Tokens.UI.cream.resolvedColor(with: traits), Palette.resolved(.cream, accent: accent, scheme: scheme)))
        // A SwiftUI colour handed to UIKit is still the dynamic one (attributed strings, labels).
        #expect(Self.close(UIColor(Tokens.text).resolvedColor(with: traits), Palette.resolved(.text, accent: accent, scheme: scheme)))
    }

    @Test(arguments: Accent.allCases, PaletteScheme.allCases)
    func swiftUIResolvesATokenInItsEnvironment(_ accent: Accent, _ scheme: PaletteScheme) {
        var env = EnvironmentValues()
        env.colorScheme = scheme == .dark ? .dark : .light
        env.accent = accent
        let want = Color(uiColor: Palette.resolved(.terracotta, accent: accent, scheme: scheme)).resolve(in: env)
        let got = Tokens.terracotta.resolve(in: env)
        #expect(abs(got.red - want.red) < 0.003 && abs(got.green - want.green) < 0.003 && abs(got.blue - want.blue) < 0.003,
                "\(accent) \(scheme)")
    }

    @MainActor @Test func aTokenAtAnOpacityHandedToUIKitStillFollows() {
        let wash = UIColor(highlightWash(strong: false))
        let light = wash.resolvedColor(with: Self.traits(.light, .terracotta))
        let dark = wash.resolvedColor(with: Self.traits(.dark, .sage))
        #expect(!Self.close(light, dark), "a wash resolved once, at conversion")
        let alpha = Tokens.UI.terracotta.withAlphaComponent(0.24).resolvedColor(with: Self.traits(.dark, .sage))
        #expect(Self.close(alpha.withAlphaComponent(1), Palette.resolved(.terracotta, accent: .sage, scheme: .dark)))
    }

    @Test func aMixOfTokensFollowsTheScheme() {
        var light = EnvironmentValues()
        light.colorScheme = .light
        var dark = EnvironmentValues()
        dark.colorScheme = .dark
        let wash = Tokens.cream.mix(with: Tokens.terracottaLight, by: 0.4, in: .device)
        #expect(wash.resolve(in: light).red > 0.8)
        #expect(wash.resolve(in: dark).red < 0.3)
    }

    @Test func theShareCardsPaletteIsLightTerracottaWhateverTheDeviceWears() {
        for token in [PaletteToken.cream, .text, .cardInterior2] {
            #expect(Palette.shared(token) === Palette.resolved(token, accent: .terracotta, scheme: .light))
        }
    }

    @Test func hueMadeColoursArePaletteJsons() throws {
        #expect(HueInk.allCases.map(\.paletteName).sorted() == Self.fixture.hueInks.keys.sorted())
        for role in HueInk.allCases {
            let want = try #require(Self.fixture.hueInks[role.paletteName])
            for scheme in PaletteScheme.allCases {
                let (L, C) = Palette.hueLC(role, scheme)
                #expect([L, C] == want[scheme.rawValue], "\(role.paletteName) \(scheme)")
            }
        }
        // Light as drawn before there was a dark scheme; dark inside Display P3.
        let pen = Palette.hueOKLCH(.nodePen, 290, .light)
        #expect(pen.L == 0.52 && pen.C == 0.11 && pen.H == 290)
        for h in stride(from: 0.0, to: 360, by: 15) {
            let d = Palette.hueOKLCH(.nodePenDeep, h, .dark)
            #expect(OKLCHColor.inP3(d.L, d.C, d.H))
        }
    }

    @Test func anAvatarKeepsItsHueInDarkAsPaletteJsonSays() throws {
        for row in Self.fixture.avatars {
            let scheme = try #require(PaletteScheme(rawValue: row.scheme))
            let got = try #require(OKLCHColor.avatarFill(row.stored, scheme))
            let want = try #require(OKLCHColor.components(row.fill))
            #expect(abs(got.L - want.L) <= 0.002 && abs(got.C - want.C) <= 0.002 && abs(got.H - want.H) <= 0.5, "\(row.stored) \(row.scheme)")
        }
        let avatar = try #require(OKLCHColor.avatar("oklch(88% 0.08 55)"))
        let light = UIColor(avatar).resolvedColor(with: Self.traits(.light, .sage))
        let dark = UIColor(avatar).resolvedColor(with: Self.traits(.dark, .sage))
        #expect(Self.close(light, UIColor(OKLCHColor.color(0.88, 0.08, 55))))
        #expect(Self.close(dark, UIColor(OKLCHColor.color(0.4, 0.068, 55))))
        #expect(OKLCHColor.avatar("#abcdef") == nil)
    }

    @MainActor @Test func aViewTakesTheThemeLaidOnItsWindow() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        let view = UIView()
        window.addSubview(view)
        window.traitOverrides.accent = .lavender
        window.traitOverrides.userInterfaceStyle = .dark
        window.layoutIfNeeded()
        #expect(view.traitCollection.accent == .lavender)
        #expect(Self.close(Tokens.UI.terracotta.resolvedColor(with: view.traitCollection),
                           Palette.resolved(.terracotta, accent: .lavender, scheme: .dark)))
    }
}

@MainActor @Suite struct AppearanceStoreTests {
    private func defaults() -> UserDefaults {
        let name = "appearance-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    @Test func everyoneStartsFollowingTheSystemInTerracotta() {
        let store = AppearanceStore(defaults: defaults(), scenes: { [] })
        #expect(store.mode == .system)
        #expect(store.accent == .terracotta)
        #expect(store.mode.interfaceStyle == nil)
    }

    @Test func theChoiceIsKeptOnTheDeviceUnderTheAppsKeys() {
        let d = defaults()
        let store = AppearanceStore(defaults: d, scenes: { [] })
        store.setMode(.dark)
        store.setAccent(.sage)
        #expect(d.string(forKey: "appearance.scheme") == "dark")
        #expect(d.string(forKey: "appearance.accent") == "sage")
        let again = AppearanceStore(defaults: d, scenes: { [] })
        #expect(again.mode == .dark && again.accent == .sage)
        #expect(again.mode.interfaceStyle == .dark)
        #expect(AppearanceStore.Mode.light.interfaceStyle == .light)
    }

    @Test func aValueItDoesNotKnowIsTheDefault() {
        let d = defaults()
        d.set("sepia", forKey: "appearance.scheme")
        d.set("wallpaper", forKey: "appearance.accent")
        let store = AppearanceStore(defaults: d, scenes: { [] })
        #expect(store.mode == .system && store.accent == .terracotta)
    }

    @Test func theSceneWearsTheChoiceAndFollowsTheSystemAgain() throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let store = AppearanceStore(defaults: defaults(), scenes: { [] })
        defer {
            scene.traitOverrides.remove(UITraitUserInterfaceStyle.self)
            scene.traitOverrides.remove(AccentTrait.self)
        }
        store.setMode(.dark)
        store.setAccent(.yellow)
        store.apply(to: scene)
        #expect(scene.traitOverrides.userInterfaceStyle == .dark)
        #expect(scene.traitOverrides.accent == .yellow)
        store.setMode(.system)
        store.apply(to: scene)
        #expect(!scene.traitOverrides.contains(UITraitUserInterfaceStyle.self))
    }
}
