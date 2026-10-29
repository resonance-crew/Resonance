import DesignSystem
import SwiftUI
import Testing
import UIKit

/// Every button has a fill and none draws a pen line (the owner's rule, as on the web): the verb
/// solid, everything beside it tonal, the way into a deletion a soft red, its final confirm solid
/// red — and the older variant names wear the new faces.
@MainActor @Suite struct ButtonFacesTests {
    @Test func everyRankIsAFilledFaceAndTheOldNamesWearTheNewOnes() {
        for variant in OrganicButton.Variant.allCases {
            #expect(OrganicButtonFace.of(variant).fill != .clear, "\(variant) has a fill")
        }
        // The verb: deep terracotta (cream on plain terracotta was 3.5:1), cream words.
        for verb: OrganicButton.Variant in [.solid, .primary] {
            #expect(OrganicButtonFace.of(verb).fill == Tokens.buttonFill)
            #expect(OrganicButtonFace.of(verb).label == Tokens.cream)
        }
        // Cancel, Close, Keep, Load more, Retry, Unblock: the tonal pill, whatever their call site still says.
        for quiet: OrganicButton.Variant in [.tonal, .text, .textAccent, .ghost, .outline] {
            #expect(OrganicButtonFace.of(quiet).fill == Tokens.buttonTonal, "\(quiet)")
            #expect(OrganicButtonFace.of(quiet).label == Tokens.buttonOnTonal, "\(quiet)")
        }
        #expect(OrganicButtonFace.of(.dangerTonal).fill == Tokens.buttonDangerTonal)
        #expect(OrganicButtonFace.of(.dangerTonal).label == Tokens.buttonOnDangerTonal)
        #expect(OrganicButtonFace.of(.danger).fill == Tokens.dangerFill)
        #expect(OrganicButtonFace.of(.danger).label == Tokens.cream)
        // Each wobbles like the variant it grew out of (the web's BTN_SEEDS).
        #expect(OrganicButtonFace.of(.solid).seed == 3 && OrganicButtonFace.of(.text).seed == 401)
        #expect(OrganicButtonFace.of(.tonal).seed == 601 && OrganicButtonFace.of(.dangerTonal).seed == 601)
        // Every face carries the buttons' grain but the paper, which carries the cards'.
        #expect(OrganicButtonFace.of(.tonal).grain == "grain-button" && OrganicButtonFace.of(.paper).grain == "grain-card")
    }

    /// At work, a button keeps its idle size exactly (the web's OrganicButton): the loop stands in
    /// a glyph's place or beside the words, which move over for it — nothing next to it moves.
    @Test func aButtonAtWorkKeepsItsIdleSize() {
        func size(_ button: OrganicButton) -> CGSize {
            UIHostingController(rootView: button.fixedSize()).sizeThatFits(in: CGSize(width: 1000, height: 1000))
        }
        let buttons: [OrganicButton] = [
            OrganicButton("發布", variant: .solid, size: .sm) {},
            OrganicButton("Publish", variant: .solid, size: .md) {},
            // The shorter word while it works, in the label's room (the publish step's 儲存修改).
            OrganicButton("儲存修改", variant: .solid, size: .sm) {}.workingLabel("儲存"),
            OrganicButton("AI 建議", icon: .sparkle, variant: .tonal, size: .sm) {},
            OrganicButton(icon: .pen, label: "Edit") {},
        ]
        for button in buttons {
            #expect(size(button.loading(true)) == size(button.loading(false)))
        }
    }

    /// Round 21 (the owner: a dialog's verb grew as its loop came in): a button that can be busy is always
    /// as wide as its busy self — the loop, 6, and its working words — and keeps the normal gutters around
    /// them; one with a shorter working word needs no more room than its idle words when they are wider;
    /// a button that never loads keeps its own words' size.
    @Test func aButtonThatCanBeBusyIsAsWideAsItsBusySelf() {
        func size(_ view: some View) -> CGSize {
            UIHostingController(rootView: view.fixedSize()).sizeThatFits(in: CGSize(width: 1000, height: 1000))
        }
        let plain = size(OrganicButton("發布", variant: .solid, size: .sm) {})
        let able = size(OrganicButton("發布", variant: .solid, size: .sm) {}.loading(false))
        let busy = size(OrganicButton("發布", variant: .solid, size: .sm) {}.loading(true))
        // No shorter word: room for the 14 loop and 6 more, at rest too.
        #expect(abs(able.width - plain.width - 20) < 1)
        #expect(abs(busy.width - able.width) < 0.5 && abs(busy.height - plain.height) < 0.5)
        // 清空垃圾桶 → 清空: the idle words are wider than the loop and 清空, so nothing grows.
        let long = size(OrganicButton("清空垃圾桶", variant: .danger, size: .sm) {})
        let longAble = size(OrganicButton("清空垃圾桶", variant: .danger, size: .sm) {}.workingLabel("清空").loading(false))
        let longBusy = size(OrganicButton("清空垃圾桶", variant: .danger, size: .sm) {}.workingLabel("清空").loading(true))
        #expect(abs(longAble.width - long.width) < 0.5)
        #expect(abs(longBusy.width - long.width) < 0.5)
        // A dialog's foot given a `busy` (false too) makes its verb one that can be; one given none doesn't.
        func foot(_ busy: Bool?) -> some View {
            ModalActions(busy: busy) {
                OrganicButton("取消", variant: .tonal, size: .sm) {}
            } verb: {
                OrganicButton("發布", variant: .solid, size: .sm) {}
            }
        }
        #expect(abs(size(foot(false)).width - size(foot(nil)).width - 20) < 1)
        #expect(abs(size(foot(true)).width - size(foot(false)).width) < 0.5)
    }
}
