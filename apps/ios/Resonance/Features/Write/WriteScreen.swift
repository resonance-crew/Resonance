import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// Writing a card (the web's write page, writer.spec), in two steps on one page. Writing: a bare
/// page — the one-line title and the story in the editor island, set as the card page sets them —
/// under the bar (back · short title · save state … ✓, round 8 §2.1; at the split the ✓ floats at
/// the pane's top with the save state before it), with the formatting docked on the keyboard while
/// the story has the focus. ✓ asks for a title, makes sure a new draft is kept, and opens the
/// publish step in the same place (``PublishStep``): the mirror, the card as a list will show it
/// with its cover, tags, the card's type (公開 · 匿名公開 · 草稿), then one button by the card and its
/// type (§2.3). The story stays mounted under the step, so its undo history and selection survive
/// the round trip; drafts save themselves a moment after typing stops, in either step.
/// A page on the tab's stack like the others: the bar's arrow (or the edge swipe) goes back from the
/// publish step to writing, and from writing out of the page, asking first when there is writing to
/// put away. It is always the card of a ``WriteWorkspace``: alone under its bar below the split
/// width, the editor pane beside the thought map from 1200 across (round 5 E5), where the
/// workspace's own Back and edge swipe ask through `pane`.
/// Opened on a card in the trash it says so, with 還原並繼續寫; a card moved to the trash while it is
/// open here (another device) says so where the save line was, with 還原, keeping what is typed.
struct WriteScreen: View {
    let request: WriteLauncher.Request
    /// What the workspace asks of this card (saving now, the way back); filled in here.
    let pane: WritePane
    /// The writer's bar (back and title) over the editor: not in the split workspace's pane.
    var showsBar = true
    /// A card opened from the thought map in the workspace's pane: being done with it (published,
    /// revised, dropped, saved and left) hides the pane rather than leaving the page.
    var onDone: (() -> Void)? = nil
    /// The keyboard is a hardware one (``KeyboardKind``): the format bar keeps clear of the system's input pill.
    var hardwareKeyboard = false
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openRoute) private var openRoute
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The writer takes the whole window; from 1200 across, the thought map beside it (design §12).
    @Environment(\.window) private var window
    @State private var model: WriteModel?
    /// Each step's own bar line (the page under the bar has scrolled).
    @State private var scrolledWrite = false
    @State private var scrolledPublish = false
    /// The "leave for now?" question is open.
    @State private var leaving = false
    /// Opening a card that is missing or not yours.
    @State private var notFound = false
    /// Opening one of your cards that is in the trash: nothing is written into it until it is restored.
    @State private var inTrash: DraftService.OpenedCard?
    @State private var restoringOpened = false
    @State private var restoreOpenedFailed = false
    /// The publish step has been shown (it stays mounted from then: a cover on its way, the mirror's answer).
    @State private var publishLoaded = false
    /// The format bar is on the keyboard (the story has the focus, or had it a moment ago).
    @State private var formatBar = false
    @State private var pickingCard = false
    /// The link editor (round 16 §6, a modal since round 17): the format bar's 連結, or a link card tapped in the story.
    @State private var linkRequest: StoryLinkRequest?
    /// The link editor's request as it was opened, kept through its closing (the modal fades out with it).
    @State private var linkShown: StoryLinkRequest?
    @State private var coverItem: PhotosPickerItem?
    @State private var pickingCover = false
    @State private var inlineItem: PhotosPickerItem?
    @State private var pickingInline = false
    /// The format bar's 插入圖片 or 插入卡片 took the keyboard from the story: given back as its picker closes.
    @State private var storyLentFocus = false
    @FocusState private var titleFocused: Bool
    /// The title had the focus as the publish step opened: back to writing puts it there again.
    @State private var titleHadFocus = false
    /// What is left of the writing page's height under the title (the story's least height).
    @State private var storyRoom: CGFloat = 320
    @State private var publishScroll = ScrollPosition(edge: .top)
    /// The publish step's offset from its top (its content offset past the bar's inset).
    @State private var publishOffset: CGFloat = 0
    /// The height the publish step's scroll shows (its content is never shorter: the paper under it takes taps too).
    @State private var publishRoom: CGFloat = 0
    /// The tag field's capsule in the publish step's content: taps there are the field's own.
    @State private var tagFieldFrame: CGRect = .null
    private static let writeSpace = "write.content"
    @State private var writeScroll = ScrollPosition(edge: .top)
    @State private var writeViewport = CaretFollow.Viewport(offset: 0, insetTop: 0, height: 0)
    /// Where the story's island begins in the writing page's content.
    @State private var islandTop: CGFloat = 0

    var body: some View {
        Group {
            if let model {
                steps(model)
            } else if let inTrash {
                trashedNotice(inTrash)
            } else if notFound {
                missing
            } else {
                // The card loads straight from Firestore, painting a loader meanwhile (the editor loads behind it).
                SketchLoader()
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(.top, 120)
            }
        }
        // On to the screen's foot, under the home indicator: at the whole width the map lies under the pane
        // (ignoring the safe areas), and a strip of it showed there.
        .background { Tokens.cream.ignoresSafeArea() }
        .safeAreaInset(edge: .top, spacing: 0) {
            if showsBar { bar.transition(.opacity) }
        }
        // The pane given the whole width, or the split again: the bar fades in (out) as the floating ✓
        // fades out (in), the page settling under it on the same curve.
        .animation(.easeInOut(duration: Self.chromeFade), value: showsBar)
        .toolbar(.hidden, for: .navigationBar)
        // Leaving the app saves what is written now, not 1.5s later (the web's visibilitychange flush).
        .onChange(of: scenePhase) { _, phase in
            if phase != .active, let model { model.store() }
        }
        .task {
            if model == nil, inTrash == nil, !notFound { await open() }
        }
    }

    // MARK: Opening

    /// Opens the card (or a new one): the editor's page starts loading beside the card's read.
    private func open() async {
        let locale = Strings.shared.language.rawValue
        let editor = StoryEditorBridge(placeholder: L10n.Write.storyPlaceholder, layout: .canvas, locale: locale)
        var opened: DraftService.OpenedCard?
        if let cardId = request.cardId {
            opened = try? await session.drafts?.open(cardId)
            guard let card = opened else {
                notFound = true
                pane.goBack = { dismiss() }
                pane.leave = { dismiss() }
                return
            }
            if card.trashedAt != nil {
                inTrash = card
                pane.goBack = { dismiss() }
                pane.leave = { dismiss() }
                return
            }
        }
        let model = WriteModel(drafts: session.drafts, writing: session.writing, referenceCardId: request.referenceCardId,
                               opened: opened, locale: locale, editor: editor)
        // A live card's link cards show the pages the server read for them (round 16 §6).
        if let previews = opened?.linkPreviews, !previews.isEmpty { editor.setLinkPreviews(previews, origin: session.config.origin) }
        #if DEBUG
        // `-writeTitle "…" -writeStory "…" -writeCover <url>` fill a new card (screen checks; the simulator can't type into it).
        let defaults = UserDefaults.standard
        if request.cardId == nil {
            if let title = defaults.string(forKey: "writeTitle") { model.values.title = title }
            if let cover = defaults.string(forKey: "writeCover").flatMap(URL.init(string:)) { model.values.imageURL = cover }
            if let story = defaults.string(forKey: "writeStory") {
                model.editor.setMarkdown(story)
                model.values.story = story
            }
            // `-writeTags "a,b"` chooses those tags, `-writeTagDraft "…"` types into the tag field (round 16 §1's checks).
            if let tags = defaults.string(forKey: "writeTags") { model.values.tags = TagInput.merge([], tags.components(separatedBy: ",")) }
            if let draft = defaults.string(forKey: "writeTagDraft") { model.tagDraft = draft }
        }
        // `-writeTagsAdd "c,d" -writeTagsAddAfter <s>` adds tags that many seconds in, as the model's would arrive.
        if let more = defaults.string(forKey: "writeTagsAdd") {
            let after = max(1, defaults.double(forKey: "writeTagsAddAfter"))
            Task { @MainActor [weak model] in
                try? await Task.sleep(for: .seconds(after))
                model?.values.tags = TagInput.merge(model?.values.tags ?? [], more.components(separatedBy: ","))
            }
        }
        #endif
        if let story = request.story {
            model.editor.setMarkdown(story)
            model.values.story = story
        }
        // A picture in the story that didn't go in says so in the app's toast, wherever the story is scrolled.
        let toasts = session.toasts
        model.tell = { toasts.show($0) }
        // A 私人卡's 公開發表 (round 12 §3): the page opens on the publish step, 公開 (匿名公開) chosen — the step
        // there from the first frame rather than crossing over from the writing page.
        if request.publishPublicly, await model.openPublishing() { publishLoaded = true }
        self.model = model
        // The workspace's Back, its edge swipe and its hiding of the pane come here.
        pane.saveNow = { [weak model, writer] in
            guard let model else { return }
            model.store()
            // The lists hear of it (the map's titles, the card box) once the server has it, as on leaving.
            Task { _ = await model.settled(within: Self.leaveWait); writer.leave(model.change) }
        }
        pane.cardId = { [weak model] in model?.draftId }
        // The publish step is held too: the edge swipe takes it back to writing.
        pane.holds = { [weak model] in model.map { $0.holdsWriting || $0.needsSave || $0.step == .publish } ?? false }
        pane.goBack = { [weak model] in if let model { goBack(model) } }
        pane.leave = { [weak model] in if let model { leaveAsking(model) } }
        #if DEBUG
        // `-writeStep publish` opens a new card's publish step at once (screen checks).
        if defaults.string(forKey: "writeStep") == "publish" { Task { await next(model) } }
        // `-writeFocus YES` puts the caret in the story once its page is up (the format bar on the keyboard).
        if defaults.bool(forKey: "writeFocus") {
            Task {
                while !model.editor.ready { try? await Task.sleep(for: .milliseconds(100)) }
                try? await Task.sleep(for: .seconds(1))
                model.editor.focus()
            }
        }
        // `-writePaste "…"` (with `-writePasteHTML "…"` beside it: a rich-text source's clipboard) pastes into
        // the story once its page is up, as the system's paste reaches it — never the person's own clipboard.
        if let paste = defaults.string(forKey: "writePaste") {
            let html = defaults.string(forKey: "writePasteHTML")
            Task {
                while !model.editor.ready { try? await Task.sleep(for: .milliseconds(100)) }
                try? await Task.sleep(for: .seconds(1.5))
                model.editor.debugPaste(text: paste, html: html)
            }
        }
        // `-writeAppend "…" -writeAppendAfter <seconds>` types onto the story a while later (a save to watch).
        if let more = defaults.string(forKey: "writeAppend") {
            let after = max(1, defaults.double(forKey: "writeAppendAfter"))
            Task {
                try? await Task.sleep(for: .seconds(after))
                model.values.story += more
                model.store()
            }
        }
        #endif
    }

    // MARK: The bar

    /// Back · title … ✓ (round 8 §2.1): the title short at every size (新卡片, 編輯草稿, 編輯卡片 — the
    /// step's own in the publish step), the save state its second line (round 11 §5: under it, 12 and
    /// muted, the two centred on the row; the line kept while it is empty, the title meanwhile on the
    /// row's line), and ✓ at the end while writing.
    private var bar: some View {
        let step = model?.step ?? .write
        // The publish step's heading follows the card and its type: 發布這張卡片, 儲存草稿 or 更新這張卡片.
        let title = step == .publish ? model?.stepTitle ?? L10n.Write.PublishPanel.title
            : model?.title ?? (request.cardId == nil ? L10n.Write.title : inTrash.map(WriteModel.pageTitle) ?? L10n.Write.editTitle)
        return OrganicInlineBar(title, backLabel: step == .publish ? L10n.Write.leaveStay : L10n.App.Nav.back,
                                scrolled: step == .publish ? scrolledPublish : scrolledWrite) {
            EmptyView()
        } trailing: {
            if let model, model.step == .write, !model.trashed {
                finishButton(model)
            }
        }
        .subtitle(WriteModel.SaveState.subtitle(model?.saveState, help: model?.saveStateHelp))
        .titleFirst()
        .onBack { if let model { goBack(model) } else { dismiss() } }
    }

    /// ✓ 完成: the one way forward while writing — the bar's ghost glyph, at its end (at the split,
    /// floating at the pane's top) — to the publish step. Nothing written on a new card yet, it waits;
    /// while a new card's first save runs past a moment, its glyph is the pen's small loop.
    private func finishButton(_ model: WriteModel) -> some View {
        OrganicIconButton(.check, label: L10n.Write.finish, size: 22) { Task { await next(model) } }
            .loading(model.nextLoading)
            .disabled(!model.canGoNext)
            .help(L10n.Write.finish)
    }

    // MARK: The two steps

    private func steps(_ model: WriteModel) -> some View {
        let writing = model.step == .write
        let shift: CGFloat = reduceMotion ? 0 : 16
        return ZStack(alignment: .top) {
            writeStep(model)
                .opacity(writing ? 1 : 0)
                .offset(x: writing ? 0 : -shift)
                .allowsHitTesting(writing)
                .accessibilityHidden(!writing)
            if Self.mountsPublishStep(loaded: publishLoaded, step: model.step) {
                publishStep(model)
                    .opacity(writing ? 0 : 1)
                    .offset(x: writing ? shift : 0)
                    .allowsHitTesting(!writing)
                    .accessibilityHidden(writing)
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.22), value: model.step)
        .onChange(of: model.step) { _, step in
            if step == .publish {
                publishLoaded = true
                publishScroll.scrollTo(edge: .top)
                UIAccessibility.post(notification: .screenChanged, argument: nil)
            } else if titleHadFocus {
                titleFocused = true
            }
        }
        .onChange(of: model.titleError) { _, asking in if asking { titleFocused = true } }
        // The bar's save state is a polite live region: each new word is heard.
        .onChange(of: model.saveState) { _, state in SaveStateWord.announce(state) }
        .onChange(of: model.restoredAlone) { _, alone in
            guard alone else { return }
            model.restoredAlone = false
            session.restoredAloneNotice = true
        }
        .photosPicker(isPresented: $pickingInline, selection: $inlineItem, matching: .images)
        .photosPicker(isPresented: $pickingCover, selection: $coverItem, matching: .images)
        // The format bar's 插入圖片 lent the keyboard to the photo picker (round 8 §6.5): as the picker closes,
        // picked or not, the story takes the focus back with its caret where it was — and with it the
        // keyboard and the format bar — before the picture is uploaded.
        .onChange(of: pickingInline) { _, open in
            guard !open, storyLentFocus else { return }
            storyLentFocus = false
            Task {
                try? await Task.sleep(for: Self.pickerSettle)
                model.editor.refocus()
            }
        }
        .onChange(of: inlineItem) { _, item in
            guard let item else { return }
            inlineItem = nil
            Task { await model.insertImage(await Self.load(item), filename: "photo.jpg") }
        }
        .onChange(of: coverItem) { _, item in
            guard let item else { return }
            coverItem = nil
            Task { await model.setCover(await Self.load(item), filename: "cover.jpg") }
        }
        .organicModal(isPresented: $pickingCard, seed: 53, maxWidth: 480, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            CardPickerContent(title: L10n.Write.Editor.CardModal.title, subtitle: L10n.Write.Editor.CardModal.subtitle) { card in
                pickingCard = false
                storyLentFocus = false
                model.editor.exec("insertCard", ["href": "/card/\(card.routeKey)", "title": card.title])
            } onCancel: { pickingCard = false }
            .withSession(session)
        }
        // The link editor (round 17 §6.2): the app's modal, centred over what the keyboard leaves; its 完成 and
        // 移除連結 act on the selection the story kept.
        .organicModal(isPresented: Binding(get: { linkRequest != nil }, set: { if !$0 { linkRequest = nil } }), seed: 37,
                      maxWidth: StoryLinkModal.Metrics.maxWidth, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            if let request = linkRequest ?? linkShown {
                StoryLinkModal(request: request,
                               onApply: { href, display in await model.editor.applyLink(href, display: display) },
                               onRemove: { model.editor.unlink() },
                               onClose: { linkRequest = nil })
                    .id(request.id)
            }
        }
        // Closed, done or not, the story takes its focus back with its caret where it was.
        .onChange(of: linkRequest) { _, open in
            if let open { linkShown = open }
            guard open == nil, storyLentFocus else { return }
            storyLentFocus = false
            Task {
                try? await Task.sleep(for: Self.pickerSettle)
                model.editor.refocus()
            }
        }
        // 插入卡片 alike: closed without a card, the story takes its focus back where it was.
        .onChange(of: pickingCard) { _, open in
            guard !open, storyLentFocus else { return }
            storyLentFocus = false
            Task {
                try? await Task.sleep(for: Self.pickerSettle)
                model.editor.refocus()
            }
        }
        .organicConfirm(isPresented: $leaving, title: L10n.Write.leaveTitle, message: Self.leaveMessage(model.leaveQuestion),
                        cancelLabel: L10n.Write.leaveStay, confirmLabel: L10n.Write.leaveConfirm, closeLabel: L10n.Write.leaveStay,
                        seed: 61) {
            leaving = false
            Task { await leave(model, afterDialog: true) }
        }
    }

    /// Step 1: the save line, the bare title and the story; the format bar on the keyboard.
    private func writeStep(_ model: WriteModel) -> some View {
        GeometryReader { outer in
            ScrollView {
                writeColumn(model)
                    // A tap on the page between the fields puts the keyboard away; the fields, the story and the
                    // buttons are in front of it and keep their own taps.
                    .background { Color.clear.contentShape(Rectangle()).onTapGesture { putKeyboardAway(model) } }
                    .coordinateSpace(.named(Self.writeSpace))
            }
            .scrollPosition($writeScroll)
            .onHeaderScroll($scrolledWrite)
            .scrollDismissesKeyboard(.interactively)
            // The caret's line stays above the keyboard and its bar: scrolled to only when it leaves the band shown —
            // and again once the keyboard and its bar have risen under it (the band shown shrinks).
            .onScrollGeometryChange(for: CaretFollow.Viewport.self) { geo in
                CaretFollow.Viewport(offset: geo.contentOffset.y, insetTop: geo.contentInsets.top, height: geo.containerSize.height)
            } action: { before, after in
                writeViewport = after
                if after.height < before.height { followCaret(model) }
            }
            .onChange(of: model.editor.caret) { _, _ in followCaret(model) }
            // The story moved down the page under the caret (the save line came in above the title).
            .onChange(of: islandTop) { _, _ in followCaret(model) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if formatBar {
                    StoryFormatBar(bridge: model.editor, onInsertImage: {
                        storyLentFocus = true
                        pickingInline = true
                    }, onInsertCard: {
                        storyLentFocus = true
                        pickingCard = true
                    }, uploadingImage: model.uploadingInline, onLink: {
                        Task {
                            // Read before the editor takes the keyboard: a caret on an empty line starts on 卡片.
                            let caret = await model.editor.selectionIsCaret()
                            storyLentFocus = true
                            linkRequest = .of(link: model.editor.link, canCard: model.editor.canCard, caret: caret)
                        }
                    }, hardwareKeyboard: hardwareKeyboard)
                        .transition(.opacity.animation(.easeOut(duration: 0.12)))
                }
            }
            .onAppear {
                storyRoom = max(240, outer.size.height - 220)
                // A link card tapped in the story (it is picked): its editor, 卡片 chosen.
                model.editor.onLinkTap = { href in
                    storyLentFocus = true
                    linkRequest = .card(href)
                }
            }
            .onChange(of: outer.size.height) { _, height in storyRoom = max(240, height - 220) }
        }
        // The bar rides the keyboard while the story has the focus, and a moment after it lets go.
        .onChange(of: model.editor.focused) { _, focused in
            if focused {
                formatBar = true
            } else {
                Task {
                    try? await Task.sleep(for: FormatBarPresence.grace)
                    if !model.editor.focused { withAnimation(.easeOut(duration: 0.08)) { formatBar = false } }
                }
            }
        }
        .onChange(of: model.editor.script) { _, script in model.scriptChanged(script) }
        // In the pane there is no bar: ✓ floats at its top, mirroring the Leave on the map, the save state
        // just before it on the same line.
        .overlay(alignment: .topTrailing) {
            if !showsBar, model.step == .write, !model.trashed {
                HStack(spacing: 6) {
                    SaveStateWord(state: model.saveState, help: model.saveStateHelp)
                    finishButton(model)
                }
                .frame(height: Self.splitRow)
                .padding(.top, WriteWorkspace.paneTop(row: Self.splitRow))
                // The glyph's centre where the bar puts its last action's (its 44 target around it).
                .padding(.trailing, HeaderChrome.glyphInset(width: window.width) - 22)
                .transition(.opacity)
            }
        }
    }

    /// At the split, the first row: the floating ✓ (and the save state before it), a finger tall.
    private static let splitRow: CGFloat = 44

    /// The bar and the floating ✓ trading places as the pane takes the whole width or gives it back.
    static let chromeFade: Double = 0.25

    /// How much higher a title field's line starts than the title's CSS line box: the field's line is
    /// the face's own height, the box the title's leading — the glyphs centred in both.
    static func titleBoxInset(font: UIFont, leading: CGFloat) -> CGFloat {
        (font.pointSize * leading - font.lineHeight) / 2
    }

    /// What the writing page pads under the bar's foot for the title's line box to stand the reading
    /// head under the bar's pen line (round 11 §4), as a card page's title does under its header's.
    static func headTop(typo: StoryTypography, font: UIFont) -> CGFloat {
        PenLineGap.fromFoot(typo.headGap(cover: false)) + titleBoxInset(font: font, leading: typo.titleLeading)
    }

    /// The air under the title field for its line box to end `--writer-title-gap` over the story's first line.
    static func titleGap(compact: Bool, font: UIFont, leading: CGFloat) -> CGFloat {
        max(0, (compact ? Tokens.writerTitleGapCompact : Tokens.writerTitleGap) - titleBoxInset(font: font, leading: leading))
    }

    private func writeColumn(_ model: WriteModel) -> some View {
        let typo = StoryTypography(script: model.script, layout: window.layoutClass)
        let font = typo.titleFont()
        let compact = window.layoutClass == .compact
        return VStack(alignment: .leading, spacing: 0) {
            statusLine(model)
                .frame(minHeight: showsBar ? 0 : Self.splitRow, alignment: .leading)
                // The floating ✓ and its save state's room at the split.
                .padding(.trailing, showsBar ? 0 : 160)
                .padding(.bottom, statusShown(model) || !showsBar ? 16 : 0)
            titleField(model, typo: typo)
                // The title → the story's first line (round 11 §4): well over a paragraph's gap, so the title
                // never reads as the story's first paragraph. Its note lies in this gap (`titleField`).
                .padding(.bottom, Self.titleGap(compact: compact, font: font, leading: typo.titleLeading))
            StoryCanvasField(bridge: model.editor, minHeight: storyRoom)
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.writeSpace)).minY } action: { islandTop = $0 }
        }
        .padding(.horizontal, compact ? 20 : window.pad)
        // Under the bar, the title's line box as far under its pen line as a card page's title stands
        // (round 11 §4: --story-head-gap, 48 on a phone, 64 wider) — writing a card and reading it start
        // at the same place. In the pane there is no bar: its first line sits level with the Back on the canvas.
        .padding(.top, showsBar ? Self.headTop(typo: typo, font: font) : WriteWorkspace.paneTop(row: Self.splitRow))
        .padding(.bottom, 48)
        // Wider than a phone, the web's writing measure (680 and the page's pads), centred.
        .frame(maxWidth: window.layoutClass == .compact ? .infinity : Tokens.measure + 2 * window.pad)
        .frame(maxWidth: .infinity)
    }

    /// Keeps the caret's line, 16 above and below it, in the band the page shows (`CaretFollow`).
    private func followCaret(_ model: WriteModel) {
        guard let caret = model.editor.caret,
              let y = CaretFollow.offset(caret: caret, islandTop: islandTop, viewport: writeViewport) else { return }
        withAnimation(.easeOut(duration: 0.18)) { writeScroll.scrollTo(y: y) }
    }

    private func statusShown(_ model: WriteModel) -> Bool {
        model.trashed || model.nextSaveError != nil
    }

    /// Over the title, only when there is something to say there (the save state is the bar's, round 8
    /// §2.1): a card moved to the trash meanwhile is there, with 還原; ✓'s first save didn't go through.
    @ViewBuilder
    private func statusLine(_ model: WriteModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.trashed {
                HStack(spacing: 12) {
                    Text(L10n.Write.Trashed.status)
                        .font(AppFonts.body(14))
                        .foregroundStyle(Tokens.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    OrganicButton(L10n.Me.Actions.restore, variant: .tonal, size: .sm) { Task { await model.restore() } }
                        .loading(model.restoring)
                        .fixedSize()
                }
                .accessibilityElement(children: .contain)
                if let error = model.restoreError {
                    Text(error).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                }
            }
            if let error = model.nextSaveError {
                Text(error).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta)
            }
        }
    }

    /// The title: one line of intent, borderless, in the card page's own title type (by the story's
    /// script); Return goes on to the story. From 50 characters it says how many it has; 下一步 with
    /// none asks for one under it — in the gap to the story, which never moves for it (round 11 §4).
    private func titleField(_ model: WriteModel, typo: StoryTypography) -> some View {
        let font = typo.titleFont()
        let lineBox = font.pointSize * typo.titleLeading
        return TextField(text: Binding(get: { model.values.title }, set: { text in
                if model.typeTitle(text) {
                    // Return: on to the story.
                    titleFocused = false
                    model.editor.focus()
                }
            }), prompt: Text(L10n.Write.titlePlaceholder).font(Font(font)).foregroundStyle(Tokens.placeholder), axis: .vertical) {
                Text(L10n.Write.coreLabel)
            }
            .font(Font(font))
            .tracking(typo.kern(.title, pointSize: font.pointSize))
            .lineSpacing(max(0, lineBox - font.lineHeight))
            .lineLimit(1...5)
            .foregroundStyle(Tokens.text)
            .tint(Tokens.terracotta)
            .submitLabel(.next)
            .focused($titleFocused)
            .onChange(of: titleFocused) { _, focused in if focused { titleHadFocus = true } }
            .accessibilityLabel(L10n.Write.coreLabel)
            // What 下一步 asked for, said with the field (its own value stays the title typed).
            .accessibilityHint(model.titleError ? L10n.Write.titleRequired : "")
            // The note hangs 4 under the field, in the gap to the story: laid out over it, it moves nothing.
            .overlay(alignment: .bottom) {
                Group {
                    if model.titleError {
                        Text(L10n.Write.titleRequired)
                            .font(AppFonts.body(Tokens.hintSize))
                            .foregroundStyle(Tokens.terracotta)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityAddTraits(.isStaticText)
                            .onAppear { AccessibilityNotification.Announcement(L10n.Write.titleRequired).post() }
                    } else if model.showsTitleCount {
                        Text(verbatim: "\(model.values.title.count) / \(WriteModel.titleMax)")
                            .font(AppFonts.body(Tokens.hintSize))
                            .monospacedDigit()
                            .foregroundStyle(model.values.title.count >= WriteModel.titleMax ? Tokens.text : Tokens.textMuted)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                .alignmentGuide(.bottom) { $0[.top] - 4 }
            }
    }

    /// Step 2, in its own scroll (it starts at its top each time it opens; writing keeps its place).
    private func publishStep(_ model: WriteModel) -> some View {
        let compact = window.layoutClass == .compact
        return ScrollView {
            PublishStep(model: model, inlineHeading: !showsBar,
                        onBack: { model.stepBack() }, onPickCover: {
                            model.clearCoverError()
                            pickingCover = true
                        },
                        onSubmit: { Task { await submit(model) } },
                        onSecondary: { Task { await discard(model) } },
                        onShift: { delta in
                            // In the same pass, without a glide: the field must not be seen to move.
                            var still = Transaction()
                            still.disablesAnimations = true
                            withTransaction(still) { publishScroll.scrollTo(y: max(0, publishOffset + delta)) }
                        },
                        onTagFieldPlaced: { tagFieldFrame = $0 })
                .padding(.horizontal, compact ? 20 : window.pad)
                // A phone's preview band with nothing above it starts right at the bar's line, as home's first card.
                .padding(.top, PublishStep.topPadding(model, showsBar: showsBar, compact: compact))
                .padding(.bottom, 48)
                .frame(maxWidth: compact ? .infinity : Tokens.measure + 2 * window.pad)
                .frame(maxWidth: .infinity)
                // At least as tall as what the scroll shows, so the paper under a short step (a tablet's) is the
                // step's too, and a tap on it is one beside the fields.
                .frame(minHeight: publishRoom, alignment: .top)
                // A tap anywhere the step's controls don't take it themselves puts the keyboard away (the owner's
                // round 17 ask) — the tag field's capsule aside, whose taps are its own (``PublishStep/tapPutsKeyboardAway(at:field:)``).
                // The step's buttons, pills and choices keep their taps; what is typed stays in the field.
                .contentShape(Rectangle())
                .onTapGesture { point in
                    if PublishStep.tapPutsKeyboardAway(at: point, field: tagFieldFrame) { putKeyboardAway(model) }
                }
                // What the tag field measures its top in: the content, whatever the scroll.
                .coordinateSpace(.named(PublishStep.space))
        }
        .scrollPosition($publishScroll)
        // Where the step rests, for the tag field's shift (``PublishStep/onShift``).
        .onScrollGeometryChange(for: CGFloat.self) { $0.contentOffset.y + $0.contentInsets.top } action: { _, y in publishOffset = y }
        // The height the scroll shows its content in (less its bars, and the keyboard while it is up).
        .onScrollGeometryChange(for: CGFloat.self) { max(0, $0.containerSize.height - $0.contentInsets.top - $0.contentInsets.bottom) }
            action: { _, room in publishRoom = room }
        .onHeaderScroll($scrolledPublish)
        .scrollDismissesKeyboard(.interactively)
        // Pulled down while the band leads under the bar (round 8 §6.3): the gap wears the band's own paper,
        // as the feed's does, never the page's cream over it.
        .overscrollPaper(PublishStep.bandUnderBar(model, showsBar: showsBar, compact: compact)
                         ? PublishStep.bandPalette(model) : nil)
    }

    /// Whether the publish step is in the page: once shown it stays (a cover on its way, the mirror's
    /// answer), and it is there whenever the step is — a step already at publish when the page first draws
    /// too (an opened card's ✓ never waits for a save: `-writeStep publish`), which no change of step announces.
    static func mountsPublishStep(loaded: Bool, step: WriterStep) -> Bool {
        loaded || step == .publish
    }

    // MARK: Moving between the steps, and leaving

    /// ✓: the keyboard goes; the title is asked for when there is none (its field takes the focus).
    private func next(_ model: WriteModel) async {
        let hadTitle = titleFocused
        putKeyboardAway(model)
        if await model.goNext() {
            titleHadFocus = hadTitle
        }
    }

    /// Puts the keyboard away, whichever field has it: the title or the tags resign, and the story's
    /// island lets go of its focus (as a tap on the page, or an action under the fields, does).
    private func putKeyboardAway(_ model: WriteModel) {
        if model.editor.focused { model.editor.blur() }
        titleFocused = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    /// Back (the arrow, the edge swipe): from the publish step to writing, no question; from writing,
    /// the question first when there is writing to put away, otherwise at once — unless the workspace
    /// takes it (``WritePane/backToMap``).
    private func goBack(_ model: WriteModel) {
        if model.stepBack() { return }
        // The workspace's pane at the whole width over a card the map opened: back to the map.
        if pane.backToMap() { return }
        leaveAsking(model)
    }

    /// Out of the page from either step (the Leave over the map at the split): the question first
    /// when there is writing to put away — or, the card being in the trash, words it holds nowhere.
    private func leaveAsking(_ model: WriteModel) {
        guard !model.pending else { return }
        if model.leaveQuestion != nil {
            leaving = true
        } else {
            Task { await leave(model) }
        }
    }

    /// What the question says: that the writing is kept — or, for a card in the trash, that nothing
    /// is kept until it is restored (leaving now leaves what was typed since behind).
    static func leaveMessage(_ question: WriteModel.LeaveQuestion?) -> String {
        switch question {
        case .trashed: L10n.Write.Trashed.status
        case .revision: L10n.Write.leaveBodyRevision
        case .draft, nil: L10n.Write.leaveBody
        }
    }

    /// Leaving keeps what's written: the draft is handed to Firestore on the way out — kept on the
    /// device at once, sent when the network lets it — and the page waits a moment for the server's
    /// yes, never longer (a write stuck behind a dead connection once held it for minutes).
    /// `afterDialog` lets the question's cover finish going down before the page does.
    private func leave(_ model: WriteModel, afterDialog: Bool = false) async {
        let settle = Task { if afterDialog { try? await Task.sleep(for: Self.dialogSettle) } }
        // A card begun here and emptied again goes with the writer (round 9 §1: no empty 私人卡).
        if await model.dropIfEmpty() {
            writer.leave(model.change)
            await settle.value
            dismiss()
            return
        }
        model.store()
        _ = await model.settled(within: Self.leaveWait)
        writer.leave(model.change)
        await settle.value
        dismiss()
    }

    /// How long leaving waits for the server to confirm the draft.
    static let leaveWait: Duration = .seconds(2)

    /// How long the photo picker's sheet takes to go before the story can have the keyboard again.
    static let pickerSettle: Duration = .milliseconds(350)

    /// The step's one button (round 8 §2.3): a shared card goes to its page; a 草稿 kept leaves the
    /// writer, back where it came from.
    private func submit(_ model: WriteModel) async {
        guard let finish = await model.submit() else { return }
        let change = model.change ?? .init(cardId: model.draftId, referenceCardId: model.referenceCardId)
        switch finish {
        case let .card(key): self.finish(card: key, change: change)
        case .leave: kept(change)
        }
    }

    /// 捨棄修改 (a live card's revision): its page, as the card stands.
    private func discard(_ model: WriteModel) async {
        guard let key = await model.discardEdit() else { return }
        finish(card: key, change: model.change ?? .init(cardId: model.draftId))
    }

    /// The card went out (published, revised, or its revision dropped): its page takes the writer's
    /// place as the web goes to it, unless the card's own page is underneath.
    private func finish(card key: String, change: WriteLauncher.Change) {
        writer.leave(change)
        if let onDone {
            onDone()
        } else if request.showsCard {
            openRoute.replacingTop(with: .card(key))
        } else {
            dismiss()
        }
    }

    /// A 草稿 kept (儲存, 轉為草稿): the writer goes back where it came from — or, for a card the map
    /// opened in the pane, the pane hides and the page stays.
    private func kept(_ change: WriteLauncher.Change) {
        writer.leave(change)
        if let onDone { onDone() } else { dismiss() }
    }

    /// A dialog's fade (0.16s) and the cover it rides on.
    private static let dialogSettle: Duration = .milliseconds(240)

    // MARK: Not here, or in the trash

    /// The card isn't there (deleted, or past its 30 days in the trash) or isn't yours: the card
    /// page's own not-found — its heading, then Back as the tonal pill.
    private var missing: some View {
        OrganicEmptyState(title: L10n.Card.NotFound.title, titleSize: 24, actionTitle: L10n.Card.NotFound.back,
                          actionStyle: .link) { if let onDone { onDone() } else { dismiss() } }
            .padding(.top, 56)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    /// One of your cards in the trash (trash.spec §5.5): what it is, and 還原並繼續寫 — restored, it is
    /// read again and opens in the editor.
    private func trashedNotice(_ card: DraftService.OpenedCard) -> some View {
        VStack(spacing: 0) {
            EmptyStateMark(icon: .trash, seed: 61).padding(.bottom, 18)
            CSSText(L10n.Card.Trashed.title, font: AppFonts.scaledUIFont(.heading, size: 20, weight: .regular), lineHeight: 1.3,
                    alignment: .center)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 8)
            CSSText(L10n.Write.Trashed.line, font: AppFonts.scaledUIFont(.body, size: 14.5), lineHeight: 1.6,
                    color: Tokens.UI.textMuted, alignment: .center)
                .padding(.bottom, 20)
            OrganicButton(L10n.Write.Trashed.restore, variant: .solid, size: .sm) { Task { await restoreOpened(card) } }
                .loading(restoringOpened)
            if restoreOpenedFailed {
                Text(L10n.Me.Actions.undoFailed).font(AppFonts.body(12)).foregroundStyle(Tokens.terracotta)
                    .multilineTextAlignment(.center)
                    .padding(.top, 10)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: 340)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 80)
    }

    private func restoreOpened(_ card: DraftService.OpenedCard) async {
        guard !restoringOpened else { return }
        restoringOpened = true
        restoreOpenedFailed = false
        defer { restoringOpened = false }
        do {
            let restored = try await session.writing.restoreCard(card.id)
            if restored.droppedResonance { session.restoredAloneNotice = true }
            // Restored: the lists that showed it in the trash read again, and the card opens in the editor.
            writer.noteChange(.init(cardId: card.id, referenceCardId: restored.card.referenceCardId))
            inTrash = nil
            await open()
        } catch {
            restoreOpenedFailed = true
        }
    }

    private static func load(_ item: PhotosPickerItem) async -> UIImage? {
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        return UIImage(data: data)
    }
}

/// Keeping the caret above the keyboard (writer.spec §1.5): the island tells where its caret's line
/// is; the page scrolls only when that line, 16 above and below it, leaves the band it shows between
/// the bar and the keyboard's format bar — and then just enough.
enum CaretFollow {
    /// What the writing page's scroll shows: its content offset (UIKit's, the top inset below zero),
    /// the top inset, and the height shown between the insets.
    struct Viewport: Equatable {
        var offset: CGFloat
        var insetTop: CGFloat
        var height: CGFloat
    }

    static let margin: CGFloat = 16

    /// The page's new scroll position (a point of its content at the top of what it shows), or nil when
    /// the caret's line is in view already.
    static func offset(caret: StoryEditorBridge.Caret, islandTop: CGFloat, viewport: Viewport) -> CGFloat? {
        guard viewport.height > 0 else { return nil }
        let top = islandTop + caret.top - margin
        let bottom = islandTop + caret.bottom + margin
        let shownTop = viewport.offset + viewport.insetTop
        let shownBottom = shownTop + viewport.height
        if bottom > shownBottom { return max(0, bottom - viewport.height) }
        if top < shownTop { return max(0, top) }
        return nil
    }
}

/// Why the step's button didn't go through, in the app's words — never the server's, which are
/// English (nor the system's): the card gone (deleted elsewhere) is that it can't be found; the
/// day's publishing spent (429 `rate_limited`, which trying again today would only hear again) says
/// so and when it comes back; anything else — offline, the server's trouble, a refusal the step
/// can't name — is a retry (round 8 §2.3): 沒發布成功 for a publish (a draft shared, or a published
/// 草稿 made public again: `publishing`), 沒儲存成功 for every other save. (A card without a title is
/// said before anything is sent; one in the trash is the writer's trashed notice.)
enum PublishFailure {
    static func message(_ error: Error, publishing: Bool) -> String {
        let failure = error as? APIFailure
        if failure?.isNotFound == true { return L10n.Card.NotFound.title }
        // The publish route documents no 429, so the generated client hands it over as an unexpected status.
        if failure?.code == "rate_limited" || failure?.status == 429 { return L10n.Write.PublishPanel.rateLimited }
        return retry(publishing: publishing)
    }

    /// The retry's words: 沒發布成功，再試一次, or 沒儲存成功，再試一次.
    static func retry(publishing: Bool) -> String {
        publishing ? L10n.Write.PublishPanel.failed : L10n.Write.PublishPanel.saveFailed
    }
}
