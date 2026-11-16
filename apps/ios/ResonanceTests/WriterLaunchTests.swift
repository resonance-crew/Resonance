import Foundation
import Testing
@testable import Resonance

/// The writer's launch arguments (Debug, screen checks and the release screenshots' `publish-cover` and
/// `cover-frame`, scripts/visual/ios.ts): `-writeStep publish` opens a card's writer on its publish step, and
/// `-coverFrame YES` then opens 調整封面 over its picture cover. A Release build reads neither.
@MainActor @Suite struct WriterLaunchTests {
    private func defaults(_ values: [String: Any]) -> UserDefaults {
        let name = "WriterLaunchTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        for (key, value) in values { defaults.set(value, forKey: key) }
        return defaults
    }

    @Test func thePublishStepOpensOnlyForPublish() {
        #if DEBUG
        #expect(WriterLaunch.opensPublishStep(defaults(["writeStep": "publish"])))
        #else
        #expect(!WriterLaunch.opensPublishStep(defaults(["writeStep": "publish"])))
        #endif
        #expect(!WriterLaunch.opensPublishStep(defaults(["writeStep": "write"])))
        #expect(!WriterLaunch.opensPublishStep(defaults([:])))
    }

    @Test func coverFrameIsReadAsAYesOrNo() {
        #if DEBUG
        #expect(WriterLaunch.opensCoverFrame(defaults(["coverFrame": "YES"])))
        #else
        #expect(!WriterLaunch.opensCoverFrame(defaults(["coverFrame": "YES"])))
        #endif
        #expect(!WriterLaunch.opensCoverFrame(defaults(["coverFrame": "NO"])))
        #expect(!WriterLaunch.opensCoverFrame(defaults([:])))
    }

    /// 調整封面 opens by itself only over a picture cover on the publish step, and once per launch.
    @Test func theCoverFrameOpensOnlyOverAPictureOnThePublishStep() {
        #expect(WriterLaunch.framesCover(asked: true, step: .publish, hasPicture: true, alreadyOpened: false))
        #expect(!WriterLaunch.framesCover(asked: false, step: .publish, hasPicture: true, alreadyOpened: false))
        #expect(!WriterLaunch.framesCover(asked: true, step: .write, hasPicture: true, alreadyOpened: false))
        #expect(!WriterLaunch.framesCover(asked: true, step: .publish, hasPicture: false, alreadyOpened: false))
        #expect(!WriterLaunch.framesCover(asked: true, step: .publish, hasPicture: true, alreadyOpened: true))
    }

    /// The Release path never reads either argument: both reads sit between `#if DEBUG` and `#else`.
    @Test func bothReadsStayInsideDebug() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("..").standardized
        let source = try String(contentsOf: root.appendingPathComponent("Resonance/Features/Write/WriteScreen.swift"),
                                encoding: .utf8)
        let launch = try #require(source.range(of: "enum WriterLaunch"))
        for read in [#"string(forKey: "writeStep")"#, #"bool(forKey: "coverFrame")"#] {
            let at = try #require(source.range(of: read, range: launch.upperBound..<source.endIndex))
            let debug = try #require(source.range(of: "#if DEBUG", options: .backwards, range: launch.upperBound..<at.lowerBound))
            let otherwise = try #require(source.range(of: "#else", range: at.upperBound..<source.endIndex))
            #expect(source.range(of: "#endif", range: debug.upperBound..<at.lowerBound) == nil)
            #expect(source.range(of: "#endif", range: at.upperBound..<otherwise.lowerBound) == nil)
        }
        // Nowhere else in the writer reads them.
        #expect(source.components(separatedBy: #"forKey: "writeStep""#).count == 2)
        let publish = try String(contentsOf: root.appendingPathComponent("Resonance/Features/Write/PublishStep.swift"),
                                 encoding: .utf8)
        #expect(!publish.contains(#"forKey: "coverFrame""#))
    }
}
