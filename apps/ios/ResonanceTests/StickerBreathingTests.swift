import Foundation
import Testing
@testable import Resonance

/// Round 25 §D (the owner: 「想请你省电模式这一个拿掉。啊，省电模式应该没有影响这么大」): the sticker picker breathes at its
/// full limit whatever the battery — Low Power Mode changes nothing — and holds still only under Reduce Motion, as
/// Android's `pickerHoldsStill()` does (battery saver out, the animator scale at 0 in).
@MainActor @Suite struct StickerBreathingTests {
    @Test func lowPowerModeNoLongerHoldsThePickerStill() {
        #expect(!StickerPlayback.still(reduceMotion: false, lowPower: true))
        #expect(!StickerPlayback.still(reduceMotion: false, lowPower: false))
    }

    @Test func reduceMotionStillHoldsItStillWhateverTheBattery() {
        #expect(StickerPlayback.still(reduceMotion: true, lowPower: false))
        #expect(StickerPlayback.still(reduceMotion: true, lowPower: true))
    }

    @Test func underLowPowerTheLimitIsTheFullOne() {
        // 8 at once on a phone (4 columns), 12 on a tablet or the popover (6) — never halved.
        #expect(StickerBreathing.capacity(columns: 4) == 8 && StickerBreathing.capacity(columns: 6) == 12)
        #expect(StickerBreathing.phoneCapacity == 8 && StickerBreathing.wideCapacity == 12)
    }
}
