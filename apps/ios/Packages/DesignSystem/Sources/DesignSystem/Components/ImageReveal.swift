import SwiftUI

/// Blur-to-sharp (Wave 2 #7, every platform alike): a picture that arrives after its box is already on screen
/// comes in soft and sharpens — the skeleton (or the box's fill) stays under it until it has — while one at hand
/// (the memory cache's, a chat picture kept) is simply there, no flash, no blur. Covers and chat pictures 10 pt over
/// 320 ms, small thumbnails 4 over 240, avatars 3 over 200, the opacity reaching 1 in the first 40 %; the
/// full-screen viewer only fades. Reduce Motion and the release screenshots: nothing. Low Power Mode: the fade
/// alone (the owner's call). Stickers, the share card's renderer and a composer's own pictures never take it.
public nonisolated enum ImageReveal {
    public enum Kind: Sendable, CaseIterable {
        /// A cover, a story picture, a link's or a chat picture: 10 pt, 320 ms.
        case cover
        /// A small thumbnail (the bell's, the map's, a composer row's): 4 pt, 240 ms.
        case thumb
        /// A face: 3 pt, 200 ms.
        case avatar
        /// The full-screen viewer: a fade, never a blur.
        case viewer
    }

    public enum Effect: Equatable, Sendable {
        case none
        case fade(duration: Double)
        case blur(radius: CGFloat, duration: Double)
    }

    /// The blur a kind starts from (pt) and how long it takes to go (s).
    public static func strength(_ kind: Kind) -> (radius: CGFloat, duration: Double) {
        switch kind {
        case .cover: (10, 0.32)
        case .thumb: (4, 0.24)
        case .avatar: (3, 0.20)
        case .viewer: (0, 0.24)
        }
    }

    /// The share of the duration the opacity takes to reach 1 under a blur.
    public static let fadeShare = 0.4

    /// What a picture of `kind` plays as it arrives: nothing when it was at hand already (`atHand`: the memory
    /// cache's answer, or there on the first frame), under Reduce Motion or in the screenshots; a fade alone in the
    /// viewer and in Low Power Mode; else the blur.
    public static func decide(_ kind: Kind, atHand: Bool, budget: ImageRevealBudget) -> Effect {
        if atHand || budget.capture || budget.reduceMotion { return .none }
        let s = strength(kind)
        if kind == .viewer || budget.lowPower || s.radius <= 0 { return .fade(duration: s.duration) }
        return .blur(radius: s.radius, duration: s.duration)
    }

    /// The release screenshots (`-visualCapture YES`, Debug): set by the app at launch, read wherever no root has
    /// handed the budget down (a modal built before its presenter's environment reaches it).
    nonisolated(unsafe) public static var capturing = false
}

/// What the device allows a picture's arrival: the app's root sets it (``View/imageRevealBudget()``).
public nonisolated struct ImageRevealBudget: Equatable, Sendable {
    public var reduceMotion: Bool
    public var lowPower: Bool
    public var capture: Bool

    public init(reduceMotion: Bool = false, lowPower: Bool = false, capture: Bool = false) {
        self.reduceMotion = reduceMotion
        self.lowPower = lowPower
        self.capture = capture
    }

    /// As the device is now (no root to say otherwise).
    public static var ambient: ImageRevealBudget {
        ImageRevealBudget(reduceMotion: UIAccessibility.isReduceMotionEnabled,
                          lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled,
                          capture: ImageReveal.capturing)
    }
}

private nonisolated struct ImageRevealBudgetKey: EnvironmentKey {
    static var defaultValue: ImageRevealBudget { .ambient }
}

extension EnvironmentValues {
    public var imageRevealBudget: ImageRevealBudget {
        get { self[ImageRevealBudgetKey.self] }
        set { self[ImageRevealBudgetKey.self] = newValue }
    }
}

extension View {
    /// At the app's root: the pictures' budget from Reduce Motion, Low Power Mode (followed as it changes) and the
    /// screenshots, handed down to every picture.
    public func imageRevealBudget() -> some View { modifier(ImageRevealRoot()) }

    /// A picture's arrival as `effect` says, `under` (its loading face: the skeleton, the box's fill) kept beneath it
    /// until it has come; once it has, nothing of it is left on the view.
    public func imageReveal<Under: View>(_ effect: ImageReveal.Effect, @ViewBuilder under: () -> Under) -> some View {
        modifier(ImageRevealEffect(effect: effect, under: under()))
    }

    /// The same with nothing under it.
    public func imageReveal(_ effect: ImageReveal.Effect) -> some View {
        modifier(ImageRevealEffect(effect: effect, under: EmptyView()))
    }
}

private struct ImageRevealRoot: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled

    func body(content: Content) -> some View {
        content
            .environment(\.imageRevealBudget, ImageRevealBudget(reduceMotion: reduceMotion, lowPower: lowPower,
                                                                capture: ImageReveal.capturing))
            .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange).receive(on: RunLoop.main)) { _ in
                lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
            }
    }
}

/// The reveal itself: blurred and clear on its first frame, then sharp and opaque by animation; when it is done
/// the picture is drawn plain again (no blur at 0, no opacity at 1, nothing under it).
struct ImageRevealEffect<Under: View>: ViewModifier {
    let effect: ImageReveal.Effect
    let under: Under
    @State private var arrived = false
    @State private var sharp = false
    @State private var done = false

    func body(content: Content) -> some View {
        switch effect {
        case .none:
            content
        case _ where done:
            content
        case let .fade(duration):
            ZStack {
                under
                content.opacity(arrived ? 1 : 0)
            }
            .onAppear {
                withAnimation(.easeOut(duration: duration)) { arrived = true } completion: { done = true }
            }
        case let .blur(radius, duration):
            ZStack {
                under
                content
                    .blur(radius: sharp ? 0 : radius)
                    .opacity(arrived ? 1 : 0)
            }
            .onAppear {
                withAnimation(.easeOut(duration: duration * ImageReveal.fadeShare)) { arrived = true }
                withAnimation(.easeOut(duration: duration)) { sharp = true } completion: { done = true }
            }
        }
    }
}
