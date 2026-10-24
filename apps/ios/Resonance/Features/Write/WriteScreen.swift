import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// Writing a card (the web's write page, writer.spec), in two steps on one page. Writing: a bare
/// page — the one-line title and the story in the editor island, set as the card page sets them —
/// nothing else on it but the save line and one 下一步 (in the bar; floating at the pane's top at
/// the split), with the formatting docked on the keyboard while the story has the focus. 下一步
/// asks for a title, makes sure a new draft is kept, and opens the publish step in the same place
/// (``PublishStep``): the mirror, the card as a list will show it with its cover, tags, who can see
/// it and under whose name, then 發布 (匿名發布, 儲存, by the audience) — or 儲存修改 for a live card. The story stays mounted under the
/// step, so its undo history and selection survive the round trip; drafts save themselves a moment
/// after typing stops, in either step.
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
    @State private var coverItem: PhotosPickerItem?
    @State private var pickingCover = false
    @State private var inlineItem: PhotosPickerItem?
    @State private var pickingInline = false
    @FocusState private var titleFocused: Bool
    /// The title had the focus as the publish step opened: back to writing puts it there again.
    @State private var titleHadFocus = false
    /// What is left of the writing page's height under the title (the story's least height).
    @State private var storyRoom: CGFloat = 320
    @State private var publishScroll = ScrollPosition(edge: .top)
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
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            if showsBar { bar }
        }
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
        }
        #endif
        if let story = request.story {
            model.editor.setMarkdown(story)
            model.values.story = story
        }
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

    private var bar: some View {
        let step = model?.step ?? .write
        // The publish step's heading follows the audience: 發布這張卡片, or 儲存這張卡片 for a draft kept to its author.
        let title = step == .publish ? model?.stepTitle ?? L10n.Write.PublishPanel.title
            : model?.title ?? (request.cardId == nil ? L10n.Write.title : (inTrash?.isPublished == true ? L10n.Write.editPublishedTitle : L10n.Write.editTitle))
        return OrganicInlineBar(title, backLabel: step == .publish ? L10n.Write.leaveStay : L10n.App.Nav.back,
                                scrolled: step == .publish ? scrolledPublish : scrolledWrite) {
            if let model, model.step == .write, !model.trashed {
                nextButton(model)
                    // The bar's actions sit 12 into its margin (bare glyphs); a pill keeps the page's margin.
                    .padding(.trailing, 12)
            }
        }
        .onBack { if let model { goBack(model) } else { dismiss() } }
    }

    /// 下一步: the one way forward while writing (solid, small), its loader while a new draft's first
    /// save takes a moment; nothing written yet, it waits.
    private func nextButton(_ model: WriteModel) -> some View {
        OrganicButton(L10n.Write.next, variant: .solid, size: .sm) { Task { await next(model) } }
            .loading(model.nextLoading)
            .disabled(!model.canGoNext)
            .fixedSize()
            .layoutPriority(1)
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
            if publishLoaded {
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
        .onChange(of: model.restoredAlone) { _, alone in
            guard alone else { return }
            model.restoredAlone = false
            session.restoredAloneNotice = true
        }
        .photosPicker(isPresented: $pickingInline, selection: $inlineItem, matching: .images)
        .photosPicker(isPresented: $pickingCover, selection: $coverItem, matching: .images)
        .onChange(of: inlineItem) { _, item in
            guard let item else { return }
            inlineItem = nil
            Task { if let image = await Self.load(item) { await model.insertImage(image, filename: "photo.jpg") } }
        }
        .onChange(of: coverItem) { _, item in
            guard let item else { return }
            coverItem = nil
            Task { if let image = await Self.load(item) { await model.setCover(image, filename: "cover.jpg") } }
        }
        .organicModal(isPresented: $pickingCard, seed: 53, maxWidth: 480, closeLabel: L10n.Write.Editor.CardModal.cancel) {
            CardPickerContent(title: L10n.Write.Editor.CardModal.title, subtitle: L10n.Write.Editor.CardModal.subtitle) { card in
                pickingCard = false
                model.editor.exec("insertCard", ["href": "/card/\(card.routeKey)", "title": card.title])
            } onCancel: { pickingCard = false }
            .withSession(session)
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
                    StoryFormatBar(bridge: model.editor, onInsertImage: { pickingInline = true },
                                   onInsertCard: { pickingCard = true }, uploadingImage: model.uploadingInline)
                        .transition(.opacity.animation(.easeOut(duration: 0.12)))
                }
            }
            .onAppear { storyRoom = max(240, outer.size.height - 220) }
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
        // In the pane there is no bar: 下一步 floats at its top, mirroring the Leave on the map.
        .overlay(alignment: .topTrailing) {
            if !showsBar, model.step == .write, !model.trashed {
                nextButton(model)
                    .environment(\.organicButtonMinHeight, Self.splitRow)
                    .padding(.top, WriteWorkspace.paneTop)
                    .padding(.trailing, window.pad)
            }
        }
    }

    /// At the split, the first row: the save line beside the floating 下一步, as tall as the pill.
    private static let splitRow: CGFloat = 44

    private func writeColumn(_ model: WriteModel) -> some View {
        let typo = StoryTypography(script: model.script, layout: window.layoutClass)
        return VStack(alignment: .leading, spacing: 0) {
            statusLine(model)
                .frame(minHeight: showsBar ? 0 : Self.splitRow, alignment: .leading)
                // The floating pill's room at the split.
                .padding(.trailing, showsBar ? 0 : 120)
                .padding(.bottom, statusShown(model) || !showsBar ? 16 : 0)
            titleField(model, typo: typo)
                .padding(.bottom, 16)
            StoryCanvasField(bridge: model.editor, minHeight: storyRoom)
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.writeSpace)).minY } action: { islandTop = $0 }
        }
        .padding(.horizontal, window.layoutClass == .compact ? 20 : window.pad)
        // In the pane there is no bar: its first line sits level with the Back on the canvas.
        .padding(.top, showsBar ? 16 : WriteWorkspace.paneTop)
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
        model.trashed || model.saveStatus != nil || model.nextSaveError != nil
    }

    /// What the page header carried under its title: the save state, in plain words — or, for a card
    /// moved to the trash meanwhile, that it is there, with 還原. An unsaved draft has nothing to say.
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
            } else if let status = model.saveStatus {
                Text(status)
                    .font(AppFonts.body(14))
                    .foregroundStyle(Tokens.textMuted)
                    .contentTransition(.opacity)
            }
            if let error = model.nextSaveError {
                Text(error).font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta)
            }
        }
    }

    /// The title: one line of intent, borderless, in the card page's own title type (by the story's
    /// script); Return goes on to the story. From 50 characters it says how many it has; 下一步 with
    /// none asks for one under it.
    private func titleField(_ model: WriteModel, typo: StoryTypography) -> some View {
        let font = typo.titleFont()
        let lineBox = font.pointSize * typo.titleLeading
        return VStack(alignment: .leading, spacing: 4) {
            TextField(text: Binding(get: { model.values.title }, set: { text in
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
            if model.titleError {
                Text(L10n.Write.titleRequired)
                    .font(AppFonts.body(Tokens.hintSize))
                    .foregroundStyle(Tokens.terracotta)
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
    }

    /// Step 2, in its own scroll (it starts at its top each time it opens; writing keeps its place).
    private func publishStep(_ model: WriteModel) -> some View {
        ScrollView {
            PublishStep(model: model, inlineHeading: !showsBar,
                        onBack: { model.stepBack() }, onPickCover: { pickingCover = true },
                        onSubmit: { Task { await submit(model) } },
                        onSecondary: { Task { await secondary(model) } })
                .padding(.horizontal, window.layoutClass == .compact ? 20 : window.pad)
                // A phone's preview band with nothing above it starts right at the bar's line, as home's first card.
                .padding(.top, PublishStep.topPadding(model, showsBar: showsBar, compact: window.layoutClass == .compact))
                .padding(.bottom, 48)
                .frame(maxWidth: window.layoutClass == .compact ? .infinity : Tokens.measure + 2 * window.pad)
                .frame(maxWidth: .infinity)
        }
        .scrollPosition($publishScroll)
        .onHeaderScroll($scrolledPublish)
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: Moving between the steps, and leaving

    /// 下一步: the keyboard goes; the title is asked for when there is none (its field takes the focus).
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
    /// the question first when there is writing to put away, otherwise at once.
    private func goBack(_ model: WriteModel) {
        if model.stepBack() { return }
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
    /// `afterDialog` lets the question's cover finish going down before the page does. Leaving the
    /// card only (`exits` false: Save draft and leave) on a card the map opened in the pane hides the
    /// pane instead; the page stays.
    private func leave(_ model: WriteModel, afterDialog: Bool = false, exits: Bool = true) async {
        let settle = Task { if afterDialog { try? await Task.sleep(for: Self.dialogSettle) } }
        model.store()
        _ = await model.settled(within: Self.leaveWait)
        writer.leave(model.change)
        await settle.value
        if !exits, let onDone { onDone() } else { dismiss() }
    }

    /// How long leaving waits for the server to confirm the draft.
    static let leaveWait: Duration = .seconds(2)

    /// 發布 / 儲存修改 in the step's foot.
    private func submit(_ model: WriteModel) async {
        let key = model.isPublished ? await model.applyEdit() : await model.publish()
        guard let key else { return }
        await finish(card: key, change: model.change ?? .init(cardId: model.draftId, referenceCardId: model.referenceCardId))
    }

    /// 存成草稿，稍後再寫 (a draft) / 捨棄修改 (a live card's revision).
    private func secondary(_ model: WriteModel) async {
        if model.isPublished {
            guard let key = await model.discardEdit() else { return }
            await finish(card: key, change: model.change ?? .init(cardId: model.draftId))
        } else {
            model.leaving(true)
            await leave(model, exits: false)
            model.leaving(false)
        }
    }

    /// The card went out (published, revised, or its revision dropped): its page takes the writer's
    /// place as the web goes to it, unless the card's own page is underneath.
    private func finish(card key: String, change: WriteLauncher.Change) async {
        writer.leave(change)
        if let onDone {
            onDone()
        } else if request.showsCard {
            openRoute.replacingTop(with: .card(key))
        } else {
            dismiss()
        }
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
                    color: UIColor(Tokens.textMuted), alignment: .center)
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

/// Why a publish (or a published card's saved changes) didn't go through, in the app's words —
/// never the server's, which are English (nor the system's): the card gone (deleted elsewhere) is
/// that it can't be found; the day's publishing spent (429 `rate_limited`, which trying again today
/// would only hear again) says so and when it comes back; anything else — offline, the server's
/// trouble, a refusal the step can't name — is a retry: the publish that didn't happen (the save,
/// for a draft kept to its author: `saving`), or the changes that weren't saved. (A card without a
/// title is said before anything is sent; one in the trash is the writer's trashed notice.)
enum PublishFailure {
    static func message(_ error: Error, updating: Bool = false, saving: Bool = false) -> String {
        let failure = error as? APIFailure
        if failure?.isNotFound == true { return L10n.Card.NotFound.title }
        // The publish route documents no 429, so the generated client hands it over as an unexpected status.
        if failure?.code == "rate_limited" || failure?.status == 429 { return L10n.Write.PublishPanel.rateLimited }
        if updating { return L10n.Native.saveError }
        return saving ? L10n.Write.PublishPanel.saveFailed : L10n.Write.PublishPanel.failed
    }
}
