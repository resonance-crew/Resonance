import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// The writer's second step (writer.spec §2, the web's PublishStep): 發布這張卡片 — 儲存草稿 while 草稿 is
/// chosen, 更新這張卡片 for a card readers have — on one screen in the editor's place, the publish
/// panel grown into a page (publishing is still two taps: ✓ → 發布). Top to bottom: the mirror line
/// (first publication only), the card as a list will show it with its cover edited on the picture
/// itself (round 7 §1.3; what went wrong with a cover said there too, round 8 §3), 標籤, 卡片類型 — one
/// choice of 公開 · 匿名公開 · 草稿, no line under it: the preview's byline follows the choice (round 8
/// §2.2) —, a line saying whether a resonance reaches its original, then the foot: one button whose
/// verb follows the card and the choice (§2.3), and 捨棄修改 beside it only for a published card's
/// revision. Every choice is the model's own value and autosaves with the draft or the live card's
/// pending edit.
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

    /// The only second button left (round 8 §2.3): 捨棄修改, for a published card while it has a
    /// revision to drop. A draft's choices are its one button (草稿 is one of them).
    static func showsSecondary(_ model: WriteModel) -> Bool {
        model.isPublished && (model.hasPendingEdit || model.needsSave)
    }

    /// The paper of the preview's band (a phone's: the list's first card, by the cover's hue), which
    /// the gap a pull opens over it wears while it leads under the bar (round 8 §6.3).
    static func bandPalette(_ model: WriteModel) -> CardPalette {
        previewPalette(accentHue: model.values.accentHue, cardId: model.draftId)
    }

    /// The preview's family (round 9 §8): a card with a cover, its cover's hue's; one without, its own
    /// from its id (`seedFromId(id) % 6`), so its cover buttons wear that card's colours — the first
    /// family's only while it has no id yet. (A list still colours a coverless card by its place.)
    static func previewPalette(accentHue: Double?, cardId: String?) -> CardPalette {
        if accentHue != nil { return CardPalette(accentHue: accentHue, position: 0) }
        return CardPalette(index: cardId.map(CardPalette.family(id:)) ?? 0)
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

    /// Whether the preview is the step's first thing (no hint, no mirror line on its way or shown).
    static func previewLeads(_ model: WriteModel) -> Bool {
        guard !model.showsUpdateHint else { return false }
        switch model.insight {
        case .loading?, .shown?: return false
        case .none?, nil: return true
        }
    }

    /// Where the step's content starts under the bar (round 11 §4, measured from the bar's pen line as the
    /// card page's head is): on a phone right at its line when the band leads (its paper reaching up under
    /// the wave); a tablet's preview card, leading, as far under it as a card page's cover
    /// (`--story-head-cover-gap`); anything else first — the mirror's line, the update hint — where the
    /// writer's title stands (`--story-head-gap`). In the split's pane, level with the map's Leave.
    static func topPadding(_ model: WriteModel, showsBar: Bool, compact: Bool) -> CGFloat {
        guard showsBar else { return WriteWorkspace.paneTop(row: headingRowHeight) }
        if bandUnderBar(model, showsBar: showsBar, compact: compact) { return 0 }
        if compact { return PenLineGap.fromFoot(Tokens.storyHeadGapCompact) }
        return PenLineGap.fromFoot(previewLeads(model) ? Tokens.storyHeadCoverGap : Tokens.storyHeadGap)
    }

    var body: some View {
        let sectionGap = Self.sectionGap(compact: compact)
        VStack(alignment: .leading, spacing: sectionGap) {
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
            VStack(alignment: .leading, spacing: sectionGap) {
                preview
                tags
                audience
            }
            // Publishing, saving or leaving: every control in the step waits (the web's fieldset disabled).
            .disabled(model.pending)
            // The rule over the foot stands in the middle of one section gap, not with a gap of its own on
            // each side: the verb stays near the choice that names it.
            VStack(alignment: .leading, spacing: sectionGap / 2) {
                WavyDivider(seed: 47)
                foot
            }
            .padding(.top, -sectionGap / 2)
        }
    }

    /// Between the step's sections (round 11 §4: `--publish-section-gap`, 40 on a phone, 48 wider), and
    /// a section's label → its control (`--publish-label-gap`, 12).
    static func sectionGap(compact: Bool) -> CGFloat {
        compact ? Tokens.publishSectionGapCompact : Tokens.publishSectionGap
    }
    static let labelGap: CGFloat = Tokens.publishLabelGap

    // MARK: The heading at the split

    /// ← 繼續寫, the step's name, and under it its save state — as the bar says them below the split
    /// (round 11 §5: the name's second line, its height kept, the name alone on the arrow's line meanwhile).
    private var headingRow: some View {
        HStack(spacing: 8) {
            OrganicIconButton(.arrowRight, label: L10n.Write.leaveStay, size: 18, mirrored: true, action: onBack)
                .disabled(model.pending)
                .padding(.leading, -13)
            BarTitles(model.stepTitle, font: AppFonts.heading(22), tracking: -0.02 * 22,
                      subtitle: WriteModel.SaveState.subtitle(model.saveState, help: model.saveStateHelp))
                // Centred on the row, never growing it: the arrow stays level with the Leave over the map.
                .frame(maxHeight: Self.headingRowHeight)
                .layoutPriority(1)
            Spacer(minLength: 8)
        }
        .frame(height: Self.headingRowHeight)
    }

    /// The split's heading row (← 繼續寫 and the step's name): level with the Leave floating over the map.
    static let headingRowHeight: CGFloat = 38

    // MARK: 1 — the mirror moment

    @ViewBuilder private var mirror: some View {
        Group {
            switch model.insight {
            case .loading:
                HStack(spacing: 10) {
                    SketchLoader(size: 28)
                    Text(L10n.Write.PublishPanel.insightLoading).font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                }
                .frame(minHeight: mirrorRoom, alignment: .topLeading)
                .transition(.opacity)
            case let .shown(text):
                HStack(alignment: .top, spacing: 10) {
                    OrganicIcon(.sparkle, size: 16, color: Tokens.terracotta).padding(.top, 3)
                    CSSText(L10n.Write.PublishPanel.insight(coreInsight: text), font: AppFonts.scaledUIFont(.body, size: 14),
                            lineHeight: 1.7)
                }
                .frame(minHeight: mirrorRoom, alignment: .topLeading)
                .transition(.opacity)
            case .none?, nil:
                EmptyView()
            }
        }
        // A null answer collapses the line (200 ms), above the preview rather than under a finger.
        .animation(.easeOut(duration: 0.2), value: model.insight)
    }

    /// On a phone the mirror's line keeps two lines' room from the start (round 11 §4): the echo is mostly
    /// two lines there, and the preview under it doesn't move when the words come in place of the loader.
    private var mirrorRoom: CGFloat? { compact ? 2 * 14 * 1.7 : nil }

    // MARK: 2 — the card as a list shows it; its picture is the cover editor

    private var preview: some View {
        let content = model.preview(me: session.me)
        let palette = Self.bandPalette(model)
        // Nothing under the preview: why a cover didn't come is said on the picture (``CoverSlot``).
        return Group {
            if compact {
                // A phone: the list's own full-bleed band, edge to edge of the window — the first
                // card under the bar, as home's, when nothing stands above it.
                StoryCardView(content, position: 0, isLast: true,
                              underBar: Self.bandUnderBar(model, showsBar: !inlineHeading, compact: compact), palette: palette.index)
                    .coverSlot { CoverSlot(model: model, palette: palette, onPick: onPickCover) }
                    .preview()
                    .padding(.horizontal, -20)
            } else {
                StoryCardView(content, position: 0, bordered: true, palette: palette.index)
                    .coverSlot { CoverSlot(model: model, palette: palette, onPick: onPickCover) }
                    .preview()
                    .frame(maxWidth: Self.previewMaxWidth, alignment: .leading)
            }
        }
        // What it is, said once: the card as a list will show it (the caption under it is gone).
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Write.previewCaption)
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
                // No help line under the field (round 8 §2.2): the slot shows only an error.
                if let error = model.tagError {
                    Text(error)
                        .font(AppFonts.body(Tokens.hintSize))
                        .foregroundStyle(Tokens.terracotta)
                }
            }
        }
    }

    // MARK: 4 — the card's type

    private var audience: some View {
        VStack(alignment: .leading, spacing: Self.labelGap) {
            label(L10n.Write.Visibility.label)
            // A segmented choice with no pen line (its options are buttons): a quiet paper-dark track
            // shows the control's extent, the chosen segment wears the tonal peach with the deep label.
            // Anonymity is a way of being shared, so it is one of the three; 草稿 is the author's alone. A
            // card kept for connections only (older ones) shows none chosen and keeps its audience until
            // one is. No line under it: the preview's byline above already follows the choice.
            SegmentedActionBar([
                audienceOption(.public, L10n.Write.Visibility.`public`, icon: .globe),
                audienceOption(.anonymous, L10n.Write.Visibility.anonymous, icon: .mask),
                audienceOption(.private, L10n.Write.Visibility.draft, icon: .lock),
            ], fill: Tokens.creamDark)
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
        // The one button follows the card and its type: 發布 · 匿名發布 · 儲存 · 儲存修改 · 轉為草稿.
        OrganicButton(model.verbTitle, variant: .solid, size: .sm, action: onSubmit)
            .loading(model.pending && model.busyVerb == .publish)
            .workingLabel(model.verbTitle == L10n.Write.PublishPanel.update ? L10n.Write.saveShort : nil)
    }

    /// 捨棄修改: a published card's revision dropped.
    private var secondary: OrganicButton {
        OrganicButton(L10n.Write.discardChanges, variant: .tonal, size: .sm, action: onSecondary)
            .loading(model.pending && model.busyVerb == .leave)
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
            .accessibilityAddTraits(.isHeader)
    }
}

extension PublishStep {
    /// The verb waits for the pictures on their way: disabled while one is (writer.spec §2.2).
    static func verbEnabled(_ model: WriteModel) -> Bool {
        !model.publishWaitsForMedia && !(model.pending && model.busyVerb != .publish)
    }
}

/// What lies in the preview's picture (the web's CoverFrame): with no cover the two ways to one —
/// 加一張圖片 · 生成圖片, the second waiting for a story — the pen's loader while one is on its way, in
/// the card's deep pen (over the cover it replaces, or the model's rough pass while it paints, blurred
/// and washed to the picture's whole outline: ``veil(width:height:)``), and once there is one, the picture
/// is where it is changed (round 7 §1.3): one 更換封面 chip on its bottom-right corner, its menu
/// another picture · a drawn one · none. What went wrong with the last try is said here too (round 8
/// §3): under the empty picture's pills, or on a paper chip at the top-left of the cover that stays.
private struct CoverSlot: View {
    let model: WriteModel
    /// The preview's family: the cover's controls wear it (round 9 §8).
    let palette: CardPalette
    var onPick: () -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if model.mediaBusy {
                    veil(width: geo.size.width, height: geo.size.height)
                    VStack(spacing: 6) {
                        SketchLoader(size: 64, color: palette.deep)
                        Text(model.generating ? L10n.Write.mediaGenerating : L10n.Write.mediaUploading)
                            .font(AppFonts.body(14, weight: .semibold))
                            .foregroundStyle(palette.deep)
                    }
                    .accessibilityElement(children: .combine)
                } else if model.values.imageURL != nil {
                    Color.clear
                        .overlay(alignment: .bottomTrailing) { changeChip.padding(10) }
                        // A replacement or a drawn one failed: the old cover stays, and a chip over it says why.
                        .overlay(alignment: .topLeading) {
                            if let error = model.mediaError {
                                CoverErrorChip(message: error)
                                    .frame(maxWidth: geo.size.width * CoverErrorChip.widthShare, alignment: .leading)
                                    .padding(.top, 14)
                                    .padding(.leading, 16)
                                    .transition(.opacity)
                            }
                        }
                } else {
                    VStack(spacing: 8) {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 8) { pills }
                            VStack(spacing: 8) { pills }
                        }
                        // The last try's trouble, in the error's ink, in place of the hint while there is one.
                        if let error = model.mediaError {
                            Text(error)
                                .font(AppFonts.body(12))
                                .foregroundStyle(Tokens.terracotta)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityAddTraits(.isStaticText)
                                .onAppear { AccessibilityNotification.Announcement(error).post() }
                        } else if !model.canGenerate {
                            Text(L10n.Write.mediaGenerateNeedStory)
                                .font(AppFonts.body(12))
                                .foregroundStyle(Tokens.textMuted)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(12)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
            .animation(.easeOut(duration: 0.16), value: model.mediaError)
        }
    }

    /// What lies under the loader while a cover is on its way: the cover it replaces, or the model's
    /// rough pass while it paints, blurred and washed in the card's paper — neither is the settled
    /// picture, and the loader and its words read over it (the web's veiled `.coverBusy`). It reaches
    /// past the box as far as the picture does (``organicImageBleed``), so the card's clip cuts it to
    /// the picture's whole outline, bulges and all; with no picture yet, the stripes stay as they are.
    @ViewBuilder private func veil(width w: CGFloat, height h: CGFloat) -> some View {
        let bleed = organicImageBleed(w, h)
        let partial = model.generating ? model.partialPreview : nil
        if partial != nil || model.values.imageURL != nil {
            ZStack {
                if let partial {
                    Image(uiImage: partial).resizable().scaledToFill()
                } else if let url = model.values.imageURL {
                    // Blurred, it needs no more pixels than its points.
                    RemoteImage(url: url, pixelSize: CGSize(width: w + bleed * 2, height: h + bleed * 2))
                }
            }
            .frame(width: w + bleed * 2, height: h + bleed * 2)
            .clipped()
            .blur(radius: 14, opaque: true)
            .overlay(palette.interior.opacity(0.45))
            // Takes the box's room; the veil reaches past it by the bleed on every side.
            .frame(width: w, height: h)
            .accessibilityHidden(true)
        }
    }

    /// 加一張圖片 · 生成圖片 in the card's own colours (round 9 §8): the family's deep pen as the face,
    /// its paper's words; 生成圖片 waiting for a story wears the family's tonal step and the muted words.
    @ViewBuilder private var pills: some View {
        OrganicButton(L10n.Write.mediaPlaceholder, icon: .image, variant: .solid, size: .sm, action: onPick)
            .face(.cardDeep(palette))
            .fixedSize()
        OrganicButton(L10n.Write.mediaGenerate, icon: .sparkle, variant: .solid, size: .sm) {
            Task { await model.generateCover() }
        }
        .face(.cardDeep(palette), disabled: .cardDeepDisabled(palette))
        .fixedSize()
        .disabled(!model.canGenerate)
    }

    /// 更換封面: the chip on the picture's corner in the card's colours — its fill, its pen line, its deep
    /// words — and what it offers, on a panel of the same hue: another picture, one drawn from the story
    /// (waiting for a story), or none.
    private var changeChip: some View {
        OrganicMenu(items: PublishStep.coverItems(canGenerate: model.canGenerate, pick: onPick,
                                                  generate: { Task { await model.generateCover() } },
                                                  remove: { model.removeCover() }),
                    label: L10n.Write.coverChange, seed: 36, trigger: .pill(L10n.Write.coverChange, .image))
            .pill(palette: palette)
    }
}

/// Why the last try at a cover didn't work, over the cover that stays (round 8 §3): the 更換封面
/// chip's sibling — paper with the hand-drawn edge (the web's CoverErrorChip: the menu chip's
/// squircle in the cream at 94 %, a soft shadow under it) — its words in the error's ink, 12
/// semibold, wrapping within 70 % of the picture's width. It goes with the next cover action.
private struct CoverErrorChip: View {
    let message: String
    /// The most of the picture's width it takes before its words wrap.
    static let widthShare: CGFloat = 0.7

    var body: some View {
        Text(message)
            .font(AppFonts.body(12, weight: .semibold))
            .lineSpacing(3)
            .foregroundStyle(Tokens.terracotta)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background {
                CoverErrorChipShape()
                    .fill(Tokens.cream.opacity(0.94))
                    .shadow(color: .black.opacity(0.22), radius: 1.5, y: 1)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isStaticText)
            .onAppear { AccessibilityNotification.Announcement(message).post() }
    }
}

/// The error chip's edge: the menu chip's squircle grown into a pill (radius 0.42 of its height,
/// at most 16; two turns along, one across).
private nonisolated struct CoverErrorChipShape: Shape {
    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        return WobRectShape(radius: min(h * 0.42, 16), seed: 43, mag: min(h, 34) * 0.03, options: WobRectOptions(
            curve: 1.4, cornerJitter: 2.4, segmentsH: .count(2), segmentsV: .count(1)
        )).path(in: rect)
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
