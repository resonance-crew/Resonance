// swift-tools-version: 6.2
import PackageDescription

// The app's non-UI core: the generated /api/v1 client (ResonanceAPI), the
// pieces around it (auth middleware, error mapping), localization, a story's
// prose and script (ResonanceKit/Story: plain text, the script rule, what a
// share card quotes), and the story format (StoryFormat: Markdown → the
// reader's blocks).
// Builds for macOS too, so `swift test` runs without a simulator.
let package = Package(
    name: "ResonanceKit",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "ResonanceKit", targets: ["ResonanceKit"]),
        .library(name: "ResonanceAPI", targets: ["ResonanceAPI"]),
        .library(name: "StoryFormat", targets: ["StoryFormat"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.1"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.1"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.1"),
        // Stories are Markdown; the reader parses them with Apple's CommonMark/GFM parser.
        .package(url: "https://github.com/swiftlang/swift-markdown", from: "0.9.0"),
    ],
    targets: [
        .target(
            name: "ResonanceAPI",
            dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .target(
            name: "ResonanceKit",
            dependencies: [
                "ResonanceAPI",
                // The story model (a story's script is StoryFormat's `StoryScript`; the rule that reads it is here).
                "StoryFormat",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                // What a share card quotes is read block by block, as CommonMark reads the story (SharePassages).
                .product(name: "Markdown", package: "swift-markdown"),
            ]
        ),
        // A story's Markdown as the reader's blocks (no UI, so it tests on the Mac).
        .target(name: "StoryFormat", dependencies: [.product(name: "Markdown", package: "swift-markdown")]),
        .testTarget(name: "ResonanceKitTests", dependencies: ["ResonanceKit", "StoryFormat"]),
        // The story-link fixture is read with the link rules the reader keys previews by (ResonanceKit's).
        .testTarget(name: "StoryFormatTests", dependencies: ["StoryFormat", "ResonanceKit"]),
    ]
)
