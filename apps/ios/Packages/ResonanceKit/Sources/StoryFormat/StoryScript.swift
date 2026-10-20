/// How a story is set: CJK (a Ming title over a Hei body, justified) or Latin (Playfair over DM
/// Sans, ragged) — the web's `data-script` (src/styles/story.css). Which one a story is, is the
/// script rule's to say (`ScriptRule` in ResonanceKit, the twin of src/lib/text/script.ts); the
/// reader, the writer and a share card take their type from it (DesignSystem's `StoryTypography`).
public nonisolated enum StoryScript: String, Sendable, Hashable, CaseIterable {
    case cjk, latin
}
