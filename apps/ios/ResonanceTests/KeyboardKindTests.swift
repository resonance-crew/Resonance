import Testing
@testable import Resonance

/// What the writer reads off the keyboard's frame: an iPad's hardware keyboard (a sliver, the format
/// bar runs on to the foot), and a Mac's strip across the window's foot, which the format bar stands on.
@Suite struct KeyboardKindTests {
    @Test func aSliverIsAnIPadsHardwareKeyboardButNeverAMacsStrip() {
        #expect(KeyboardKind.isHardware(height: 0, onMac: false))
        #expect(KeyboardKind.isHardware(height: 55, onMac: false))
        #expect(!KeyboardKind.isHardware(height: 320, onMac: false))
        #expect(!KeyboardKind.isHardware(height: 55, onMac: true))
    }

    @Test func theStripCoversTheWindowsFootUntilItGoesBelowIt() {
        // The Mac's strip: 55 up from the foot of a 985-tall window.
        #expect(KeyboardKind.overlap(windowHeight: 985, keyboardTop: 930) == 55)
        // Gone: at or below the foot.
        #expect(KeyboardKind.overlap(windowHeight: 985, keyboardTop: 985) == 0)
        #expect(KeyboardKind.overlap(windowHeight: 985, keyboardTop: 1040) == 0)
    }
}
