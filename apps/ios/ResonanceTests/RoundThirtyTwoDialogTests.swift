import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Laid out as a dialog lays it out: `width` wide, as tall as it wants (up to `height`).
@MainActor func dialogSize<V: View>(_ view: V, width: CGFloat, height: CGFloat = 4000) -> CGSize {
    UIHostingController(rootView: view.frame(width: width)).sizeThatFits(in: CGSize(width: width, height: height))
}
