import Foundation
import Testing
@testable import Resonance

/// The tag field's rules (TagField.tsx and its test), without a keyboard: separators, trimming,
/// repeats, when the segment adds and when Backspace takes a tag back. The twin of Android's TagInputTest.
@Suite struct TagInputTests {
    @Test func textWithoutASeparatorIsStillBeingTyped() {
        #expect(TagInput.split("travel").words.isEmpty)
        #expect(TagInput.split("travel").rest == "travel")
        #expect(TagInput.split("").rest == "")
    }

    @Test(arguments: ["travel,", "travel，", "travel、"])
    func aCommaOfEitherWidthOrTheEnumerationCommaEndsATag(_ typed: String) {
        let (words, rest) = TagInput.split(typed)
        #expect(words == ["travel"])
        #expect(rest == "")
    }

    @Test func whatFollowsTheLastSeparatorStaysToBeTypedOn() {
        #expect(TagInput.split("home,fa") == (["home"], "fa"))
        // A space after a separator is not part of the next word.
        #expect(TagInput.split("home,  fa") == (["home"], "fa"))
    }

    @Test func aPastedListSplitsInOneGo() {
        let (words, rest) = TagInput.split("home, travel，family、 ,memory")
        // Untrimmed and blanks included: merge is what cleans them.
        #expect(words == ["home", " travel", "family", " "])
        #expect(rest == "memory")
        #expect(TagInput.merge([], words) == ["home", "travel", "family"])
    }

    @Test func mergeTrimsAndSkipsBlanksAndRepeats() {
        #expect(TagInput.merge(["home"], [" travel ", "", "home", "family", "  ", "travel"]) == ["home", "travel", "family"])
    }

    @Test func mergeKeepsTheOrderTheyWereAdded() {
        #expect(TagInput.merge(["b"], ["a", "c"]) == ["b", "a", "c"])
    }

    @Test func nothingNewLeavesTheListAsItWas() {
        #expect(TagInput.merge(["a", "b"], ["b", " "]) == ["a", "b"])
    }

    // MARK: The segment and the hardware Backspace (round 16 §1)

    @Test func aWordIsReadyOnlyOnceTypedAndNoLongerBeingComposed() {
        #expect(TagInput.ready(draft: "旅行", composing: false))
        #expect(!TagInput.ready(draft: "ㄌㄩˇ", composing: true))
        #expect(!TagInput.ready(draft: "   ", composing: false))
        #expect(!TagInput.ready(draft: "", composing: false))
        #expect(TagInput.trimmed("  旅行 ") == "旅行")
    }

    @Test func backspaceTakesTheLastTagBackOnlyInAnEmptyFieldNotComposing() {
        #expect(TagInput.takesBackLast(draft: "", composing: false))
        #expect(!TagInput.takesBackLast(draft: "a", composing: false))
        #expect(!TagInput.takesBackLast(draft: "", composing: true))
    }
}
