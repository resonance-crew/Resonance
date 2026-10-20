import Testing
import WebKit
@testable import Resonance

/// Closing the writer frees its editor: the bridge and its web view (with the
/// 600 KB island and its web content process) don't outlive the screen.
@MainActor @Suite struct StoryEditorBridgeTests {
    final class Weak<T: AnyObject> {
        weak var value: T?
    }

    @Test func aClosedEditorLetsGoOfItsWebView() async throws {
        let bridge = Weak<StoryEditorBridge>(), webView = Weak<WKWebView>()
        try await openEditor(bridge, webView)
        // Its only owner (the writer's model) is gone; WebKit may let go over the next turns of the run loop.
        let end = ContinuousClock.now.advanced(by: .seconds(3))
        while bridge.value != nil || webView.value != nil, ContinuousClock.now < end {
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(bridge.value == nil)
        #expect(webView.value == nil)
    }

    /// The story is one field: the web form bar (‹ › Done) WebKit puts over the keyboard is left
    /// out — the view that takes the keyboard answers no accessory view.
    @Test func theEditorHasNoFormBarOverTheKeyboard() {
        let editor = StoryEditorBridge(placeholder: "Write")
        let content = editor.webView.scrollView.subviews.first { String(describing: type(of: $0)).hasPrefix("WKContent") }
        #expect(content != nil)
        #expect(content.map { NSStringFromClass(type(of: $0)).hasSuffix("_ResonanceNoAccessory") } == true)
        #expect(content?.inputAccessoryView == nil)
        // Asked again (the page's "ready"), nothing changes.
        editor.webView.hideFormAccessoryBar()
        #expect(content.map { NSStringFromClass(type(of: $0)).hasSuffix("_ResonanceNoAccessory") } == true)
    }

    /// The writer's bare page (layout=canvas) sets an empty story in the interface language's type,
    /// tells the host (the title above it follows), and reads the story's type again — with the card's
    /// title — once the writing clearly leans the other way.
    @Test func theCanvasTellsHowTheStoryIsSet() async throws {
        let english = StoryEditorBridge(placeholder: "Write", layout: .canvas, locale: "en")
        #expect(english.script == .latin)
        let chinese = StoryEditorBridge(placeholder: "寫", layout: .canvas, locale: "zh-TW")
        #expect(chinese.script == .cjk)
        try await waitReady(english)
        try await waitReady(chinese)
        #expect(english.script == .latin)
        #expect(chinese.script == .cjk)
        // An English title in a Chinese interface: a moment after the writing pauses, the story is set as Latin.
        chinese.setTitle("The rain stopped just before dusk and the street outside the bakery shone like glass")
        // The island waits for a pause before it reads the type again; a busy machine (CI, several builds) can take a while.
        let end = ContinuousClock.now.advanced(by: .seconds(15))
        while chinese.script != .latin, ContinuousClock.now < end { try await Task.sleep(for: .milliseconds(50)) }
        #expect(chinese.script == .latin)
        #expect(chinese.scriptLang == "en")
    }

    /// The caret's line is kept only while the story has the focus; a type the host doesn't know is left alone.
    @Test func theCaretIsTheStorysWhileItHasTheFocus() {
        let editor = StoryEditorBridge(placeholder: "Write", layout: .canvas, locale: "en")
        editor.handle("caret", ["top": NSNumber(value: 120), "bottom": NSNumber(value: 148)])
        #expect(editor.caret == nil)
        editor.handle("focus", ["focused": true])
        editor.handle("caret", ["top": NSNumber(value: 120), "bottom": NSNumber(value: 148)])
        #expect(editor.caret == .init(top: 120, bottom: 148))
        editor.handle("focus", ["focused": false])
        #expect(editor.caret == nil)
        editor.handle("script", ["script": "cjk", "lang": "zh-Hant"])
        #expect(editor.script == .cjk)
        #expect(editor.scriptLang == "zh-Hant")
        editor.handle("script", ["script": "klingon"])
        #expect(editor.script == .cjk)
        editor.handle("someday", ["what": 1])
        // The canvas sizes itself to what is written (no 200 floor of the framed field).
        editor.handle("height", ["px": NSNumber(value: 60)])
        #expect(editor.height == 60)
        let field = StoryEditorBridge(placeholder: "Write")
        field.handle("height", ["px": NSNumber(value: 60)])
        #expect(field.height == 200)
    }

    private func waitReady(_ editor: StoryEditorBridge) async throws {
        let end = ContinuousClock.now.advanced(by: .seconds(15))
        while !editor.ready, ContinuousClock.now < end { try await Task.sleep(for: .milliseconds(50)) }
        #expect(editor.ready)
    }

    /// An editor as the writer holds one, loaded and talking — the island has
    /// said "ready" through the script message handler — then let go.
    private func openEditor(_ bridge: Weak<StoryEditorBridge>, _ webView: Weak<WKWebView>) async throws {
        let editor = StoryEditorBridge(placeholder: "Write")
        bridge.value = editor
        webView.value = editor.webView
        let end = ContinuousClock.now.advanced(by: .seconds(15))
        while !editor.ready, ContinuousClock.now < end { try await Task.sleep(for: .milliseconds(50)) }
        #expect(editor.ready)
    }
}
