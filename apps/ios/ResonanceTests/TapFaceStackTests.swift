import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 29 §S5 (the owner: 「不要把當有第四、第五個的時候顯示成灰色，這樣子好像又怪怪的。所以呢這一套邏輯在現在共振的按鈕，文章末…
/// 共振的按鈕底下的這個重疊頭貼的邏輯也要一併修改」): the faces under the capsule — a reader's and the author's — show at most
/// three faces and nothing after them: no blank disc, however many there are. Who else there is, the list says, and a
/// screen reader still hears 等人.
@MainActor @Suite struct TapFaceStackTests {
    private func width<V: View>(_ view: V) -> CGFloat {
        UIHostingController(rootView: view.fixedSize()).sizeThatFits(in: CGSize(width: 600, height: 400)).width
    }

    @Test func threeFacesAndNothingAfterThem() {
        let five = ["a", "b", "c", "d", "e"].map { TapFaces.face(Fixture.author($0)) }
        // Five handed over: three drawn, as wide as three faces — no fourth disc.
        #expect(abs(width(FaceStack(faces: five)) - FaceStack.width(count: 3, size: FaceStack.size)) < 0.5)
        #expect(abs(width(FaceStack(faces: Array(five.prefix(3)))) - width(FaceStack(faces: five))) < 0.5)
        #expect(FaceStack.width(count: 4, size: 28) == FaceStack.width(count: 3, size: 28))
        // None: nothing at all.
        #expect(width(FaceStack(faces: [])) < 0.5)
    }

    @Test func aReadersRowIsAsWideWithMoreAsWithout() {
        let three = ["dora", "eli", "fay"].map { Fixture.author($0) }
        let row = width(TapFaces(faces: three, spoken: "", isButton: true) {})
        #expect(abs(row - (FaceStack.width(count: 3, size: 28) + 2 * TapFaces.buttonPad)) < 0.5)
        // A fourth person in the answer changes what is heard, never what is drawn.
        var tap = TapState(Fixture.tap(faces: ["dora", "eli", "fay"], more: true))
        #expect(tap.showsMore)
        #expect(tap.spoken(viewer: "alice", language: .zhTW).contains(L10n.Card.Tap.more))
        _ = tap.flip(viewer: Fixture.author("alice"))
        #expect(abs(width(TapFaces(faces: tap.shownFaces, spoken: "", isButton: true) {}) - row) < 0.5)
    }

    /// The author's line (``AuthorTaps``) draws the same stack: the three newest faces, and it says there are more.
    @Test func theAuthorsLineHearsMoreAndDrawsThree() {
        let four = ["gus", "hana", "bob", "carol"].map { Fixture.author($0) }
        let drawn = four.prefix(FaceStack.maxFaces).map(TapFaces.face)
        #expect(abs(width(FaceStack(faces: drawn)) - FaceStack.width(count: 3, size: 28)) < 0.5)
        #expect(TapState.spokenForAuthor(Array(four.prefix(3)), more: true, language: .zhTW).contains(L10n.Card.Tap.more))
    }
}
