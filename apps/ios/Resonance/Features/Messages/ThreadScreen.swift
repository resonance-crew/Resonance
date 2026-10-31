import DesignSystem
import PhotosUI
import ResonanceKit
import SwiftUI

/// A conversation (ThreadView.tsx, phone): the person in the bar over the messages — newest at the
/// bottom, stacked in runs, with the quotes of replies, the previews of links and the pictures sent,
/// older ones read in as the thread is scrolled — then attachments and the composer, whose ＋ offers
/// a picture from the library or a card. A long-press lifts a message with its actions, a drag
/// toward the middle replies, a tap on a picture opens it full screen. The ⋯ holds search, what's
/// been shared, report, block and delete; search lists the matches over the thread and steps
/// through them. The twin of Android's ThreadScreen.
struct ThreadScreen: View {
    let handle: String
    /// The other person's uid, when the place it was opened from knew it.
    var uid: String?
    let note: MessagingAPI.NoteRef?
    @Environment(SessionStore.self) private var session
    @Environment(\.openRoute) private var openRoute
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isSelectedTab) private var onSelectedTab
    /// Beside the list in two panes: no way back (the list is there), the rule along its side.
    @Environment(\.inDetailPane) private var inPane
    @State private var model: ThreadModel?
    /// Closes the model once the screen is gone for good (`ScreenLifetime`).
    @State private var lifetime = ScreenLifetime()
    /// Between appearing and disappearing: the top of its stack (a page pushed over it makes it disappear).
    @State private var appeared = false
    @State private var searching = false
    @State private var query = ""
    /// The list of matches covers the thread; after a match is chosen the thread shows and the bar steps through them.
    @State private var showResults = false
    @State private var currentHit: String?
    @State private var showingMedia = false
    /// What lies under the composer (round 22 §4.1–4.2): the keyboard, the sticker panel or the attach panel.
    @State private var panels = ComposerPanels()
    /// The sticker previewed over the thread's foot: a second tap sends it.
    @State private var previewing: StickerRef?
    /// The attach panel's tab, and the pictures its picker has chosen, in order.
    @State private var attachTab: AttachTab = .pictures
    @State private var pickerSelection: [PhotosPickerItem] = []
    /// Picking pictures while a card rides (or a card while pictures do) asks first.
    @State private var replacing: Replacing?
    /// The attach panel's grip, dragged (points up).
    @State private var panelDrag: CGFloat = 0
    /// The Mac's popovers at ☺ and ＋ (round 22 §4.1–4.2): a sheet over the thread, never the panels.
    @State private var macPopover: ComposerPanel?
    /// The capsule and the composer (with what rides over it) on the screen, and the screen itself.
    @State private var capsuleFrame: CGRect = .zero
    @State private var composerFrame: CGRect = .zero
    @State private var screenFrame: CGRect = .zero
    /// Grown over the thread (option C): where the capsule's top goes, worked out as it grew.
    @State private var expandedTop: CGFloat?
    /// The keyboard's height, remembered (a panel opens at it), and when it has come up.
    private let keyboard = KeyboardWatch.shared
    /// The picture open full screen.
    @State private var viewing: ChatImage?
    /// The keyboard's part of the thread's foot, held while a picture is open and until the keyboard is
    /// back after it (round 11 §1).
    @State private var keyboardHold = KeyboardHold()
    @State private var reporting = false
    /// The message 檢舉這則訊息 was chosen on (round 16 §3); nil when the whole conversation is reported.
    @State private var reportedMessage: String?
    /// The message 收回 was chosen on, waiting for the confirm's yes.
    @State private var unsending: ChatMessage?
    @State private var sendingReport = false
    @State private var confirmingBlock = false
    @State private var confirmingDelete = false
    @State private var busy = false
    /// A link to an IP address or a punycode name waits here for the reader's yes.
    @State private var linkToConfirm: ChatLinks.Parsed?
    @State private var blockError: String?
    /// The message pressed and held, lifted with its menu.
    @State private var menu: MessageMenu?
    /// The thread's body dimmed and softened under the press layer (it says when, as it comes and goes).
    @State private var pressDimmed = false
    /// The thread header's frame on the screen: the press layer's scrim starts at its foot.
    @State private var barFrame: CGRect = .zero
    @State private var flash = ThreadFlash()
    @State private var frames = FrameBook()
    /// How tall the bar is (the list's room under it), how wide the list, and the screen's safe area.
    @State private var barHeight: CGFloat = 58
    @State private var listWidth: CGFloat = 390
    @State private var safe = EdgeInsets()
    @State private var underBar = false
    /// Where the list is scrolled to, and the way to send it to a message.
    @State private var scroll = ScrollPosition(idType: String.self)
    /// A word over the composer for a moment ("Copied").
    @State private var toast: String?
    @State private var resultsUnderBar = false
    /// How much of the thread's foot the floating foot covers — its paper's fade, the rows riding with
    /// the message and the capsule (or a notice in their place), the 8 under them and the home indicator
    /// under that (round 9 §4, round 10 §3.2) — measured as how far the thread layer, which runs under it,
    /// reaches past what shows above it: the thread layer's foot, and the height left over the floating
    /// foot, in the thread's own space.
    @State private var threadBottom: CGFloat = 0
    @State private var shownHeight: CGFloat = 0
    /// The composer's text has the keyboard (its `UITextView` says so, and is told).
    @State private var composing = false
    @FocusState private var searchFocused: Bool

    var body: some View {
        dialogs(screen)
            .toolbar(.hidden, for: .navigationBar)
            // A drag across a message replies to it: only the screen's edge goes back.
            .swipeBackFromEdgeOnly()
            .task {
                if let model {
                    // Back from a page pushed over the thread (a profile, a shared card): the listeners
                    // stopped when it left, so new messages show and get read again; and a block made
                    // there shows here.
                    model.resume()
                    await model.refreshConnection()
                    return
                }
                let model = ThreadModel(handle: handle, uid: uid, noteRef: note, session: session)
                #if DEBUG
                // `-threadDraft "…"` fills the composer and `-threadSearch "…"` opens the search with that query
                // (screen checks; the simulator can't type into either).
                if let draft = UserDefaults.standard.string(forKey: "threadDraft") { model.draft = draft }
                if let search = UserDefaults.standard.string(forKey: "threadSearch") {
                    searching = true
                    showResults = true
                    query = search
                }
                #endif
                self.model = model
                lifetime.model = model
                model.setOnScreen(visible && scenePhase == .active)
                await model.load()
                #if DEBUG
                // `-threadReply YES` answers their newest message (the composer with a reply riding), and
                // `-threadPicture <seconds>` opens the newest picture and closes it that long after (the
                // thread under it checked on a device the simulator can't be tapped on).
                let defaults = UserDefaults.standard
                // Round 22's screen checks: `-threadPanel stickers|attach` opens a panel (`-threadPanelTall YES` grown),
                // `-threadPreview <pack>/<id>` previews a sticker, `-threadExpand YES` grows the composer (option C).
                if let opened = defaults.string(forKey: "threadPanel") {
                    while !model.threadReady { try? await Task.sleep(for: .milliseconds(100)) }
                    try? await Task.sleep(for: .seconds(1))
                    panels.open(opened == "attach" ? .attach : .stickers)
                    if defaults.bool(forKey: "threadPanelTall") { panels.setExpanded(true) }
                    if let shown = defaults.string(forKey: "threadPreview")?.split(separator: "/").map(String.init), shown.count == 2 {
                        previewing = StickerRef(pack: shown[0], id: shown[1])
                    }
                }
                if defaults.bool(forKey: "threadExpand") {
                    while !model.threadReady { try? await Task.sleep(for: .milliseconds(100)) }
                    try? await Task.sleep(for: .seconds(1.5))
                    while capsuleFrame.height == 0 { try? await Task.sleep(for: .milliseconds(100)) }
                    expandComposer(true, model)
                }
                if defaults.bool(forKey: "threadReply") || defaults.double(forKey: "threadPicture") > 0 {
                    while !model.threadReady { try? await Task.sleep(for: .milliseconds(100)) }
                    try? await Task.sleep(for: .seconds(1))
                    if defaults.bool(forKey: "threadReply"), let theirs = model.rows.last(where: { !model.isMine($0.message) }) {
                        reply(theirs.message)
                        // The keyboard up before anything else happens.
                        try? await Task.sleep(for: .seconds(1.5))
                    }
                    let seconds = defaults.double(forKey: "threadPicture")
                    if seconds > 0, let picture = model.rows.last(where: { $0.message.image != nil })?.message.image {
                        openPicture(picture)
                        try? await Task.sleep(for: .seconds(seconds))
                        withTransaction(\.disablesAnimations, true) {
                            viewing = nil
                            keyboardHold.pictureClosed()
                        }
                        awaitKeyboard()
                    }
                }
                #endif
            }
            // The conversation is read and listened to only while it is on show (its unread count, its pushes):
            // not under a page pushed over it, nor on a tab out of sight.
            .onAppear {
                appeared = true
                shown(onSelectedTab)
            }
            .onDisappear {
                appeared = false
                shown(false)
            }
            .onChange(of: onSelectedTab) { _, selected in shown(appeared && selected) }
            // Back in the foreground: listeners that failed listen again; a thread that couldn't find its person asks again.
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { model?.saveDraft() }
                guard let model, visible else { return }
                model.setOnScreen(phase == .active)
                guard phase == .active else { return }
                if model.phase == .failed { Task { await model.load() } } else { model.resume() }
            }
            // No conversation yet, then their first message arrives: it shows up in Messages, and here.
            .onChange(of: conversationListed) { _, listed in
                if listed, visible { model?.resume() }
            }
            // Connected to them, or no longer (a resonance, a take-back — either one's, from anywhere): what the
            // foot offers is asked again; a letter left waiting applies again once the connection is gone.
            .onChange(of: session.connectionsMoved) { _, moved in
                guard let model, moved.concerns(model.otherId) else { return }
                Task { await model.connectionsMoved(live: session.conversations.connectedIds) }
            }
            // Opened for a note that is in the thread: there, flashed, and the reply to it set up.
            // A picture taken off the strip (its ✕, a send) is unchosen in the attach panel's picker too.
            .onChange(of: model?.pendingPictures.map(\.key) ?? []) { _, keys in
                let kept = pickerSelection.filter { keys.contains(Self.pickerKey($0)) }
                if kept.count != pickerSelection.count { pickerSelection = kept }
            }
            .onChange(of: model?.composerExpanded ?? false) { _, grown in
                if !grown { expandedTop = nil }
            }
            .onChange(of: model?.noteToShow) { _, id in
                guard let id, let model else { return }
                model.noteShown()
                Task {
                    guard await model.ensureLoaded(id), let message = model.message(id) else { return }
                    model.reply(to: message)
                    jump(to: id, pulse: true)
                }
            }
            // The words typed are searched for a moment after the last key; a blank field is no search.
            .task(id: searching ? query : nil) {
                guard searching, let model else { return }
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    model.search("")
                    currentHit = nil
                    return
                }
                try? await Task.sleep(for: .milliseconds(250))
                if !Task.isCancelled { model.search(query) }
            }
    }

    /// The bar over the messages and the composer under them, and the long-press layer over it all.
    private var screen: some View {
        ZStack(alignment: .top) {
            VStack(spacing: 0) {
                if let model { content(model) }
            }
            .padding(.leading, inPane ? PaneLines.gutter : 0)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            // While a picture is open the keyboard steps away under it (UIKit's, for a presentation) and comes
            // back after: the thread keeps the foot it had, so nothing in it moves either way (round 11 §1).
            // Always the same two modifiers, so letting go never rebuilds the thread.
            .padding(.bottom, keyboardHold.padding ?? 0)
            // A panel in the keyboard's place (round 22 §4.1) stands where the keyboard stood, whatever the keyboard
            // does under it: the thread lays out as if none were up while one shows.
            .ignoresSafeArea(keyboardHold.padding == nil && !panels.ignoresKeyboard ? [] : .keyboard, edges: .bottom)
            .accessibilityHidden(menu != nil)
            // Under the press layer the thread's body softens 2 pt beside dimming (review F8: its neighbours'
            // words competed with the lifted message), as under a modal.
            .softened(pressDimmed)
            // The press layer's scrim (round 17 §2): over the thread's body alone, composer included — under the
            // header (whose paper hides it above its wave). In two panes it starts on the rule's own line (review
            // D2: it began 12 past it, a crisp strip the thread's height), and the rule, drawn over it, stays crisp.
            Group {
                if inPane { PaneScrim(Tokens.scrim) } else { Tokens.scrim.ignoresSafeArea() }
            }
                .opacity(pressDimmed ? 1 : 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            bar
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { barHeight = $0 }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { barFrame = $0 }
                .accessibilityHidden(menu != nil)
            // Beside the list: the rule between the panes and the bar's foot from it, over the bar's paper.
            if inPane { PaneLines(barHeight: barHeight) }
            if let menu, let model {
                let message = menu.row.message
                MessageMenuOverlay(menu: menu, ctx: context(model),
                                   items: menu.items(model: model, reply: { reply(message) }, openLink: openLink,
                                                     copied: { say(L10n.Messages.copied) },
                                                     unsend: { unsending = message },
                                                     stopSharing: { stopSharing(message, model) },
                                                     report: {
                                                         reportedMessage = message.id
                                                         reporting = true
                                                     }),
                                   footer: Self.full(message.sentAt), safe: safe, region: pressRegion,
                                   reactions: model.canReact(message)
                                       ? .init(current: model.myReaction(to: message)) { model.react(message, with: $0) }
                                       : nil, dimmed: $pressDimmed) { self.menu = nil }
            }
            if let sticker = previewing, macPopover == nil, let model {
                // The sticker previewed (round 22 §4.1) over the thread's foot, above the composer — or, the panel grown
                // to under the header, over the panel's top. A tap elsewhere on the thread lets it go.
                StickerPreviewLayer(sticker: sticker, composerTop: composerFrame.minY, capsuleBottom: capsuleFrame.maxY,
                                    threadTop: barFrame.maxY, onDismiss: { withAnimation(.easeOut(duration: 0.14)) { previewing = nil } },
                                    onSend: { sendSticker(sticker, model) })
                    .transition(.opacity)
            }
            if let macPopover, let model {
                MacComposerPopover(kind: macPopover, anchor: capsuleFrame, onDismiss: { closeMacPopover() }) {
                    if macPopover == .stickers {
                        StickerPanel(library: StickerLibrary.shared, columns: 5, previewing: previewing) { tapSticker($0, model) }
                    } else {
                        attachPanel(model, gripped: false)
                    }
                } footer: {
                    if macPopover == .stickers, previewing != nil {
                        Text(L10n.Messages.stickerPreviewHint).font(AppFonts.body(12)).foregroundStyle(Tokens.textMuted)
                    }
                }
            }
        }
        .background(Tokens.cream)
        .onGeometryChange(for: EdgeInsets.self) { $0.safeAreaInsets } action: { safe = $0 }
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { screenFrame = $0 }
        // The keyboard is up: a panel waiting for it goes (round 22 §4.1).
        .onChange(of: keyboard.shownCount) { _, _ in
            if panels.awaitingKeyboard { withTransaction(\.disablesAnimations, true) { panels.keyboardShown() } }
        }
        // The field took the focus while a panel showed (a tap on it): the panel stays until the keyboard is up.
        .onChange(of: composing) { _, now in
            guard now, panels.isOpen, !panels.awaitingKeyboard else { return }
            awaitKeyboard(forPanel: true)
        }
        // A tap on the thread (or the foot's paper): the panel goes too.
        .onReceive(NotificationCenter.default.publisher(for: KeyboardAway.didAsk)) { _ in
            guard panels.isOpen, !panels.awaitingKeyboard else { return }
            withAnimation(.easeOut(duration: 0.22)) { closePanels() }
        }
        // The keyboard back where it was after a picture: the thread takes its foot from it again.
        .onChange(of: safe.bottom) { _, bottom in
            guard let released = keyboardHold.release(bottom: bottom) else { return }
            withTransaction(\.disablesAnimations, true) { keyboardHold = released }
        }
    }

    /// What the press layer's scrim covers, on the screen: from the header's foot down, from the rule beside
    /// the list across (round 17 §2); the tray and the list stay 12 inside it.
    private var pressRegion: CGRect {
        let leading = barFrame.minX + (inPane ? PaneLines.gutter : 0)
        return CGRect(x: leading, y: barFrame.maxY, width: max(0, barFrame.maxX - leading), height: .greatestFiniteMagnitude / 4)
    }

    /// On show: the top of its stack, on the tab chosen.
    private var visible: Bool { appeared && onSelectedTab }

    /// The thread came on show, or went out of it: listening, and reading what arrives, only while it shows.
    private func shown(_ visible: Bool) {
        guard let model else { return }
        model.setOnScreen(visible && scenePhase == .active)
        if visible {
            model.resume()
        } else {
            model.stop()
            // Leaving the thread: what was being written is kept (round 22 §4.4).
            model.saveDraft()
        }
    }

    /// Read from the list's ids alone (`listedIds`), which change only as conversations come and go —
    /// not from its rows, which change with every message: the thread isn't drawn again for those.
    private var conversationListed: Bool {
        guard let pair = model?.pairId else { return false }
        return session.conversations.listedIds.contains(pair)
    }

    // MARK: Content

    @ViewBuilder private func content(_ model: ThreadModel) -> some View {
        switch model.phase {
        // One view while it is found and once it is: what the thread always has is there from the start
        // (the bar's back and ⋯, the composer), and only what isn't known yet is in the shimmer.
        case .loading, .ready:
            thread(model)
        case .missing:
            Text(L10n.Messages.userNotFound)
                .font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14).padding(.top, barHeight + 20)
            Spacer()
        case .failed:
            // Who they are couldn't be asked (offline): a retry, never "user not found".
            OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                Task { await model.load() }
            }
            .padding(.top, barHeight)
            Spacer()
        }
    }

    /// How far up from the thread's foot its newest message, the pill and 已複製 stand (round 9 §4,
    /// round 10 §3.2, round 11 §3): past the whole foot — its paper's fade (and the 6 it gains over riding rows),
    /// the rows, the capsule, the 8 under it, the bottom safe area or the keyboard — and ``ComposerMetrics/clearance`` more, so the
    /// newest message rests above the fade. Measured live: the field grows, a row comes.
    private var bottomRoom: CGFloat {
        ThreadFoot.room(threadBottom: threadBottom, shownHeight: shownHeight) + ComposerMetrics.clearance
    }

    /// The messages run to the screen's foot, and the foot floats over them (round 9 §4: no band, no
    /// fade). The messages show whoever may write: only the foot changes with it.
    @ViewBuilder private func thread(_ model: ThreadModel) -> some View {
        let ready = model.phase == .ready
        ZStack(alignment: .bottom) {
            ZStack(alignment: .bottom) {
                if ready {
                    MessageList(rows: model.rows, ctx: context(model), position: $scroll, topMargin: barHeight,
                                bottomRoom: bottomRoom, notice: listNotice(model),
                                pillVisible: !(searching && showResults) && toast == nil && !panels.expanded && previewing == nil,
                                underBar: $underBar)
                        // Under the search's list of matches the thread is out of sight: out of VoiceOver's reach too.
                        .accessibilityHidden(searching && showResults)
                }
                // Who it is with, or the first read, still on its way: the thread's shapes until the messages take their place.
                if !ready || !model.threadReady {
                    ThreadSkeleton(bottomRoom: bottomRoom).transition(.opacity)
                }
                if ready && searching && showResults {
                    ThreadSearchResults(model: model, query: query, topMargin: barHeight, bottomMargin: bottomRoom,
                                        underBar: $resultsUnderBar) { pick($0) }
                }
                if let toast {
                    // Without an action, a word that something was done (「已複製」), said aloud as it shows (`say`).
                    OrganicPill(icon: .check, text: toast)
                        .padding(.bottom, bottomRoom)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            // Exactly the height it is given, whatever it holds: a skeleton or a pill padded by the room
            // over the foot never makes the layer it is measured from any taller.
            .frame(minHeight: 0, maxHeight: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { listWidth = $0 }
            // How far it runs past what shows over the foot: the foot's inset and the home indicator under it
            // (over a keyboard the thread stops at the keyboard and keeps its place, as it always has).
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.footSpace)).maxY.rounded() } action: { threadBottom = $0 }
            .ignoresSafeArea(.container, edges: .bottom)
        }
        // The room over the foot, whatever the thread inside it holds: what is measured never follows from
        // the room it measures (a skeleton padded by it once made the two chase each other).
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.height.rounded() } action: { shownHeight = $0 }
        .coordinateSpace(.named(Self.footSpace))
        // While they are found the composer is there already (nothing to send to until they are): a thread
        // mostly is somewhere to write, and the field stays put — what was typed, the keyboard — once they are.
        // Floating over the messages: an inset of the screen's foot that the thread runs under (the list is
        // drawn upside down, so it is told this as its top margin rather than taking it as its bottom).
        .safeAreaInset(edge: .bottom, spacing: 0) { foot(model) }
    }

    /// The thread and the room over its floating foot, measured against each other.
    private static let footSpace = "thread.foot"

    /// A line about the conversation that scrolls with it as its last item (round 9 §4): answering
    /// their letter connects the two — said over a composer that floats, not on a band of its own.
    private func listNotice(_ model: ThreadModel) -> String? {
        guard model.accessKnown, model.access == .replyToConnect else { return nil }
        return L10n.Messages.replyToConnect(handle: model.displayHandle)
    }

    /// Floating over the messages' foot, 8 over the bottom safe area or the keyboard: the composer — or,
    /// where there is nothing to write, a slip in its place with a calm line: the wait for an answer to
    /// one's own note, or why messages can't be sent here. Nothing while that isn't known yet. Behind it
    /// the foot's paper (round 10 §3.2) across the whole pane, down to the screen's foot, fading in over
    /// its top 12 (round 11 §3); a tap on its solid part puts the keyboard away, as a tap on the thread does.
    @ViewBuilder private func foot(_ model: ThreadModel) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                if model.accessKnown {
                    switch model.access {
                    case .open, .replyToConnect:
                        ThreadComposer(model: model, composing: $composing, panels: panels, expandedTextHeight: expandedTextHeight(model),
                                       onAttach: { _ in toggleAttach(model) }, onStickers: { toggleStickers(model) },
                                       onPanelFace: { withAnimation(.easeOut(duration: 0.25)) { panels.setExpanded(!panels.expanded) } },
                                       onExpand: { expandComposer($0, model) },
                                       onPastePictures: { pictures in
                                           for data in pictures { Task { await model.addPicture(key: Outbox.newClientId()) { data } } }
                                       })
                            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { composerFrame = $0 }
                            .background(alignment: .bottom) {
                                // The capsule's own frame: the composer's foot, 48 and up (option C, the Mac's popovers).
                                Color.clear.frame(height: max(ComposerMetrics.height, capsuleHeight(model)))
                                    .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { capsuleFrame = $0 }
                            }
                    case .awaitingReply:
                        ComposerSlip(seed: 29) {
                            ThreadFootNote(text: L10n.Messages.awaitingReply)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                        }
                    case .notConnected:
                        ComposerSlip(seed: 31) {
                            VStack(spacing: 6) {
                                ThreadFootNote(text: L10n.Messages.notConnected)
                                Button(L10n.Messages.viewProfile) { openRoute(.author(model.displayHandle)) }
                                    .font(AppFonts.body(13)).foregroundStyle(Tokens.terracotta).underline().buttonStyle(.plain)
                                    .frame(minHeight: 32)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                        }
                    }
                }
            }
            .padding(.horizontal, ComposerMetrics.gutter)
            .padding(.bottom, ComposerMetrics.bottomGap)
            // A wide pane keeps the field to a writing width, centred under the thread.
            .frame(maxWidth: ComposerMetrics.maxWidth)
            .frame(maxWidth: .infinity)
            // The panel in the keyboard's place (round 22 §4.1–4.2): the foot's own paper going on, across the pane.
            if panels.isOpen, model.access.canWrite {
                panel(model)
                    .frame(height: panelHeight)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(alignment: .top) {
            if model.accessKnown {
                ComposerBacking { KeyboardAway.now() }
                    // Through the home indicator, and under the keyboard (no message shows through its glass).
                    .ignoresSafeArea(edges: .bottom)
            }
        }
    }

    private func context(_ model: ThreadModel) -> ThreadContext {
        // The matches are marked in the thread while it is being looked at (not under the list of them).
        let marking = searching && !showResults && !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return ThreadContext(
            model: model,
            // The row is the list's width inside its 16 margins; their face's column is not counted;
            // never wider than a bubble may be (design §9).
            rowMax: LayoutClass.bubbleMax(listWidth),
            stickerSide: listWidth >= 600 ? 144 : 128,
            highlights: marking ? Dictionary(model.searchHits.map { ($0.messageId, $0.ranges) }, uniquingKeysWith: { a, _ in a }) : [:],
            currentHit: marking ? currentHit : nil,
            flash: flash,
            frames: frames,
            lifted: menu?.row.message.key,
            // The keyboard stays where it is: the message is lifted from where it lies, and the menu keeps clear of it.
            onMenu: { self.menu = $0 },
            onReply: reply,
            onQuote: { jump(to: $0, pulse: true) },
            openLink: openLink,
            openRoute: { openRoute($0) },
            // Over the thread with no slide: the viewer fades itself in and out.
            openPicture: { picture in openPicture(picture) }
        )
    }

    /// A picture opens full screen over the thread, which holds its foot as it is: the keyboard, if it is up,
    /// steps away under the picture and comes back when it closes, and nothing in the thread follows it.
    private func openPicture(_ picture: ChatImage) {
        var hold = keyboardHold
        hold.pictureOpened(bottom: safe.bottom, screenFoot: KeyboardHold.screenFoot, composing: composing, searching: searchFocused)
        withTransaction(\.disablesAnimations, true) {
            keyboardHold = hold
            viewing = picture
        }
    }

    /// The picture is closed: the keyboard comes back where it was (UIKit gives the field it had back; if
    /// it doesn't, the field is asked again), and the thread takes its foot from it again — or, should the
    /// keyboard stay away or come back at another height, follows it as it would any keyboard.
    private func awaitKeyboard() {
        guard keyboardHold.padding != nil else { return }
        let opened = keyboardHold.opened
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            guard keyboardHold.padding != nil, keyboardHold.opened == opened, viewing == nil else { return }
            if keyboardHold.wasComposing { composing = true } else if keyboardHold.wasSearching { searchFocused = true }
            try? await Task.sleep(for: .milliseconds(700))
            guard keyboardHold.padding != nil, keyboardHold.opened == opened, viewing == nil else { return }
            withAnimation(.easeOut(duration: 0.25)) { keyboardHold.letGo() }
        }
    }

    // MARK: Composer panels (round 22 §4.1–4.3)

    /// On a Mac ☺ and ＋ open popovers (a sheet at the button), never a panel in a keyboard's place.
    private var onMac: Bool { ProcessInfo.processInfo.isMacCatalystApp || ProcessInfo.processInfo.isiOSAppOnMac }

    /// ☺ / ⌨: the sticker panel in the keyboard's place (laid out at the keyboard's height first, the keyboard
    /// put away after it — nothing dips), or the keyboard back.
    private func toggleStickers(_ model: ThreadModel) {
        if model.composerExpanded { expandComposer(false, model) }
        if onMac {
            previewing = nil
            macPopover = macPopover == .stickers ? nil : .stickers
            return
        }
        let keyboardUp = keyboard.height > 0
        var next = panels
        let wantsKeyboard = next.toggleStickers()
        previewing = nil
        if wantsKeyboard {
            panels = next
            composing = true
            awaitKeyboard(forPanel: true)
        } else {
            panelDrag = 0
            // Over a keyboard the panel takes its place at once; with none up it rises.
            withAnimation(keyboardUp ? nil : .easeOut(duration: 0.25)) { panels = next }
            composing = false
        }
    }

    /// ＋: the attach panel in the keyboard's place (or, open, closed again).
    private func toggleAttach(_ model: ThreadModel) {
        if model.composerExpanded { expandComposer(false, model) }
        previewing = nil
        if onMac {
            macPopover = macPopover == .attach ? nil : .attach
            return
        }
        let keyboardUp = keyboard.height > 0
        var next = panels
        next.toggleAttach()
        panelDrag = 0
        withAnimation(keyboardUp && next.isOpen ? nil : .easeOut(duration: 0.25)) { panels = next }
        if next.isOpen { composing = false }
    }

    /// The panel goes (and the preview with it).
    private func closePanels() {
        panels.close()
        panelDrag = 0
        previewing = nil
    }

    /// The field asked for the keyboard while a panel shows: the panel waits for it, and goes once it is up —
    /// or, with a hardware keyboard (none comes), a moment later.
    private func awaitKeyboard(forPanel: Bool) {
        panels.keyboardRequested()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            if panels.awaitingKeyboard { withAnimation(.easeOut(duration: 0.2)) { panels.keyboardShown() } }
        }
    }

    /// The panel's height on the screen, above its foot (the home indicator): the keyboard's remembered height,
    /// the grip's drag, or — grown — up to under the header.
    private var panelHeight: CGFloat {
        let foot = KeyboardHold.screenFoot
        let rest = keyboard.panelHeight
        let tall = max(rest, screenFrame.maxY - barFrame.maxY - 8 - composerFrame.height - ComposerMetrics.bottomGap)
        let full = panels.expanded ? tall : rest
        return min(tall, max(160, full + panelDrag)) - foot
    }

    /// What the panel holds.
    @ViewBuilder private func panel(_ model: ThreadModel) -> some View {
        switch panels.shown {
        case .stickers:
            StickerPanel(library: StickerLibrary.shared, columns: listWidth >= 600 ? 6 : 4, previewing: previewing,
                         onTap: { tapSticker($0, model) },
                         onGrow: panels.expanded ? nil : { withAnimation(.easeOut(duration: 0.25)) { panels.setExpanded(true) } },
                         onShrink: panels.expanded ? { withAnimation(.easeOut(duration: 0.25)) { panels.setExpanded(false) } } : nil)
        case .attach:
            attachPanel(model, gripped: true)
        case .none:
            EmptyView()
        }
    }

    /// The attach panel (round 22 §4.2), the phone's in the keyboard's place or the Mac's popover's content.
    private func attachPanel(_ model: ThreadModel, gripped: Bool) -> some View {
        AttachPanel(tab: $attachTab, selection: pickerBinding(model),
                    maxSelection: AlbumRef.maxCount - model.pendingPictures.filter { !Self.fromPicker($0.key) }.count,
                    onCard: { card in pickCard(card, model) },
                    onDrag: { panelDrag = $0 },
                    onDragEnd: { distance, speed in gripLetGo(distance: distance, speed: speed) },
                    onAdjust: { taller in
                        withAnimation(.easeOut(duration: 0.25)) {
                            if taller { panels.setExpanded(true) } else if panels.expanded { panels.setExpanded(false) } else { closePanels() }
                        }
                    },
                    gripped: gripped)
    }

    /// The grip let go: far enough (or fast enough) up grows the panel to under the header, down closes it
    /// (or brings a grown one back); otherwise it settles where it was.
    private func gripLetGo(distance: CGFloat, speed: CGFloat) {
        withAnimation(.easeOut(duration: 0.22)) {
            if distance > 60 || speed > 600 {
                panels.setExpanded(true)
            } else if distance < -60 || speed < -600 {
                if panels.expanded { panels.setExpanded(false) } else { closePanels() }
            }
            panelDrag = 0
        }
    }

    /// A tap on a sticker: its preview — or, previewed already, it goes (round 22 §4.1). VoiceOver hears which.
    private func tapSticker(_ sticker: StickerRef, _ model: ThreadModel) {
        if previewing == sticker { return sendSticker(sticker, model) }
        withAnimation(.easeOut(duration: 0.14)) { previewing = sticker }
        UIAccessibility.post(notification: .announcement, argument: L10n.Messages.stickerPreviewA11y(name: StickerLibrary.shared.label(sticker)))
    }

    private func sendSticker(_ sticker: StickerRef, _ model: ThreadModel) {
        model.sendSticker(sticker)
        withAnimation(.easeOut(duration: 0.14)) { previewing = nil }
        if macPopover != nil { closeMacPopover() }
    }

    /// The Mac's popover goes; the field takes the focus back.
    private func closeMacPopover() {
        macPopover = nil
        previewing = nil
        composing = true
    }

    /// A picture of the attach panel's picker, as the strip keys it.
    private static func pickerKey(_ item: PhotosPickerItem) -> String { "lib:" + (item.itemIdentifier ?? "\(item.hashValue)") }
    private static func fromPicker(_ key: String) -> Bool { key.hasPrefix("lib:") }

    /// The picker's choice, read from and written to the strip: choosing pictures while a card rides asks first.
    private func pickerBinding(_ model: ThreadModel) -> Binding<[PhotosPickerItem]> {
        Binding(get: { pickerSelection }, set: { items in
            if model.pendingCard != nil, items.count > pickerSelection.count {
                replacing = .withPictures(items)
                return
            }
            choosePictures(items, model)
        })
    }

    private func choosePictures(_ items: [PhotosPickerItem], _ model: ThreadModel) {
        pickerSelection = items
        let byKey = Dictionary(items.map { (Self.pickerKey($0), $0) }, uniquingKeysWith: { a, _ in a })
        model.pickerChose(items.map(Self.pickerKey), fromPicker: Self.fromPicker) { key in
            let item = byKey[key]
            return {
                // The library can be slow to hand over a picture just chosen beside others: asked once more before
                // it is said to be no picture.
                if let data = try? await item?.loadTransferable(type: Data.self) { return data }
                try? await Task.sleep(for: .milliseconds(400))
                return try? await item?.loadTransferable(type: Data.self)
            }
        }
    }

    /// A card picked in the attach panel rides — over pictures riding, once the person says so — and the panel goes.
    private func pickCard(_ card: FeedCard, _ model: ThreadModel) {
        if !model.pendingPictures.isEmpty {
            replacing = .withCard(card)
            return
        }
        model.pendingCard = card
        withAnimation(.easeOut(duration: 0.22)) { closePanels() }
        if macPopover != nil { closeMacPopover() }
    }

    /// ⤢ / ⤡ (round 22 §4.3, option C): the same text view grows over the thread, its top just under the other
    /// person's last message — that message and what came after it kept in view under the header — or under the
    /// header when that is more than a third of the thread (a picture). The thread above stays scrollable.
    private func expandComposer(_ on: Bool, _ model: ThreadModel) {
        guard on else {
            withAnimation(.easeOut(duration: 0.22)) { model.composerExpanded = false }
            expandedTop = nil
            return
        }
        if panels.isOpen { closePanels() }
        let space = max(1, capsuleFrame.minY - barFrame.maxY)
        let top = barFrame.maxY + 12
        var kept: CGFloat = 0
        if let theirs = model.rows.last(where: { !model.isMine($0.message) && !$0.message.isUnsent }),
           let newest = model.rows.last,
           let from = theirs.messages.compactMap({ frames.frames[$0.key] }).map(\.minY).min(),
           let to = newest.messages.compactMap({ frames.frames[$0.key] }).map(\.maxY).max(), to > from {
            kept = to - from
        }
        expandedTop = kept > 0 && kept <= space * 0.35 ? top + kept + ComposerMetrics.clearance : top
        withAnimation(.easeOut(duration: 0.25)) { model.composerExpanded = true }
    }

    /// The grown text box's height: from the capsule's foot up to where it grows to, less what rides over it and
    /// the text's padding — never shorter than five lines, and on a wide pane at most 60 % of it.
    private func expandedTextHeight(_ model: ThreadModel) -> CGFloat? {
        guard model.composerExpanded, let expandedTop, capsuleFrame.height > 0 else { return nil }
        let metrics = ComposerText.current()
        let rides = max(0, capsuleFrame.minY - composerFrame.minY)
        let bottom = capsuleFrame.maxY
        var capsule = bottom - expandedTop - rides
        if listWidth >= 600 { capsule = min(capsule, (bottom - barFrame.maxY) * ComposerMetrics.expandedPaneShare) }
        let least = ComposerTextView.height(lines: ComposerMetrics.maxLines, metrics: metrics)
        return max(least, capsule - 2 * metrics.padding)
    }

    /// The capsule's height as drawn (the composer less what rides over it).
    private func capsuleHeight(_ model: ThreadModel) -> CGFloat {
        guard let text = expandedTextHeight(model) else { return ComposerMetrics.height }
        return text + 2 * ComposerText.current().padding
    }

    /// Says `text` over the composer for a moment.
    private func say(_ text: String) {
        withAnimation(.easeOut(duration: 0.16)) { toast = text }
        UIAccessibility.post(notification: .announcement, argument: text)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.4))
            guard toast == text else { return }
            withAnimation(.easeOut(duration: 0.2)) { toast = nil }
        }
    }

    /// 停止分享: no question first — the message stays, and sending the card again shares it again — then the
    /// shell's toast says how it went. The row goes once the document no longer carries its pass.
    private func stopSharing(_ message: ChatMessage, _ model: ThreadModel) {
        Task {
            let stopped = await model.stopSharing(message)
            session.toasts.show(stopped ? L10n.Messages.stoppedSharing : L10n.Messages.stopSharingError)
        }
    }

    /// The next message answers `message`: the field takes the keyboard.
    private func reply(_ message: ChatMessage) {
        model?.reply(to: message)
        composing = true
    }

    /// Takes the thread to a message — a quote's original, a search hit — reading older pages until
    /// it is held; a quote's original pulses once there.
    private func jump(to id: String, pulse: Bool) {
        Task {
            guard let model, await model.ensureLoaded(id), let key = model.rowId(for: id) else { return }
            // A message just read in reaches the list a moment later; the list then knows its rows' real heights.
            try? await Task.sleep(for: .milliseconds(60))
            scroll.scrollTo(id: key, anchor: .center)
            try? await Task.sleep(for: .milliseconds(120))
            withAnimation(.easeInOut(duration: 0.25)) { scroll.scrollTo(id: key, anchor: .center) }
            if pulse { flash.pulse(key) }
        }
    }

    /// A match chosen in the list: the list goes, and the thread is taken to it with its words marked.
    private func pick(_ hit: SearchHit) {
        currentHit = hit.messageId
        showResults = false
        searchFocused = false
        jump(to: hit.messageId, pulse: false)
    }

    private func closeSearch() {
        searching = false
        showResults = false
        currentHit = nil
        query = ""
        searchFocused = false
        model?.endSearch()
    }

    /// Opens a link from a message: a card of this site in the app; anything else straight into the
    /// in-app browser, unless it's an IP address or a punycode name — those ask first.
    private func openLink(_ url: URL) {
        if let key = model?.cardKey(of: url) { return openRoute(.card(key)) }
        // Checked again, so only an http(s) address that passes opens.
        guard let link = ChatLinks.parse(url.absoluteString) else { return }
        if link.suspicious { linkToConfirm = link } else { InAppBrowser.open(link.url) }
    }

    // MARK: Bar

    /// The thread's bar, over the messages: back, the person (their face and pen name, a tap goes to
    /// their page) and the ⋯ — edged by the header's wavy pen line like every pushed page's, half ink
    /// at rest and full once messages scroll under it. Search takes the person's place with its field
    /// (and, once a match was chosen, "3/12" and the way through them).
    private var bar: some View {
        OrganicInlineBar("", backLabel: L10n.Messages.back, scrolled: searching && showResults ? resultsUnderBar : underBar) {
            if let model, model.phase == .loading {
                PersonPlaceholder(handle: model.displayHandle)
            } else if let model, model.phase == .ready {
                if searching {
                    ThreadSearchField(query: $query, focused: $searchFocused, position: searchPosition(model),
                                      onShowResults: { showResults = true },
                                      onOlder: { step(model, by: 1) }, onNewer: { step(model, by: -1) })
                } else if let other = model.other {
                    Button { openRoute(.author(other.handle)) } label: {
                        HStack(spacing: 10) {
                            HandDrawnAvatar(initials: other.initials, imageURL: other.avatarUrl.flatMap(URL.init(string:)), color: other.accent,
                                            size: 36, seed: other.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 } ?? 3)
                            Text(other.handle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                                .accessibilityAddTraits(.isHeader)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(L10n.Messages.viewProfile)
                } else {
                    // Opened by uid: the pen name the link carried, until their profile arrives.
                    PersonPlaceholder(handle: model.displayHandle)
                }
            }
        } trailing: {
            if let model, model.phase == .ready, searching {
                OrganicIconButton(.close, label: L10n.Messages.searchClose, size: 16, action: closeSearch)
            } else if let model, menuShown(model) {
                OrganicMenu(items: menuItems(model), label: L10n.Messages.moreMenu, seed: Double(seedFromString(model.pairId ?? model.handle)),
                            triggerSize: 34, trigger: .bare)
                    // In its place from the start, it takes a tap once there is a conversation to act on.
                    .disabled(!(model.phase == .ready && model.conversationExists && model.pairId != nil))
            }
        }
        .backHidden(searching || inPane)
        .leadingInset(inPane ? PaneLines.gutter : 0)
    }

    /// The ⋯ is a conversation's: in the bar from the start when Messages lists this one — or hasn't been
    /// read yet (a push opened the app here) — rather than coming once the conversation has been read; for
    /// someone not written to yet, once the first message makes it.
    private func menuShown(_ model: ThreadModel) -> Bool {
        guard model.phase == .loading || model.phase == .ready else { return false }
        if model.conversationExists { return true }
        let listed = if let pair = model.pairId {
            session.conversations.listedIds.contains(pair)
        } else {
            session.conversations.listedHandles.contains { $0.caseInsensitiveCompare(model.displayHandle) == .orderedSame }
        }
        return listed || (!session.conversations.loaded && !model.threadReady)
    }

    /// Where in the matches the thread is (1 is the newest), once one was chosen and the list put away.
    private func searchPosition(_ model: ThreadModel) -> (index: Int, count: Int)? {
        guard !showResults, let currentHit, let at = model.searchHits.firstIndex(where: { $0.messageId == currentHit }) else { return nil }
        return (at + 1, model.searchHits.count)
    }

    /// To the next match older (+1) or newer (−1).
    private func step(_ model: ThreadModel, by offset: Int) {
        let hits = model.searchHits
        guard let currentHit, let at = hits.firstIndex(where: { $0.messageId == currentHit }), hits.indices.contains(at + offset) else { return }
        pick(hits[at + offset])
    }

    private func menuItems(_ model: ThreadModel) -> [OrganicMenuItem] {
        [
            OrganicMenuItem(id: "search", title: L10n.Messages.menuSearch, icon: .search) {
                searching = true
                showResults = true
                searchFocused = true
            },
            OrganicMenuItem(id: "media", title: L10n.Messages.menuMedia, icon: .cards) { showingMedia = true },
            OrganicMenuItem(id: "report", title: L10n.Safety.reportMessage, icon: .flag) {
                reportedMessage = nil
                reporting = true
            },
            model.isBlocked
                ? OrganicMenuItem(id: "unblock", title: L10n.Safety.unblock, icon: .ban) { Task { await unblock(model) } }
                : OrganicMenuItem(id: "block", title: L10n.Safety.block, icon: .ban, warn: true) {
                    blockError = nil
                    confirmingBlock = true
                },
            OrganicMenuItem(id: "delete", title: L10n.Messages.menuDelete, icon: .trash, danger: true) { confirmingDelete = true },
        ]
    }

    private func block(_ model: ThreadModel) async {
        guard let other = model.other, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await session.safety?.block(other.id)
            confirmingBlock = false
            await model.refreshConnection()
        } catch {
            blockError = L10n.Safety.actionError
        }
    }

    private func unblock(_ model: ThreadModel) async {
        guard let other = model.other else { return }
        do {
            try await session.safety?.unblock(other.id)
        } catch {
            // Still blocked: said in the toast, never silently (round 21).
            session.toasts.show(L10n.Safety.unblockFailed)
            return
        }
        await model.refreshConnection()
    }

    // MARK: Dialogs

    /// The thread's modals: the link confirm, what's been shared, report, block, delete, and the card picker.
    private func dialogs(_ content: some View) -> some View {
        content
            .organicConfirm(isPresented: Binding(get: { linkToConfirm != nil }, set: { if !$0 { linkToConfirm = nil } }),
                            title: L10n.Messages.linkConfirmTitle, message: L10n.Messages.linkConfirmBody(host: linkToConfirm?.host ?? ""),
                            cancelLabel: L10n.Messages.linkConfirmCancel, confirmLabel: L10n.Messages.linkConfirmOpen,
                            closeLabel: L10n.Messages.linkConfirmCancel, seed: 61) {
                if let link = linkToConfirm { InAppBrowser.open(link.url) }
                linkToConfirm = nil
            }
            .organicModal(isPresented: $showingMedia, seed: 53, maxWidth: 480, closeLabel: L10n.Safety.Report.close) {
                if let model {
                    SharedMediaContent(model: model, onClose: { showingMedia = false }) { url in
                        showingMedia = false
                        openLink(url)
                    }
                    .withSession(session)
                }
            }
            .organicModal(isPresented: $reporting, seed: 83, maxWidth: 460, closeLabel: L10n.Safety.Report.close, dismissible: !sendingReport) {
                if let model, let other = model.other, let pair = model.pairId {
                    // One message (檢舉這則訊息: its id) or the conversation (the bar's 檢舉: the pair's).
                    ReportForm(target: .message(id: reportedMessage ?? pair, senderId: other.id, conversationId: pair), handle: other.handle,
                               offerBlock: !model.isBlocked, sending: $sendingReport, onClose: { reporting = false },
                               onBlocked: { Task { await model.refreshConnection() } },
                               customTitle: reportedMessage == nil ? nil : L10n.Safety.reportThisMessage)
                    .withSession(session)
                }
            }
            // 收回 (round 16 §3): asked first, in plain colour — taking one's own words back is no danger.
            // Closed as it is answered, the message unsent at once (round 21); a refusal puts it back with a toast.
            .organicConfirm(isPresented: Binding(get: { unsending != nil }, set: { if !$0 { unsending = nil } }),
                            title: L10n.Messages.unsendTitle, message: L10n.Messages.unsendBody,
                            cancelLabel: L10n.Messages.unsendCancel, confirmLabel: L10n.Messages.unsendConfirm,
                            closeLabel: L10n.Messages.unsendCancel, seed: 67) {
                guard let model, let message = unsending else { return }
                unsending = nil
                let toasts = session.toasts
                Task {
                    let result = await model.unsend(message)
                    switch result {
                    case .done: break
                    case .tooLate: toasts.show(L10n.Messages.unsendTooLate)
                    case .failed: toasts.show(L10n.Messages.unsendError)
                    }
                }
            }
            .organicConfirm(isPresented: $confirmingBlock, title: L10n.Safety.blockTitle(handle: model?.other?.handle ?? ""),
                            message: L10n.Safety.blockBody, cancelLabel: L10n.Safety.cancel, confirmLabel: L10n.Safety.blockConfirm,
                            closeLabel: L10n.Safety.cancel, busy: busy, error: blockError, seed: 71) {
                if let model { Task { await block(model) } }
            }
            // Closed as it is answered (round 21): the thread goes, the conversation leaves the list at once and is
            // deleted behind it; refused, it is listed again and a toast says so.
            .organicConfirm(isPresented: $confirmingDelete, title: L10n.Messages.deleteConfirmTitle, message: L10n.Messages.deleteConfirmBody,
                            cancelLabel: L10n.Messages.deleteCancel, confirmLabel: L10n.Messages.deleteConfirm,
                            closeLabel: L10n.Messages.deleteCancel, destructive: true, seed: 59) {
                guard let model, let pairId = model.pairId else { return }
                confirmingDelete = false
                let (conversations, toasts) = (session.conversations, session.toasts)
                conversations.hide(pairId)
                dismiss()
                Task {
                    guard !(await model.deleteConversation()) else { return }
                    conversations.unhide(pairId)
                    toasts.show(L10n.Messages.deleteError)
                }
            }
            // A card and pictures never ride together (round 22 §4.2): the one picked second asks first.
            .organicConfirm(isPresented: Binding(get: { replacing != nil }, set: { if !$0 { replacing = nil } }),
                            title: replacing?.title ?? "", message: replacing?.body ?? "",
                            cancelLabel: L10n.Safety.cancel, confirmLabel: replacing?.confirm ?? "",
                            closeLabel: L10n.Safety.cancel, seed: 73) {
                guard let model, let ask = replacing else { return }
                replacing = nil
                switch ask {
                case let .withCard(card):
                    model.removePictures()
                    pickCard(card, model)
                case let .withPictures(items):
                    model.pendingCard = nil
                    choosePictures(items, model)
                }
            }
            .fullScreenCover(item: $viewing) { picture in
                if let model {
                    ChatPictureViewer(picture: picture, store: model.pictures) {
                        // One transaction without animation: anything else changed beside it lets the cover
                        // slide away as it would by default, the picture showing again on its way out.
                        withTransaction(\.disablesAnimations, true) {
                            viewing = nil
                            keyboardHold.pictureClosed()
                        }
                        awaitKeyboard()
                    }
                }
            }
    }

    // MARK: Dates

    /// The day label: 9月29日 / September 29.
    static func day(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        date.formatted(Date.FormatStyle(locale: locale(language)).month(.wide).day())
    }

    /// A time of day, one way wherever the chat shows one (review F5 / N7: the list, the labels between
    /// messages, a search's results and a held message's foot once said 下午05:51, 下午 5:51 and
    /// 下午05:51 in one conversation): the hour without a leading zero — 下午3:04 / 3:04 PM — as the web's
    /// `timeOfDay` (lib/chat/time) and Android write it.
    static func time(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        formatted(date, language == .zhTW ? "ah:mm" : "h:mm a", language)
    }

    /// The full time a long-press shows (the web's hover title), its time of day as ``time(_:language:)``:
    /// 9月29日 下午3:04 / September 29 at 3:04 PM.
    static func full(_ date: Date, language: Strings.Language = Strings.shared.language) -> String {
        formatted(date, language == .zhTW ? "M月d日 ah:mm" : "MMMM d 'at' h:mm a", language)
    }

    /// When a search result was written: the time today, the day this year, the day and year before.
    static func resultTime(_ date: Date, now: Date = .now, language: Strings.Language = Strings.shared.language) -> String {
        let calendar = Calendar.current
        if calendar.isDate(date, inSameDayAs: now) { return time(date, language: language) }
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return day(date, language: language) }
        return "\(calendar.component(.year, from: date)) · \(day(date, language: language))"
    }

    /// The interface language's own formats (as `Strings.locale`), not the system's.
    private static func locale(_ language: Strings.Language) -> Locale {
        Locale(identifier: language == .zhTW ? "zh-Hant-TW" : "en")
    }

    private static func formatted(_ date: Date, _ pattern: String, _ language: Strings.Language) -> String {
        formatter(pattern, language).string(from: date)
    }

    /// A formatter for each pattern, language and time zone, made once: making one (its pattern
    /// compiled) cost more than the label it formats, and every row with a time label asked for one
    /// each time it was drawn. The time zone is in the key, so one changed while the app runs is
    /// followed as a new formatter's would be.
    static func formatter(_ pattern: String, _ language: Strings.Language) -> DateFormatter {
        let zone = TimeZone.current
        let key = "\(language)|\(pattern)|\(zone.identifier)"
        if let kept = formatters[key] { return kept }
        let format = DateFormatter()
        format.locale = locale(language)
        format.timeZone = zone
        format.dateFormat = pattern
        formatters[key] = format
        return format
    }

    private static var formatters: [String: DateFormatter] = [:]
}

/// Lives as long as the thread screen's state: SwiftUI lets go of it only when the screen is gone for
/// good (popped — not when a page is pushed over it, nor when its tab is out of sight), and it then
/// closes the model, whose reads of older pages (a search's, up to the whole history; a quote's jump)
/// would otherwise go on with nobody to show them to.
nonisolated private final class ScreenLifetime {
    var model: ThreadModel?

    deinit {
        guard let model else { return }
        Task { @MainActor in model.close() }
    }
}

/// "Cards & links": everything shared in the loaded messages.
private struct SharedMediaContent: View {
    let model: ThreadModel
    let onClose: () -> Void
    let onOpenLink: (URL) -> Void
    @Environment(\.openRoute) private var openRoute
    @Environment(\.window) private var window

    var body: some View {
        let shared = model.shared
        VStack(alignment: .leading, spacing: 0) {
            ModalTitle(L10n.Messages.mediaTitle).padding(.bottom, 8)
            CSSText(L10n.Messages.mediaSubtitle, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.6, color: Tokens.UI.textMuted)
                .padding(.bottom, 18)
            let cards = shared.cards.compactMap(model.card)
            if cards.isEmpty && shared.links.isEmpty {
                Text(L10n.Messages.mediaEmpty).font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if !cards.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            head(L10n.Messages.mediaCards)
                            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                                if i > 0 { WavyDivider(seed: Double(53 + i * 7)) }
                                Button { openRoute(.card(card.routeKey)) } label: {
                                    HStack(spacing: 12) {
                                        OrganicImage(url: card.imageUrl.flatMap(URL.init(string:)), seed: 7,
                                                     fill: Palette.hue(.accent, card.accentHue ?? 55))
                                            .environment(\.skeletonHue, card.accentHue)
                                            .frame(width: 40, height: 40)
                                        Text(card.title).font(AppFonts.body(14, weight: .semibold)).foregroundStyle(Tokens.text)
                                            .lineLimit(2).multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                    .padding(.vertical, 10).padding(.horizontal, 4)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if !shared.links.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            head(L10n.Messages.mediaLinks)
                            ForEach(Array(shared.links.enumerated()), id: \.element.url) { i, link in
                                if i > 0 { WavyDivider(seed: Double(97 + i * 11)) }
                                Button { onOpenLink(link.url) } label: {
                                    Text(link.text).font(AppFonts.body(13.5)).foregroundStyle(Tokens.terracotta).underline()
                                        .multilineTextAlignment(.leading)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 10).padding(.horizontal, 4)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .scrollEdgeFades()
            .frame(maxHeight: min(420, window.height * 0.55))
            .scrollIndicators(.hidden)
            // Nothing to choose here, only to look through: the way out is under the list.
            ModalCloseButton(L10n.Safety.Report.close, action: onClose)
        }
    }

    private func head(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(12, weight: .semibold)).tracking(12 * 0.06).foregroundStyle(Tokens.textMuted)
            .padding(.bottom, 4)
    }
}

/// The bar's person before their profile arrives: the pen name the way here carried, beside the
/// face's place in the shimmer, so nothing moves along when the face comes.
private struct PersonPlaceholder: View {
    let handle: String

    var body: some View {
        HStack(spacing: 10) {
            SkeletonBlock(width: 36, circle: true)
            Text(handle).font(AppFonts.heading(18)).foregroundStyle(Tokens.text).lineLimit(1)
                .accessibilityAddTraits(.isHeader)
        }
    }
}

/// The keyboard's part of the thread's foot while a picture is open (round 11 §1). Presenting the
/// picture full screen puts the keyboard away (UIKit keeps the field and gives it back on the way out),
/// and a thread that followed it moved twice — down as the picture came, up as it went: the owner saw the
/// messages jump. Held, the thread keeps the foot it had — the keyboard's height standing in as padding
/// for the keyboard it no longer follows — until the picture is closed and the keyboard is back, when the
/// thread takes its foot from the keyboard again: the same height, so nothing moves.
nonisolated struct KeyboardHold: Equatable {
    /// What stands in for the keyboard: how far over the screen's own foot it reached when the picture opened.
    private(set) var padding: CGFloat?
    /// A picture is open (the keyboard away under it, or on its way back).
    private(set) var open = false
    /// Which field had the keyboard: the one to ask again should UIKit not give it back.
    private(set) var wasComposing = false
    private(set) var wasSearching = false
    /// Counts the pictures opened, so a late step of one closed long ago leaves the next alone.
    private(set) var opened = 0
    /// The screen's own foot (the home indicator's safe area) the keyboard was measured over.
    private(set) var screenFoot: CGFloat = 0

    /// The window's own bottom safe area: the keyboard is never part of a window's (a view's safe area,
    /// SwiftUI's, counts it in — even a view that ignores the keyboard reports it).
    @MainActor static var screenFoot: CGFloat {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first
        return window?.safeAreaInsets.bottom ?? 0
    }

    /// The keyboard's part of a foot `bottom` deep (the screen's bottom safe area, the keyboard's included)
    /// over a screen whose own foot is `screenFoot`; nil when no keyboard is up.
    static func keyboard(bottom: CGFloat, screenFoot: CGFloat) -> CGFloat? {
        let part = bottom - screenFoot
        return part > 0.5 ? part : nil
    }

    mutating func pictureOpened(bottom: CGFloat, screenFoot: CGFloat, composing: Bool, searching: Bool) {
        open = true
        opened += 1
        // A second picture opened before the keyboard was back keeps holding what the first held.
        if padding == nil {
            padding = Self.keyboard(bottom: bottom, screenFoot: screenFoot)
            self.screenFoot = screenFoot
        }
        if padding != nil, composing || searching {
            wasComposing = composing
            wasSearching = searching
        }
    }

    mutating func pictureClosed() { open = false }

    /// The foot measured again: once the picture is closed and the keyboard is back as high as it was
    /// (it can come back in steps — its candidate bar after it), the hold lets go, and nothing moves.
    func release(bottom: CGFloat) -> KeyboardHold? {
        guard let padding, !open, let keyboard = Self.keyboard(bottom: bottom, screenFoot: screenFoot),
              keyboard >= padding - 0.5 else { return nil }
        var hold = self
        hold.letGo()
        return hold
    }

    /// No keyboard to wait for any more.
    mutating func letGo() {
        padding = nil
        wasComposing = false
        wasSearching = false
    }
}

/// The floating foot's room over the thread (round 9 §4, round 10 §3.2).
nonisolated enum ThreadFoot {
    /// How much of the thread the foot covers — its paper's fade and the 6 it gains over riding rows
    /// included, the home indicator or the keyboard under it — : how far the thread layer's foot
    /// (`threadBottom`) lies past the room shown over the foot (`shownHeight`), both in the thread's own
    /// space; never less than nothing, never more than the thread. (It was held under half the thread,
    /// which a phone's keyboard with a reply and a picture riding outgrows: the newest message then lay
    /// under the composer. The thread layer's height no longer follows what it holds, so nothing measured
    /// here can run away.)
    static func room(threadBottom: CGFloat, shownHeight: CGFloat) -> CGFloat {
        guard shownHeight > 0, threadBottom > 0 else { return 0 }
        return min(max(0, threadBottom - shownHeight), threadBottom)
    }
}

/// What the confirm asks before a card takes the pictures' place, or pictures the card's (round 22 §4.2).
enum Replacing: Equatable {
    case withCard(FeedCard)
    case withPictures([PhotosPickerItem])

    var title: String {
        switch self {
        case .withCard: L10n.Messages.replaceWithCardTitle
        case .withPictures: L10n.Messages.replaceWithPicturesTitle
        }
    }

    var body: String {
        switch self {
        case .withCard: L10n.Messages.replaceWithCardBody
        case .withPictures: L10n.Messages.replaceWithPicturesBody
        }
    }

    var confirm: String {
        switch self {
        case .withCard: L10n.Messages.replaceWithCardConfirm
        case .withPictures: L10n.Messages.replaceWithPicturesConfirm
        }
    }
}

/// The Mac's popover at ☺ or ＋ (round 22 §4.1–4.2): a flat sheet of the menus' paper inside the grey pen line,
/// no shadow, hanging over the capsule from the button — ☺'s at its end, ＋'s at its start. A click beside it or
/// Escape closes it, and the field takes the focus back.
struct MacComposerPopover<Content: View, Footer: View>: View {
    let kind: ComposerPanel
    /// The capsule, on the screen.
    let anchor: CGRect
    let onDismiss: () -> Void
    @ViewBuilder let content: Content
    @ViewBuilder let footer: Footer
    @State private var shown = false

    var body: some View {
        GeometryReader { geo in
            let screen = geo.frame(in: .global)
            let capsule = anchor.offsetBy(dx: -screen.minX, dy: -screen.minY)
            let size = CGSize(width: 360, height: kind == .stickers ? 420 : 460)
            let x = kind == .stickers
                ? min(geo.size.width - size.width - 12, capsule.maxX - ComposerMetrics.sendWidth - size.width + ComposerMetrics.stickerWidth)
                : max(12, capsule.minX)
            let y = max(12, capsule.minY - 8 - size.height)
            ZStack(alignment: .topLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onDismiss)
                    .accessibilityHidden(true)
                VStack(spacing: 6) {
                    content
                    footer
                }
                .padding(.top, 8)
                .padding(.bottom, 10)
                .frame(width: size.width, height: size.height)
                .background { PaperSheet(seed: kind == .stickers ? 53 : 59) }
                .clipShape(MenuSheetShape(seed: kind == .stickers ? 53 : 59))
                .scaleEffect(shown ? 1 : 0.96, anchor: kind == .stickers ? .bottomTrailing : .bottomLeading)
                .opacity(shown ? 1 : 0)
                .offset(x: max(12, x), y: y)
            }
        }
        .ignoresSafeArea()
        .accessibilityAction(.escape, onDismiss)
        .onEscapeKey(onDismiss)
        .onAppear { withAnimation(.timingCurve(0.2, 0.8, 0.3, 1, duration: 0.18)) { shown = true } }
    }
}

/// The sticker previewed (round 22 §4.1), placed on the screen: its sheet 10 over the composer while the thread
/// has room for it, else just under the capsule over the grown panel; the thread above the composer takes a
/// tap that lets it go.
struct StickerPreviewLayer: View {
    let sticker: StickerRef
    /// The composer's top (what rides over the capsule included), the capsule's foot and the thread's top, on the screen.
    let composerTop: CGFloat
    let capsuleBottom: CGFloat
    let threadTop: CGFloat
    let onDismiss: () -> Void
    let onSend: () -> Void

    static let height: CGFloat = 200

    var body: some View {
        GeometryReader { geo in
            let origin = geo.frame(in: .global).minY
            let above = composerTop - threadTop >= Self.height + 24
            let top = (above ? composerTop - 10 - Self.height : capsuleBottom + 12) - origin
            ZStack(alignment: .top) {
                Color.clear
                    .frame(height: max(0, composerTop - origin))
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onDismiss)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .accessibilityHidden(true)
                StickerPreview(sticker: sticker, onSend: onSend)
                    .frame(height: Self.height)
                    .offset(y: top)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        .ignoresSafeArea()
    }
}
