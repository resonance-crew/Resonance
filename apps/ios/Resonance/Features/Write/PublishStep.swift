import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// The writer's second step (writer.spec §2, the web's PublishStep): 發布這張卡片 — or 更新這張卡片
/// for a live card — on one screen in the editor's place, the publish panel grown into a page
/// (publishing is still two taps: 下一步 → 發布). Top to bottom: the mirror line (first publication
/// only), the card as a list will show it with its cover editor in its picture, 標籤, 誰可以看見,
/// 以匿名發布 with its byline, a line saying whether a resonance reaches its original, then the
/// foot — 存成草稿，稍後再寫 | 發布 (捨棄修改 | 儲存修改 for a live card). Every choice is the
/// model's own value and autosaves with the draft or the live card's pending edit.
struct PublishStep: View {
    let model: WriteModel
    /// At the split the pane has no bar: the step names itself in its own first row (← 繼續寫 and
    /// the heading), level with the Leave over the map. Below it the bar does.
    let inlineHeading: Bool
    /// The anonymous-publishing hint, for the writer's first few visits.
    let showsAnonymousHint: Bool
    var onBack: () -> Void
    var onPickCover: () -> Void
    var onSubmit: () -> Void
    var onSecondary: () -> Void
    @Environment(SessionStore.self) private var session
    @Environment(\.window) private var window

    private var updating: Bool { model.isPublished }
    private var compact: Bool { window.layoutClass == .compact }

    /// The step's heading: 發布這張卡片, or 更新這張卡片 for a live card.
    static func title(updating: Bool) -> String {
        updating ? L10n.Write.PublishPanel.updateTitle : L10n.Write.PublishPanel.title
    }

    /// The way out beside the verb: always for a draft (存成草稿，稍後再寫); for a live card only while
    /// there is a revision to drop (捨棄修改).
    static func showsSecondary(_ model: WriteModel) -> Bool {
        !model.isPublished || model.hasPendingEdit || model.needsSave
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Self.sectionGap) {
            if inlineHeading || updating {
                VStack(alignment: .leading, spacing: 8) {
                    if inlineHeading { headingRow }
                    if updating {
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
                anonymity
                if let line = model.resonanceLine { resonance(line) }
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
            Text(Self.title(updating: updating))
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
                    // A phone: the list's own full-bleed band, edge to edge of the window.
                    StoryCardView(content, position: 0, isLast: true)
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
            .accessibilityElement(children: .contain)
            .accessibilityLabel(L10n.Write.previewCaption)
            Text(L10n.Write.previewCaption)
                .font(AppFonts.body(12))
                .foregroundStyle(Tokens.textMuted)
                .accessibilityHidden(true)
            coverBelow
        }
    }

    /// Wider than a phone, the preview keeps to a list column's card.
    static let previewMaxWidth: CGFloat = 360

    /// Under the caption: another picture for one that is there, and why the last try didn't work.
    @ViewBuilder private var coverBelow: some View {
        let busy = model.mediaBusy
        if model.values.imageURL != nil && !busy {
            OrganicButton(L10n.Write.mediaReplace, variant: .tonal, size: .sm, action: onPickCover)
                .padding(.top, 4)
        }
        if let error = model.mediaError {
            Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
        }
    }

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

    // MARK: 4 — who can see it

    private var audience: some View {
        VStack(alignment: .leading, spacing: Self.labelGap) {
            label(L10n.Write.Visibility.label)
            // A segmented choice with no pen line (its options are buttons): a quiet paper-dark track
            // shows the control's extent, the chosen side wears the tonal peach with the deep label. A
            // card kept for connections only (older ones) shows neither side chosen and keeps its
            // audience until one is.
            SegmentedActionBar([
                visibilityOption("public", L10n.Write.Visibility.`public`, icon: .globe),
                visibilityOption("private", L10n.Write.Visibility.`private`, icon: .lock),
            ], fill: Tokens.creamDark)
            // Never for connections only: who could read it would say who wrote it.
            if model.values.anonymous { hint(L10n.Write.PublishPanel.anonymousVisibility) }
        }
    }

    private func visibilityOption(_ value: String, _ label: String, icon: IconName) -> SegmentSpec {
        let chosen = model.values.visibility == value
        // The other side's ink stays deep enough to read on the track.
        return SegmentSpec(id: value, icon: icon, label: label,
                           fill: chosen ? Tokens.buttonTonal : nil,
                           ink: chosen ? Tokens.buttonOnTonal : Tokens.segmentIdleInk,
                           pressInk: .black.opacity(0.05), selected: chosen) {
            model.choose(visibility: value)
        }
    }

    // MARK: 5 — publish anonymously, with the byline the world will get

    private var anonymity: some View {
        VStack(alignment: .leading, spacing: Self.labelGap) {
            HStack(spacing: 12) {
                Text(L10n.Write.PublishPanel.anonymousToggle).font(AppFonts.body(14)).foregroundStyle(Tokens.text)
                Spacer(minLength: 0)
                OrganicToggle(isOn: Binding(get: { model.values.anonymous }, set: { model.setAnonymous($0) }),
                              label: L10n.Write.PublishPanel.anonymousToggle, seed: 57)
            }
            // Seeing is understanding: the exact card head the world will get.
            HStack(spacing: 10) {
                if model.values.anonymous {
                    HandDrawnAvatar(initials: "·", color: Tokens.creamDark, size: 34, seed: 97)
                } else if let me = session.me {
                    HandDrawnAvatar(initials: me.initials, imageURL: me.avatarUrl.flatMap(URL.init(string:)),
                                    color: OKLCHColor.parse(me.accentColor) ?? Tokens.terracottaLight, size: 34, seed: 7)
                }
                Text(model.values.anonymous ? L10n.Write.PublishPanel.anonymousName : session.me?.handle ?? "")
                    .font(AppFonts.body(14, weight: .semibold))
                    .foregroundStyle(model.values.anonymous ? Tokens.textMuted : Tokens.text)
            }
            .accessibilityElement(children: .combine)
            if showsAnonymousHint && !model.values.anonymous { hint(L10n.Write.PublishPanel.anonymousHint) }
        }
        .animation(.easeOut(duration: 0.2), value: model.values.anonymous)
    }

    // MARK: 6 — whether a resonance tells its original's author

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
        OrganicButton(updating ? L10n.Write.PublishPanel.update : L10n.Write.PublishPanel.publish, variant: .solid, size: .sm,
                      action: onSubmit)
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
/// (over the model's blurred, washed rough pass while it paints), and once there is one, the
/// editor's ✕ to take it away.
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
                    .overlay(alignment: .topTrailing) { removeChip.padding(12) }
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

    /// The editor's ✕ (HandDrawnImage's): the dark chip on the picture's corner.
    private var removeChip: some View {
        Button { model.removeCover() } label: {
            ZStack {
                let chip = WobRectShape(radius: 34 * 0.4, seed: 36, mag: 34 * 0.022, options: WobRectOptions(
                    curve: 1.3, cornerJitter: 3.2, cornerOffset: 34 * 0.06, segmentsH: .count(1), segmentsV: .count(1)))
                chip.fill(Tokens.imageRemoveFill)
                chip.stroke(Tokens.imageRemoveStroke, lineWidth: Tokens.ink)
                OrganicIcon(.close, size: 16, color: Tokens.cream)
            }
            .frame(width: 34, height: 34)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.Write.mediaRemove)
    }
}
