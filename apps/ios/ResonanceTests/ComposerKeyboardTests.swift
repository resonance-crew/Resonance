import DesignSystem
import Testing
@testable import Resonance

/// Round 24 §C, the owner's iPhone: after looking at stickers, ⌨ "sometimes didn't bring the keyboard back". Every tap
/// on ⌨ now asks for the keyboard — the face tapped decides, ⌨ stays while the keyboard is on its way (a second tap
/// asks again, never the panel back), the field is asked outright even when the composer thought it had the focus,
/// and the wait for the keyboard ends the way the person meant it to.
@MainActor @Suite struct ComposerKeyboardTests {
    @Test func keyboardKeyAsksForTheKeyboardAndStaysUntilItIsUp() {
        var panels = ComposerPanels()
        #expect(panels.tapStickerKey(keyboard: false) == false)
        #expect(panels.stickersOpen && panels.sendFace(canSend: false) == .expand)
        // ⌨: the keyboard asked for, the panel under it until it is up — ⌨ still drawn, Send's face back meanwhile.
        #expect(panels.tapStickerKey(keyboard: true) == true)
        let first = panels.asks
        #expect(panels.awaitingKeyboard && panels.stickersOpen && panels.shown == .stickers)
        #expect(panels.sendFace(canSend: false) == .send)
        // ⌨ again before it came (the tap that seemed not to have taken): asked again — the panel never back, the
        // keyboard on its way never put away — and only the latest ask's wait counts.
        #expect(panels.toggleStickers() == true)
        #expect(panels.awaitingKeyboard && panels.shown == .stickers && panels.asks == first + 1)
        panels.keyboardShown()
        #expect(!panels.isOpen && !panels.stickersOpen)
    }

    @Test func theFaceTappedDecidesNotThePanelsAtTheMomentOfTheTap() {
        // ⌨ was drawn, but the panel had gone from under it before the tap landed: the keyboard is still what was asked
        // for — never the sticker panel opened again.
        var panels = ComposerPanels()
        #expect(panels.tapStickerKey(keyboard: true) == true)
        #expect(!panels.isOpen && !panels.awaitingKeyboard)
        // ☺ drawn over the attach panel while the field's keyboard comes (a tap on the field): the stickers, no wait.
        panels.open(.attach)
        panels.keyboardRequested()
        #expect(panels.tapStickerKey(keyboard: false) == false)
        #expect(panels.shown == .stickers && !panels.awaitingKeyboard)
    }

    @Test func aFocusGivenUpBeforeTheKeyboardCameEndsTheWaitAndThePanel() {
        var panels = ComposerPanels()
        panels.open(.stickers)
        // Nothing asked for: losing the focus leaves the panel be (it opened by letting the keyboard go).
        #expect(panels.focusLost() == false)
        #expect(panels.isOpen)
        // ⌨, then a drag on the thread put the coming keyboard away: the panel goes too, and nothing waits to bring
        // that keyboard back.
        _ = panels.tapStickerKey(keyboard: true)
        #expect(panels.focusLost() == true)
        #expect(!panels.isOpen && !panels.awaitingKeyboard)
    }

    @Test func aFieldThatNeverTookTheFocusLeavesThePanelWithItsKeyboardKey() {
        var panels = ComposerPanels()
        panels.open(.stickers)
        panels.setExpanded(true)
        _ = panels.tapStickerKey(keyboard: true)
        panels.keyboardNeverCame()
        // The panel as it was (grown still), ⌨ there, ↓ on the send segment — and ⌨ asks again.
        #expect(panels.shown == .stickers && panels.expanded && !panels.awaitingKeyboard)
        #expect(panels.stickersOpen && panels.sendFace(canSend: false) == .collapse)
        #expect(panels.tapStickerKey(keyboard: true) == true && panels.awaitingKeyboard)
    }

    @Test func theWaitLooksTwiceThenEnds() {
        #expect(KeyboardWait.firstLook < KeyboardWait.lastLook)
        // A keyboard rising: waited for (its didShow takes the panel away), and the last look lets the panel go anyway.
        #expect(KeyboardWait.next(keyboardComing: true, fieldFocused: true, noneComes: false, last: false) == .keepWaiting)
        #expect(KeyboardWait.next(keyboardComing: true, fieldFocused: true, noneComes: false, last: true) == .close)
        // The field has the focus and no keyboard will come into the panel's place — a hardware keyboard, told apart
        // directly, or a floating one: the panel goes at the first look.
        #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: true, noneComes: true, last: false) == .close)
        #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: true, noneComes: true, last: true) == .close)
        // The field has the focus and no keyboard has sent a frame yet, with nothing to say none will come: a slow
        // keyboard — the panel stays under it until the last look (never the composer dipped to the screen's foot).
        #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: true, noneComes: false, last: false) == .keepWaiting)
        #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: true, noneComes: false, last: true) == .close)
        // The field didn't take the focus: asked once more, then the panel is left as it was (never a foot with no
        // keyboard under it) — whatever keyboard is connected.
        for noneComes in [false, true] {
            #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: false, noneComes: noneComes, last: false) == .askAgain)
            #expect(KeyboardWait.next(keyboardComing: false, fieldFocused: false, noneComes: noneComes, last: true) == .giveUp)
        }
    }

    @Test func aPanelPutAwayMidWaitTakesTheComingKeyboardWithIt() {
        // ⌨, then a tap on the thread or the foot's paper (or the grip swiped down) before the keyboard came: the panel
        // goes, and the composer is told the ask is over — so a field UIKit never gave the focus can't raise that
        // keyboard at some later update.
        var panels = ComposerPanels()
        panels.open(.stickers)
        _ = panels.tapStickerKey(keyboard: true)
        #expect(panels.putAway() == true)
        #expect(!panels.isOpen && !panels.awaitingKeyboard && !panels.stickersOpen)
        // No ask open: the panel goes and nothing is said of the focus (the panel opened by letting it go).
        panels.open(.attach)
        #expect(panels.putAway() == false)
        #expect(!panels.isOpen)
        // A field that never took the focus (the wait gave up): the panel stays with ⌨, and putting it away asks nothing.
        panels.open(.stickers)
        _ = panels.tapStickerKey(keyboard: true)
        panels.keyboardNeverCame()
        #expect(panels.putAway() == false)
    }

    @Test func theFootUnderPlusAndTheKeyboardKeyIsTheirsWhileAPanelShows() {
        // While a panel shows, the paper between the capsule and the panel is ⌨'s and ＋'s to the last point — a near miss
        // there no longer puts the panel away with no keyboard.
        #expect(ThreadComposer.reachBelow(panelOpen: true) == ComposerMetrics.bottomGap)
        #expect(ComposerMetrics.bottomGap > 0)
        // No panel: a tap under the capsule is the paper's (it puts the keyboard away, as a tap on the thread does).
        #expect(ThreadComposer.reachBelow(panelOpen: false) == 0)
    }

    @Test func aRetakeLeavesAKeyboardOnItsWayAlone() {
        // Held with no keyboard over it, long enough after the focus was taken, no hardware keyboard: let go and taken
        // again.
        #expect(FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: 2, hardwareKeyboard: false))
        #expect(FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: .infinity, hardwareKeyboard: false))
        // An impatient second ⌨ between the field taking the focus and the keyboard's first frame: the keyboard on its
        // way is not restarted.
        #expect(!FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: 0, hardwareKeyboard: false))
        #expect(!FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: FieldFocus.retakeGrace - 0.05, hardwareKeyboard: false))
        #expect(FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: FieldFocus.retakeGrace, hardwareKeyboard: false))
        // A keyboard already over the screen, or a hardware keyboard (none comes on the screen): nothing to retake.
        #expect(!FieldFocus.retakes(keyboardOnScreen: true, sinceFocus: 2, hardwareKeyboard: false))
        #expect(!FieldFocus.retakes(keyboardOnScreen: false, sinceFocus: 2, hardwareKeyboard: true))
    }

    @Test func anAskReachesUIKitEvenWhenTheComposerThoughtItHadTheFocus() {
        // The binding true already (setting it again is no change, so no ask by itself): an ask still takes the focus
        // the field doesn't hold, and lets go and retakes the focus it holds with no keyboard over it.
        #expect(FieldFocus.next(wanted: true, held: false, inWindow: true, asked: true) == .take)
        #expect(FieldFocus.next(wanted: true, held: true, inWindow: true, asked: true) == .retake)
        // No ask: the binding alone — taken when wanted and not held, kept when held.
        #expect(FieldFocus.next(wanted: true, held: false, inWindow: true, asked: false) == .take)
        #expect(FieldFocus.next(wanted: true, held: true, inWindow: true, asked: false) == .none)
        // Out of a window nothing can take the focus.
        #expect(FieldFocus.next(wanted: true, held: false, inWindow: false, asked: true) == .none)
        // Not wanted: given up when held, and an ask can't keep it.
        #expect(FieldFocus.next(wanted: false, held: true, inWindow: true, asked: true) == .give)
        #expect(FieldFocus.next(wanted: false, held: false, inWindow: true, asked: true) == .none)
    }
}
