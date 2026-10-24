import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// The writer's second step (writer.spec §2, the web's PublishStep): 發布這張卡片 — 儲存這張卡片 for
/// a draft kept to its author, 更新這張卡片 for a live card — on one screen in the editor's place,
/// the publish panel grown into a page (publishing is still two taps: 下一步 → 發布). Top to bottom:
/// the mirror line (first publication only), the card as a list will show it with its cover edited
/// on the picture itself (round 7 §1.3), 標籤, 誰可以看見 — one choice of 公開 · 匿名公開 · 只有自己
/// with the one line that says what it means (§1.1) —, a line saying whether a resonance reaches its
/// original, then the foot — 存成草稿，稍後再寫 | 發布 · 匿名發布 · 儲存, by the audience (捨棄修改 |
/// 儲存修改 for a live card). Every choice is the model's own value and autosaves with the draft or
/// the live card's pending edit.
struct PublishStep: View {
    let model: WriteModel
    /// At the split the pane has no bar: the step names itself in its own first row (← 繼續寫 and
    /// the heading), level with the Leave over the map. Below it the bar does.
    let inlineHeading: Bool
    var onBack: () -> Void
    var onPickCover: () -> Void
    var onSubmit: () -> Void
    var onSecondary: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window

    private var updating: Bool { model.isPublished }
    private var compact: Bool { window.layoutClass == .compact }

    /// The way out beside the verb: always for a draft (存成草稿，稍後再寫); for a live card only while
    /// there is a revision to drop (捨棄修改).
    static func showsSecondary(_ model: WriteModel) -> Bool {
        !model.isPublished || model.hasPendingEdit || model.needsSave
    }

    /// Whether the preview's band is the first thing under the writer's bar: on a phone, with nothing
    /// above it — no heading of the step's own (the split's pane has no bar), no 更新這張卡片 hint, no
    /// mirror line on its way or shown. It is then drawn as home's first card is (`underBar`): the
    /// bar's pen line is its top edge, with no rule of its own under it, and its paper tucked under
    /// the bar's wave (the writer's bar ends on the same HeaderEdge as home's); the page starts it right
    /// at the bar (``topPadding(_:showsBar:compact:)``). With anything above it, the band keeps its
    /// own rule, as a card under another does.
    static func bandUnderBar(_ model: WriteModel, showsBar: Bool, compact: Bool) -> Bool {
        guard compact, showsBar, !model.showsUpdateHint else { return false }
        switch model.insight {
        case .loading?, .shown?: return false
        case .none?, nil: return true
        }
    }

    /// Where the step's content starts under the bar: right at its line when the band leads (its paper
    /// reaching up under the wave), else 16 below it; in the split's pane, level with the map's Leave.
    static func topPadding(_ model: WriteModel, showsBar: Bool, compact: Bool) -> CGFloat {
        guard showsBar else { return WriteWorkspace.paneTop }
        return bandUnderBar(model, showsBar: showsBar, compact: compact) ? 0 : 16
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Self.sectionGap) {
            if inlineHeading || model.showsUpdateHint {
                VStack(alignment: .leading, spacing: 8) {
                    if inlineHeading { headingRow }
                    // About readers: not said while the card is being kept to its author.
                    if model.showsUpdateHint {
                        CSSText(L10n.Write.PublishPanel.updateHint, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.7,
                                color: UIColor(Tokens.textMuted))
                    }
                }
            }
            if !updating { mirror }
            VStack(alignment: .leading, spacing: Self.sectionGap) {
                preview
                tags
                audience
            }
            // Publishing, saving or leaving: every control in the step waits (the web's fieldset disabled).
            .disabled(model.pending)
            VStack(alignment: .leading, spacing: 14) {
                WavyDivider(seed: 47).padding(.vertical, 2)
                foot
            }
        }
    }

    /// The section gap (the apps' 28) and label → control (10).
    static let sectionGap: CGFloat = 28
    static let labelGap: CGFloat = 10

    // MARK: The heading at the split

    private var headingRow: some View {
        HStack(spacing: 8) {
            OrganicIconButton(.arrowRight, label: L10n.Write.leaveStay, size: 18, mirrored: true, action: onBack)
                .disabled(model.pending)
                .padding(.leading, -13)
            Text(model.stepTitle)
                .font(AppFonts.heading(22))
                .tracking(-0.02 * 22)
                .foregroundStyle(Tokens.text)
                .lineLimit(2)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(minHeight: 38)
    }

    // MARK: 1 — the mirror moment

    @ViewBuilder private var mirror: some View {
        Group {
            switch model.insight {
            case .loading:
                HStack(spacing: 10) {
                    SketchLoader(size: 28)
                    Text(L10n.Write.PublishPanel.insightLoading).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
                .transition(.opacity)
            case let .shown(text):
                HStack(alignment: .top, spacing: 10) {
                    OrganicIcon(.sparkle, size: 16, color: Tokens.terracotta).padding(.top, 3)
                    CSSText(L10n.Write.PublishPanel.insight(coreInsight: text), font: AppFonts.scaledUIFont(.body, size: 14),
                            lineHeight: 1.7)
                }
                .transition(.opacity)
            case .none?, nil:
                EmptyView()
            }
        }
        // A null answer collapses the line (200 ms), above the preview rather than under a finger.
        .animation(.easeOut(duration: 0.2), value: model.insight)
    }

    // MARK: 2 — the card as a list shows it; its picture is the cover editor

    private var preview: some View {
        let content = model.preview(me: session.me)
        return VStack(alignment: .leading, spacing: 8) {
            Group {
                if compact {
                    // A phone: the list's own full-bleed band, edge to edge of the window — the first
                    // card under the bar, as home's, when nothing stands above it.
                    StoryCardView(content, position: 0, isLast: true,
                                  underBar: Self.bandUnderBar(model, showsBar: !inlineHeading, compact: compact))
                        .coverSlot { CoverSlot(model: model, onPick: onPickCover) }
                        .preview()
                        .padding(.horizontal, -20)
                } else {
                    StoryCardView(content, position: 0, bordered: true)
                        .coverSlot { CoverSlot(model: model, onPick: onPickCover) }
                        .preview()
                        .frame(maxWidth: Self.previewMaxWidth, alignment: .leading)
                }
            }
            // What it is, said once: the card as a list will show it (the caption under it is gone).
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L10n.Write.previewCaption)
            // Why the last picture didn't come: one line, only while there is one.
            if let error = model.mediaError {
                Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Wider than a phone, the preview keeps to a list column's card.
    static let previewMaxWidth: CGFloat = 360

    // MARK: 3 — tags

    private var tags: some View {
        @Bindable var model = model
        return VStack(alignment: .leading, spacing: Self.labelGap) {
            label(L10n.Write.tagsLabel)
            VStack(alignment: .leading, spacing: 6) {
                TagField(tags: model.values.tags, draft: $model.tagDraft, placeholder: L10n.Write.tagsPlaceholder,
                         suggesting: model.suggestingTags, onRemove: model.removeTag, onAdd: model.addTag,
                         onSuggest: { Task { await model.suggestTags() } })
                    .onChange(of: model.tagDraft) { _, text in model.typedTag(text) }
                Text(model.tagError ?? L10n.Write.tagsHelp)
                    .font(AppFonts.body(Tokens.hintSize))
                    .foregroundStyle(model.tagError == nil ? Tokens.textMuted : Tokens.terracotta)
            }
        }
    }

    // MARK: 4 — who can see it, and under whose name

    private var audience: some View {
        VStack(alignment: .leading, spacing: Self.labelGap) {
            label(L10n.Write.Visibility.label)
            // A segmented choice with no pen line (its options are buttons): a quiet paper-dark track
            // shows the control's extent, the chosen segment wears the tonal peach with the deep label.
            // Anonymity is a way of being public, so it is one of the three. A card kept for connections
            // only (older ones) shows none chosen and keeps its audience until one is.
            SegmentedActionBar([
                audienceOption(.public, L10n.Write.Visibility.`public`, icon: .globe),
                audienceOption(.anonymous, L10n.Write.Visibility.anonymous, icon: .mask),
                audienceOption(.private, L10n.Write.Visibility.`private`, icon: .lock),
            ], fill: Tokens.creamDark)
            // One line that says what the choice means — the preview above already wears the byline.
            hint(model.audienceLine(handle: session.me?.handle ?? ""))
                .contentTransition(.opacity)
                .animation(.easeOut(duration: 0.16), value: model.audience)
            // A resonance's line stays with the choice it follows.
            if let line = model.resonanceLine { resonance(line).padding(.top, 2) }
        }
    }

    private func audienceOption(_ audience: WriteModel.Audience, _ label: String, icon: IconName) -> SegmentSpec {
        let chosen = model.audience == audience
        // The other segments' ink stays deep enough to read on the track.
        return SegmentSpec(id: audience.rawValue, icon: icon, label: label,
                           fill: chosen ? Tokens.buttonTonal : nil,
                           ink: chosen ? Tokens.buttonOnTonal : Tokens.segmentIdleInk,
                           pressInk: .black.opacity(0.05), selected: chosen) {
            model.choose(audience)
        }
    }

    // MARK: 5 — whether a resonance tells its original's author

    private func resonance(_ line: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            OrganicIcon(.wave, size: 14, color: Tokens.terracotta)
            Text(line).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        // Said as it changes with the choices above it (the web's aria-live).
        .onChange(of: line) { _, now in AccessibilityNotification.Announcement(now).post() }
    }

    // MARK: The foot

    private var foot: some View {
        VStack(alignment: compact ? .center : .trailing, spacing: 12) {
            if model.publishWaitsForMedia {
                Text(L10n.Write.mediaBusyHint)
                    .font(AppFonts.body(12))
                    .foregroundStyle(Tokens.textMuted)
                    .frame(maxWidth: .infinity, alignment: compact ? .center : .trailing)
            }
            if let error = model.publishError {
                ModalError(error).frame(maxWidth: .infinity, alignment: compact ? .center : .trailing)
            }
            if compact {
                // A phone: the verb across the column, the way out as wide under it.
                VStack(spacing: 10) {
                    verb.fillingWidth().disabled(!Self.verbEnabled(model))
                    if Self.showsSecondary(model) { secondary.fillingWidth().disabled(model.pending && model.busyVerb != .leave) }
                }
            } else {
                // The dialogs' foot: right-aligned, the verb rightmost (on top once they don't fit side by side).
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) {
                        if Self.showsSecondary(model) { secondary.disabled(model.pending && model.busyVerb != .leave) }
                        verb.disabled(!Self.verbEnabled(model))
                    }
                    VStack(alignment: .trailing, spacing: 10) {
                        verb.disabled(!Self.verbEnabled(model))
                        if Self.showsSecondary(model) { secondary.disabled(model.pending && model.busyVerb != .leave) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .environment(\.organicButtonMinHeight, ModalMetrics.minButtonHeight)
        .allowsHitTesting(!model.pending)
    }

    private var verb: OrganicButton {
        // The verb follows the audience: 發布, 匿名發布, or 儲存 for a card kept to its author.
        OrganicButton(model.verbTitle, variant: .solid, size: .sm, action: onSubmit)
            .loading(model.pending && model.busyVerb == .publish)
            .workingLabel(updating ? L10n.Write.saveShort : nil)
    }

    private var secondary: OrganicButton {
        OrganicButton(updating ? L10n.Write.discardChanges : L10n.Write.saveDraftAndLeave, variant: .tonal, size: .sm,
                      action: onSecondary)
            .loading(model.pending && model.busyVerb == .leave)
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
            .accessibilityAddTraits(.isHeader)
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(AppFonts.body(Tokens.hintSize)).foregroundStyle(Tokens.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

extension PublishStep {
    /// The verb waits for the pictures on their way: disabled while one is (writer.spec §2.2).
    static func verbEnabled(_ model: WriteModel) -> Bool {
        !model.publishWaitsForMedia && !(model.pending && model.busyVerb != .publish)
    }
}

/// What lies in the preview's picture (the web's CoverFrame): with no cover the two ways to one —
/// 加一張圖片 · 生成圖片, the second waiting for a story — the pen's loader while one is on its way
/// (over the model's blurred, washed rough pass while it paints), and once there is one, the picture
/// is where it is changed (round 7 §1.3): one 更換封面 chip on its bottom-right corner, its menu
/// another picture · a drawn one · none.
private struct CoverSlot: View {
    let model: WriteModel
    var onPick: () -> Void

    var body: some View {
        ZStack {
            if model.mediaBusy {
                if model.generating, let partial = model.partialPreview {
                    Image(uiImage: partial).resizable().scaledToFill()
                        .blur(radius: 14)
                    Tokens.cream.opacity(0.45)
                }
                VStack(spacing: 6) {
                    SketchLoader(size: 64)
                    Text(model.generating ? L10n.Write.mediaGenerating : L10n.Write.mediaUploading)
                        .font(AppFonts.body(14, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                }
                .accessibilityElement(children: .combine)
            } else if model.values.imageURL != nil {
                Color.clear
                    .overlay(alignment: .bottomTrailing) { changeChip.padding(10) }
            } else {
                VStack(spacing: 8) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { pills }
                        VStack(spacing: 8) { pills }
                    }
                    if !model.canGenerate {
                        Text(L10n.Write.mediaGenerateNeedStory)
                            .font(AppFonts.body(12))
                            .foregroundStyle(Tokens.textMuted)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(12)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder private var pills: some View {
        OrganicButton(L10n.Write.mediaPlaceholder, icon: .image, variant: .tonal, size: .sm, action: onPick)
            .fixedSize()
        OrganicButton(L10n.Write.mediaGenerate, icon: .sparkle, variant: .tonal, size: .sm) {
            Task { await model.generateCover() }
        }
        .fixedSize()
        .disabled(!model.canGenerate)
    }

    /// 更換封面: the paper chip on the picture's corner, and what it offers — another picture, one drawn
    /// from the story (waiting for a story), or none.
    private var changeChip: some View {
        OrganicMenu(items: PublishStep.coverItems(canGenerate: model.canGenerate, pick: onPick,
                                                  generate: { Task { await model.generateCover() } },
                                                  remove: { model.removeCover() }),
                    label: L10n.Write.coverChange, seed: 36, trigger: .pill(L10n.Write.coverChange, .image))
    }
}

extension PublishStep {
    /// The cover's menu: 換一張圖片 · 生成圖片 (waiting for a story to draw from) · 移除圖片, in the danger tone.
    static func coverItems(canGenerate: Bool, pick: @escaping () -> Void, generate: @escaping () -> Void,
                           remove: @escaping () -> Void) -> [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "replace", title: L10n.Write.mediaReplace, icon: .image, action: pick),
            OrganicMenuItem(id: "generate", title: L10n.Write.mediaGenerate, icon: .sparkle, disabled: !canGenerate, action: generate),
            OrganicMenuItem(id: "remove", title: L10n.Write.mediaRemove, icon: .trash, danger: true, action: remove),
        ]
    }
}
