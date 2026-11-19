import DesignSystem
import ResonanceKit
import SwiftUI

/// A card's page (card/[slug]/page.tsx): the cover, the title in the story's type, the byline under
/// it at every width (round 8 §10.1), the story, tags, then one row — the reader's response bar at
/// its start, the card's share and ⋯ at its end (§10.2); then the resonance and related sections,
/// set straight on the page. The title and story are set by their script (`CardModel.storyType` →
/// ``StoryTypography``). The share and the ⋯ head the page too: on a phone in the bar, as phone apps
/// keep a page's actions; on a tablet at the end of the byline, with the author and the read time ·
/// date (the web's byline, §10.1: ``CardPageLayout/actionsInByline(window:)``). A wide window's rail
/// holds the story's table of contents, when it has one; a story with none is centred.
struct CardScreen: View {
    let key: String
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @Environment(\.openURL) private var openURL
    @State private var model: CardModel?
    @State private var scrolled = false
    /// The byline has scrolled under the bar, which then names the author.
    @State private var bylineGone = false
    /// A link card's page on an IP address or a punycode name waits here for the reader's yes.
    @State private var linkToConfirm: ChatLinks.Parsed?
    /// How far through the story the reader is, for the bar's terracotta line (only the bar reads it).
    @State private var meter = ReadingMeter()
    /// The owner moved the card to the trash on this page: the page goes up to its banner, which takes the focus.
    @State private var trashedHere = TrashedHere()
    /// 查看全部: every resonance shown, not the first three (C1).
    @State private var allResonances = false
    /// The story's translation (round 25 §F): there only for a story the page offers to translate.
    @State private var translator: StoryTranslator?
    /// Where the reader was in the story when the toast's 看譯文 swapped it (a share of the story's height), kept
    /// until the translated story is measured and the page scrolled back to the same place.
    @State private var keptPlace: KeptPlace?
    /// The translation asked for and not yet come: cancelled when the page goes, so 譯文好了 · 看譯文 (or the
    /// announcement) never comes over another screen.
    @State private var translation: Task<Void, Never>?
    @State private var position = ScrollPosition(idType: String.self)
    @Environment(\.window) private var window
    /// A tablet's header (round 5 C1): the card's title fades into its centre in place of the author.
    @Environment(\.headerChrome) private var headerChrome
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// How this page view of someone else's card is read (round 26 §U7), never drawn.
    @State private var reading = ReadingTracker()
    /// What the page has across.
    @State private var width: CGFloat?
    private static let pageSpace = "card.page"
    /// The page's head, where the trash banner stands.
    private static let pageHead = "card.head"
    /// The story's end: the reader's row, or the author's line of who resonated.
    static let pageEnd = "card.end"

    /// A tablet's card page sets its lists' headings apart (round 5 E2): 64 above each, 56 down to its
    /// cards — the same for every list.
    private var tablet: Bool { window.topTabs }
    static let tabletHeadingAbove: CGFloat = 64
    static let tabletHeadingGap: CGFloat = 56

    /// The article's column, and beside it on a wide window the rail of the story's table of contents
    /// — only when the story has one (until it has loaded, the column is centred).
    private var layout: CardPageLayout {
        .of(width: width ?? window.contentWidth, window: window.width, contents: !contents.isEmpty)
    }

    /// The story's table of contents, once the card has loaded.
    private var contents: [TocEntry] { model?.phase == .loaded ? shownStory?.toc ?? model?.toc ?? [] : [] }

    /// The translation, while it shows in place of the story (round 25 §F2: title and story only).
    private var shownStory: CardModel.ReadStory? { translator?.showing == true ? translator?.story : nil }
    /// A tablet's window: the card's share and ⋯ end the byline row, not the bar (round 8 §10.1).
    private var actionsInByline: Bool { CardPageLayout.actionsInByline(window: window.width) }
    /// How far the lists under the story reach out of the article's column on either side: on a
    /// phone and down a medium window's middle they are bands, whose paper and wavy rules run from
    /// edge to edge of the page while the cards keep to their measure inside (``StoryBand``) — as a
    /// phone's do. On an expanded window they stay in the column (the bordered grid's), rail or none.
    private var bleed: CGFloat { window.layoutClass == .expanded ? 0 : max(0, layout.leading) }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                column.id(Self.pageHead)
                    // Where the paper puppets' marks are measured, and their island laid over: the content's own points.
                    .mascotContent()
                    // A touch anywhere on the page is reading (§U7.1), told by the scroll view and never taken from it.
                    .background(ReadingTouches { [reading] in reading.interacted() })
            }
            // The note field's block to just above the keyboard as it takes the focus (round 26: the page scrolls).
            .environment(\.scrollCardTo) { id in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { proxy.scrollTo(id, anchor: .bottom) }
            }
            // The toast's 看譯文 brings the reader back to the same place in the translated story.
            .scrollPosition($position)
            // The paper puppets (round 19), while Settings → 外觀 → 小紙團 is on: on the card once it has
            // loaded, never one in the trash. A tablet's contents rail keeps them out of the right margin.
            .modifier(MascotStage(page: "card", allowed: mascotsAllowed, rail: layout.rail ? CGRect(x: layout.railX, y: 0, width: Tokens.cardRailW, height: 1) : nil))
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            // The page's own scroll (the bar's line and progress): on the page's scroll view alone, not
            // on the rail's table of contents, which scrolls by itself.
            .modifier(CardScroll(screen: self))
            // The contents' rail stays put beside the article as it scrolls (the web's sticky aside).
            .overlay(alignment: .topLeading) {
                if layout.rail { rail(contents, proxy: proxy) }
            }
            // A story with a table of contents slides over from the centre to make room for its rail.
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: layout)
            #if DEBUG
            // `-visualEnd YES` (the release screenshots' round 26 screens): once the card is in, its end in view.
            .task(id: model?.phase == .loaded) {
                guard model?.phase == .loaded, UserDefaults.standard.bool(forKey: "visualEnd") else { return }
                try? await Task.sleep(for: .milliseconds(400))
                proxy.scrollTo(Self.pageEnd, anchor: .center)
            }
            #endif
            .modifier(CardChrome(screen: self))
            // 刪除 here: once the banner shows (the card read again), the page goes up to it.
            .onChange(of: model?.detail.map(TrashedCardBanner.shows) == true) { _, banner in bringBanner(banner, proxy: proxy) }
            .onChange(of: trashedHere) { bringBanner(model?.detail.map(TrashedCardBanner.shows) == true, proxy: proxy) }
        }
    }

    /// The page may host the paper puppets: the card has loaded, and it isn't the owner's card in the trash.
    private var mascotsAllowed: Bool {
        guard model?.phase == .loaded, let detail = model?.detail else { return false }
        return !TrashedCardBanner.shows(detail)
    }

    private func bringBanner(_ banner: Bool, proxy: ScrollViewProxy) {
        guard trashedHere.bringIntoView(banner: banner) else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
            proxy.scrollTo(Self.pageHead, anchor: .top)
        }
    }

    /// The translate line's model, once the card has loaded and only for a story the page offers to translate
    /// (§F3); with 自動翻譯 on it asks at once (§F4), showing the original with 翻譯中⋯ meanwhile.
    private func startTranslator() {
        guard translator == nil, let detail = model?.detail else { return }
        let language = Strings.shared.language
        guard StoryTranslationRule.offers(detail, interface: language) else { return }
        let api = session.reading
        let made = StoryTranslator(key: detail.card.id, language: language) { key, to in try await api.translate(key, to: to) }
        translator = made
        if TranslationSettings.shared.autoTranslate { askForTranslation(made) }
    }

    /// The request runs while the page is there: a new one replaces the last, and the page going cancels it.
    private func askForTranslation(_ translator: StoryTranslator) {
        translation?.cancel()
        translation = Task { await requestTranslation(translator) }
    }

    /// Back on the page (another card was pushed over it, say) with 自動翻譯 on: the request the page's going cut
    /// short is asked for again.
    private func resumeTranslation() {
        guard let translator, translator.phase == .idle, translation == nil, TranslationSettings.shared.autoTranslate else { return }
        askForTranslation(translator)
    }

    /// Asks for the translation: it swaps in if the line is on screen when it comes, else the toast offers it.
    private func requestTranslation(_ translator: StoryTranslator) async {
        let gone = { bylineGone }
        let toasts = session.toasts
        await translator.request(inView: { !gone() }) {
            toasts.show(L10n.Card.Translate.ready, action: .init(label: L10n.Card.Translate.show,
                                                                 accessibilityLabel: "\(L10n.Card.Translate.ready) · \(L10n.Card.Translate.show)") {
                revealKeepingPlace(translator)
            })
        }
    }

    /// 看譯文: the translation swaps in and the reader stays at the same place in the story.
    private func revealKeepingPlace(_ translator: StoryTranslator) {
        keptPlace = KeptPlace.at(story: meter.story, visibleTop: meter.viewport.top, untilSettled: !reduceMotion)
        guard !reduceMotion else { translator.show(); return }
        // The crossfade's frames move the story (the outgoing title still holds its slot): the page follows it
        // until the original has gone, then takes the settled place once more and lets go.
        withAnimation(.easeInOut(duration: 0.18), completionCriteria: .removed) { translator.show() } completion: {
            Task { @MainActor in
                if let offset = keptPlace?.offset(story: meter.story, insetTop: meter.insetTop) {
                    position.scrollTo(y: offset)
                }
                keptPlace = nil
            }
        }
    }

    /// A tap on the line: translate, show the translation again, or the original.
    private func translateLineTapped(_ translator: StoryTranslator) {
        switch translator.phase {
        case .idle, .failed: askForTranslation(translator)
        case .shown: withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { translator.showOriginal() }
        case .original: withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) { translator.show() }
        case .working, .spent: break
        }
    }

    /// The story's table of contents beside a wide window's article (the web's aside; the author is
    /// the byline's, under the title). It never runs past the window: it ends 24 above the foot, as
    /// the web's `max-height` keeps it, and a long table of contents scrolls in what is left.
    private func rail(_ toc: [TocEntry], proxy: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            CardToc(entries: toc, title: L10n.Card.toc, meter: meter) { entry in
                meter.choose(entry.index)
                // The heading 16 under the bar's line (the web's scroll-margin-top), smoothly unless motion is reduced.
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) {
                    proxy.scrollTo(StoryHeadingAnchor(index: entry.index), anchor: .top)
                }
            }
        }
        .frame(width: Tokens.cardRailW, alignment: .leading)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.leading, layout.railX)
        // Level with the article's title (round 9 §2: the reading head under the header's pen line).
        .padding(.top, PenLineGap.fromFoot(StoryTypography(script: .cjk, layout: window.layoutClass).headGap(cover: false)))
        .padding(.bottom, 24)
        .transition(.opacity)
    }

    /// The page inside the article's column (centred; beside the rail on a wide window).
    private var column: some View {
        Group {
            switch model?.phase ?? .loading {
            case .loading:
                // Opened from a list: that list's byline, cover and title at once; the rest while it loads.
                if let card = model?.placeholder { placeholderPage(card) } else { CardDetailSkeleton() }
            case .notFound:
                OrganicEmptyState(title: L10n.Card.NotFound.title, titleSize: 24, actionTitle: L10n.Card.NotFound.back,
                                  actionStyle: .link) { openRoute.dismissToRoot() }
            case .failed:
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    Task { await model?.load() }
                }
            case .loaded:
                if let model, let detail = model.detail { page(model, detail) }
            }
        }
        .frame(width: max(0, layout.article))
        .padding(.leading, max(0, layout.leading))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    fileprivate func scroll(_ content: some View) -> some View {
        content
        .onHeaderScroll($scrolled)
        // The story's progress: where the bar's line is in the scrolled content, and how much shows.
        .onScrollGeometryChange(for: ReadingMeter.Viewport.self) { geo in
            // The container is already what shows inside the insets (the bar, the home indicator).
            .init(top: geo.contentOffset.y + geo.contentInsets.top, height: geo.containerSize.height)
        } action: { _, viewport in
            meter.viewport = viewport
            // A scroll is reading (§U7): how far through the story has been in view.
            reading.scrolled(story: meter.story, visibleTop: viewport.top, visibleHeight: viewport.height)
        }
        // So is a key (§U7.1), which goes on to whatever it was for.
        .onKeyPress(phases: .down) { [reading] _ in
            reading.interacted()
            return .ignored
        }
        .onScrollGeometryChange(for: CGFloat.self) { $0.contentInsets.top } action: { _, inset in meter.insetTop = inset }
        // Where the byline ends, as measured under the title (until then, about where a phone's lands).
        .onScrollGeometryChange(for: Bool.self) { [meter] in
            $0.contentOffset.y + $0.contentInsets.top > (meter.bylineBottom ?? ReadingMeter.bylineBottomGuess)
        } action: { _, gone in
            withAnimation(.easeOut(duration: 0.2)) { bylineGone = gone }
        }
        // A heading chosen in the table of contents is held marked until the scroll there ends.
        .onScrollPhaseChange { old, new in
            if new == .idle, old != .idle { meter.scrollSettled() }
        }
        .scrollIndicators(.hidden)
    }

    fileprivate func chrome(_ content: some View) -> some View {
        content
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            Metered(meter: meter) { progress, titleGone in
            OrganicInlineBar("", backLabel: L10n.App.Nav.back, scrolled: scrolled) {
                if headerChrome != nil {
                    // A tablet's header centres the card's title once the article's own has scrolled under it.
                    HeaderContextTitle(model?.detail?.card.title ?? "", shown: titleGone && model?.phase == .loaded)
                } else if let detail = model?.detail, model?.phase == .loaded, bylineGone {
                    // The byline has scrolled under the bar: the bar names the author.
                    BarAuthor(card: detail.card, anonymous: detail.anonymous)
                        .transition(.opacity.combined(with: .offset(y: 8)))
                }
            } trailing: {
                // The owner's card in the trash has neither its share nor its ⋯: its banner is the way out.
                // On a phone they live in the bar, as phone apps keep a page's actions; a tablet's byline holds
                // them, and once it has scrolled under the bar they come up into it (round 9 §3).
                if let detail = model?.detail, model?.phase == .loaded, !TrashedCardBanner.shows(detail),
                   !actionsInByline || bylineGone {
                    HStack(spacing: 0) { cardActions(detail, seed: (detail.card.accentHue ?? 55) + 3) }
                        .transition(.opacity)
                }
            }
            .readingProgress(model?.phase == .loaded ? progress : nil)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .organicConfirm(isPresented: Binding(get: { linkToConfirm != nil }, set: { if !$0 { linkToConfirm = nil } }),
                        title: L10n.Messages.linkConfirmTitle, message: L10n.Messages.linkConfirmBody(host: linkToConfirm?.host ?? ""),
                        cancelLabel: L10n.Messages.linkConfirmCancel, confirmLabel: L10n.Messages.linkConfirmOpen,
                        closeLabel: L10n.Messages.linkConfirmCancel, seed: 61) {
            if let link = linkToConfirm { InAppBrowser.open(link.url) }
            linkToConfirm = nil
        }
        .task {
            if model == nil {
                // A card page opened: counted toward tonight's card's invite (notification-asks §3).
                session.notifyAsks.cardOpened()
                let previews = session.cardPreviews
                let model = CardModel(key: key, api: session.reading, origin: session.config.origin, placeholder: previews.card(for: key))
                model.onLoaded = { previews.remember($0) }
                model.onNotFound = { previews.forget($0) }
                model.onShown = { [session] in session.cardReads.count($0, viewer: session.uid) }
                self.model = model
            }
            // Also resumes a load that was cut short when the page left mid-way.
            if let model, model.detail == nil { await model.load() }
        }
        // The card has loaded: the translate line, when the story is one to offer it for.
        .onChange(of: model?.phase == .loaded, initial: true) { _, loaded in if loaded { startTranslator() } }
        // The translated story measured after the toast's 看譯文: back to where the reader was.
        .onChange(of: meter.story) { _, story in
            guard let kept = keptPlace, let offset = kept.offset(story: story, insetTop: meter.insetTop) else { return }
            if !kept.untilSettled { keptPlace = nil }
            position.scrollTo(y: offset)
        }
        // The page went (to the feed, another card): a translation still on its way is not shown or offered elsewhere.
        .onDisappear {
            translation?.cancel()
            translation = nil
        }
        .onAppear(perform: resumeTranslation)
        // Reading counts while the page is on show — appeared, on the tab chosen, the app in front — and its running
        // totals go each time it goes out of show (again each time it does).
        .modifier(ReadingOnShow(reading: reading) { reportReading($0) })
        // The card has loaded: its page view's reading starts (someone else's card only).
        .onChange(of: model?.phase == .loaded, initial: true) { _, loaded in
            if loaded, let detail = model?.detail { reading.start(detail, viewer: session.uid) }
        }
        .environment(\.cardShared) { [reading] in reading.shared() }
        .environment(\.cardInteracted) { [reading] in reading.interacted() }
        // Edited, published or re-shelved from the writer or the ⋯ — this card, or a
        // resonance to it: read it again (another card's draft leaves it as it is).
        .onChange(of: writer.changes) {
            guard let model else { return }
            if let id = model.detail?.card.id, let change = writer.lastChange, !change.concerns(id) { return }
            Task { await model.load() }
        }
        // Someone's card for connections only, and the connection with them began or ended (a take-back —
        // either one's, from anywhere): read again, so a card the reader may no longer see goes.
        .onChange(of: session.connectionsMoved) { _, moved in
            guard let model, moved.concerns(model.seenThroughConnection) else { return }
            Task { await model.load() }
        }
    }

    /// The page went out of show: its reading's running totals so far go to the server (kept on the device until they do).
    private func reportReading(_ hid: ReadingTracker.Report?) {
        guard let uid = session.uid, let hid else { return }
        session.readingReports.report(hid.report, cardId: hid.cardId, uid: uid)
    }

    /// The card's share and its ⋯, as the bar's ghost glyphs: the share only for a card whoever gets its
    /// link can open (published and public, share.spec §1: the system's sheet, with the card's link and
    /// its picture); the owner's ⋯, or the reader's safety menu — anonymous cards included (App Store
    /// 1.2), whose author only the server knows: Report alone. The bar's (a phone's) or the byline's (a
    /// tablet's), and the story's end's, alike.
    @ViewBuilder fileprivate func cardActions(_ detail: CardDetail, seed: Double) -> some View {
        let card = detail.card
        if CardShareGate.offered(detail) {
            CardShareButton(detail: detail, seed: seed + 2)
        }
        // A 私人卡 is never shared: where share would sit, the way back into the writer (round 9 §1).
        if Self.isPrivateCard(detail) {
            OrganicIconButton(.pen, label: L10n.Me.Actions.edit, size: 20) { writer.edit(card.id, showsCard: false) }
                .help(L10n.Me.Actions.edit)
        }
        if detail.isOwner {
            // 刪除 leaves the page here, its trash banner in place of the share and the ⋯ (the page goes up to it: TrashedHere).
            CardActionsMenu(cardId: card.id, visibility: card.visibility.rawValue, seed: seed,
                            answering: card.referenceCardId, answeringTitle: detail.referenceCard?.value1.title,
                            answeringAnonymous: detail.referenceCard?.value1.anonymous,
                            isPublished: card.publishedAt != nil, anonymous: detail.anonymous, title: card.title,
                            trashFeedback: .page, showsCardAfterEdit: false,
                            // A 私人卡's pen stands beside it: its ⋯ leads with 公開發表 instead of a second 編輯 (round 12 §3).
                            editShown: Self.isPrivateCard(detail), onTrashed: { trashedHere.trashed() },
                            // Each move shows on the page at once, before the server answers (round 21).
                            showMove: { [model] move in model?.show(move) ?? {} },
                            trigger: .bare)
        } else {
            let author = detail.anonymous ? nil : card.author?.value1
            SafetyMenu(target: .card(id: card.id, authorId: author?.id), handle: author?.handle, seed: seed)
        }
    }

    /// A 私人卡 (round 9 §1): the owner's card only its author sees — never published, or published and
    /// kept private — and not in the trash (whose banner says what it is).
    static func isPrivateCard(_ detail: CardDetail) -> Bool {
        detail.isOwner && !TrashedCardBanner.shows(detail) && isPrivate(detail.card)
    }

    /// A card only its author sees: never published, or published and kept private.
    static func isPrivate(_ card: FeedCard) -> Bool {
        card.publishedAt == nil || card.visibility == ._private
    }

    /// Someone else's 私人卡 that the reader reads at all was shared with them in a message
    /// (api/v1/sharedCards): theirs to read, and only to read — its byline wears the same 🔒 私人卡, and
    /// the story's end says who shared it instead of the response bar (a note, a resonance, a bookmark:
    /// the server refuses each). No share (``CardShareGate``); the ⋯ is the reader's safety menu.
    static func isSharedPrivate(_ detail: CardDetail) -> Bool {
        !detail.isOwner && isPrivate(detail.card)
    }

    /// The story's end of a shared 私人卡: who shared it, and that it is the reader's alone.
    static func sharedPrivatelyLine(_ detail: CardDetail) -> String {
        let author = detail.anonymous ? nil : detail.card.author?.value1
        return L10n.Card.sharedPrivately(handle: author?.handle ?? L10n.Card.anonymousAuthor)
    }

    private func page(_ model: CardModel, _ detail: CardDetail) -> some View {
        let card = detail.card
        // The translation, while it shows (round 25 §F2): its own script's type and language, its own headings.
        let shown = shownStory
        let type = shown?.type ?? model.storyType
        let blocks = shown?.blocks ?? model.blocks
        let toc = shown?.toc ?? model.toc
        let story = StoryTypography(script: type.script, layout: window.layoutClass)
        // The owner's card in the trash: its banner first, and nothing around the story but its tags.
        let trashed = TrashedCardBanner.shows(detail)
        let hasCover = card.imageUrl.flatMap(URL.init(string:)) != nil
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                if trashed {
                    // Deleted for good: to the card box, the card left out of it at once (round 21, the web's `/me`).
                    TrashedCardBanner(card: card, focusTitle: trashedHere.focusTitle) { openRoute.toCardBox() }
                        .padding(.bottom, 24)
                }
                // A tablet's byline ends in the card's share and ⋯ — not the owner's card in the trash, whose banner is
                // the way out — until it scrolls under the bar, which takes them (round 9 §3).
                head(card, anonymous: detail.anonymous, type: type, actions: actionsInByline && !trashed ? detail : nil,
                     privateCard: Self.isPrivateCard(detail) || Self.isSharedPrivate(detail),
                     title: shown != nil ? translator?.title : nil, translator: trashed ? nil : translator)
                // The translation and the original crossfade (180 ms; none under Reduce Motion) in one slot: the
                // outgoing copy lies under the incoming one, not above it in the column, and only the copy that
                // shows measures the story.
                let translatedCopy = shown != nil
                ZStack(alignment: .topLeading) {
                // A card the reader can't see (private, gone, blocked) is the link the story wrote, as the prose draws one.
                StoryMarkdownView(blocks: blocks, typography: story, language: type.lang, onOpenURL: open) { href, _ in
                    model.embed(for: href).map { CardEmbedView(href: href, card: $0) }
                } linkCard: { href, text in
                    if let preview = model.linkPreview(href: href, text: text) {
                        // The host as the card shows it is also what VoiceOver says the card opens (as on the web).
                        let host = preview.link.host.replacingOccurrences(of: "www.", with: "", options: .anchored)
                        return StoryLinkCard(title: preview.title, description: preview.description, host: host,
                                             imageURL: preview.imageURL, seed: Double(seedFromString(preview.url.absoluteString)),
                                             openLabel: L10n.Card.LinkPreview.open(host: host)) { openPreview(preview) }
                    }
                    // An address the writer made a card with no page read for it (a private card's): still a card.
                    return model.linkFallback(href: href, text: text).map { bare in
                        StoryLinkCard.address(host: bare.host, address: bare.address, seed: Double(seedFromString(bare.link.url.absoluteString)),
                                              openLabel: L10n.Card.LinkPreview.open(host: bare.host)) { openLink(bare.link) }
                    }
                }
                // Its headings are where the rail's table of contents takes the page, and where they
                // are says which one is being read.
                .anchoringHeadings(in: Self.pageSpace)
                // What VoiceOver names a table in it.
                .environment(\.storyTableLabel, L10n.Card.table)
                .onPreferenceChange(StoryHeadingTops.self) { [translator] tops in
                    guard StoryCrossfade.measures(translatedCopy: translatedCopy, showing: translator?.showing == true) else { return }
                    let wanted = Set(toc.map(\.index))
                    meter.headings = tops.filter { wanted.contains($0.key) }
                        .map { TocReading.Heading(index: $0.key, top: $0.value) }
                        .sorted { $0.top < $1.top }
                }
                // The story block alone (not the cover, title or what follows) is what the progress measures.
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.pageSpace)) } action: { [translator] frame in
                    if StoryCrossfade.measures(translatedCopy: translatedCopy, showing: translator?.showing == true) { meter.story = frame }
                }
                .id(translatedCopy)
                .transition(.opacity)
                }
                .padding(.bottom, story.endGap)
                if !card.tags.isEmpty {
                    // Tags are app furniture: the theme colour, not the card's hue.
                    FlowRow(spacing: 8) {
                        ForEach(card.tags, id: \.self) { TagPill($0, fill: Tokens.terracottaLight) }
                    }
                    .readingMark(.ceiling)
                    .padding(.bottom, 40)
                }
                // The story's end (round 9 §3): the response bar alone — share and ⋯ are the bar's (a phone's) or
                // the byline's (a tablet's) — and none on the author's own card. Someone else's 私人卡, shared in a
                // message, is only to read: one quiet line in its place.
                if !trashed, Self.isSharedPrivate(detail) {
                    Text(Self.sharedPrivatelyLine(detail))
                        .font(AppFonts.body(14)).foregroundStyle(Tokens.textMuted)
                        .lineSpacing(14 * 0.4)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 40)
                } else if !trashed, !detail.isOwner {
                    endRow(detail).padding(.bottom, 40)
                } else if !trashed, AuthorTaps.shows(detail), let tap = detail.tap?.value1 {
                    // The author's own card (§U3): who resonated, as faces after the wave — nothing when no one has.
                    AuthorTaps(cardId: card.id, faces: tap.faces, more: tap.more)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .id(Self.pageEnd)
                        .padding(.bottom, 40)
                }
                if !trashed, !model.links.isEmpty {
                    Text(L10n.Card.linkedCards)
                        .font(AppFonts.heading(20))
                        .foregroundStyle(Tokens.text)
                        // A tablet's headings: 64 above (the 40 of the row before it, and 24), 56 to its cards.
                        .padding(.top, tablet ? Self.tabletHeadingAbove - 40 : 0)
                        .padding(.bottom, tablet ? Self.tabletHeadingGap : 24)
                }
            }
            .padding(.horizontal, 20)
            // The reading head (round 9 §2): the title's box 48 / 64 under the bar's pen line, a cover's top 56 / 72.
            .padding(.top, PenLineGap.fromFoot(story.headGap(cover: hasCover && !trashed)))

            if !trashed, !model.links.isEmpty { MiniCardList(cards: model.links).padding(.horizontal, -bleed).padding(.bottom, 40) }
            // The article's own bottom padding — already there under a last row that keeps its own 40
            // (the story's end row, the tags, the linked cards): not a second band of air.
            if trashed && card.tags.isEmpty { Color.clear.frame(height: 8) }

            let resonance = trashed ? [] : model.resonanceSection
            if !resonance.isEmpty {
                // The same full cards as 延伸的卡片 (C1): three, then 查看全部 shows the rest in place.
                section(L10n.Card.Replies.title, headingGap: tablet ? Self.tabletHeadingGap : 56) {
                    StoryCardList(cards: Self.shownResonances(resonance, all: allResonances)).padding(.horizontal, -bleed)
                    if Self.resonancesHidden(resonance, all: allResonances) {
                        OrganicButton(L10n.Card.ResonanceSection.showAll(count: resonance.count), variant: .tonal, size: .sm) {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { allResonances = true }
                        }
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 24)
                    }
                }
            }
            if !trashed, !model.related.isEmpty {
                // Bands, and on an expanded window the bordered grid — as the lists above it (round 5 D3).
                section(L10n.Card.related, headingGap: tablet ? Self.tabletHeadingGap : 56) {
                    StoryCardList(cards: model.related).padding(.horizontal, -bleed)
                }
            }
            // The page's own air under its last section (editing your card is in its ⋯).
            Color.clear.frame(height: 40)
        }
        .coordinateSpace(.named(Self.pageSpace))
    }

    /// The resonances shown (C1): the first three, all of them once 查看全部 is pressed.
    static let resonancesShownFirst = 3

    static func shownResonances(_ cards: [FeedCard], all: Bool) -> [FeedCard] {
        all ? cards : Array(cards.prefix(resonancesShownFirst))
    }

    /// Whether some are left for 查看全部 to show.
    static func resonancesHidden(_ cards: [FeedCard], all: Bool) -> Bool {
        !all && cards.count > resonancesShownFirst
    }

    /// The story's end (round 26 §U1): the three kinds of feedback (共振 · 寄小紙條 · 用卡片回應), the faces and 收藏 under
    /// them, and the note in place when it is open (``CardEndRow``) — the card's share and ⋯ are in the bar or the
    /// byline already. It fades in once scrolled to; its coming into view is the story read through (§U7).
    private func endRow(_ detail: CardDetail) -> some View {
        CardEndRow(detail: detail)
            .id(Self.pageEnd)
            .revealedOnScroll()
            .onScrollVisibilityChange(threshold: 0.3) { [reading] visible in if visible { reading.sawEnd() } }
    }

    /// Cover, title and byline: what a list already knows of the card. The cover, `coverGap`, the
    /// title in the story's type, `metaGap`, then the byline at every width — the author over the
    /// read time and date (round 8 §10.1), ending on a tablet in the card's share and ⋯ (`actions`,
    /// once the card has loaded) — and `leadGap` down to the story.
    private func head(_ card: FeedCard, anonymous: Bool, type: StoryType, actions detail: CardDetail? = nil,
                      privateCard: Bool = false, title shownTitle: String? = nil, translator: StoryTranslator? = nil) -> some View {
        let hue = card.accentHue ?? 55
        let story = StoryTypography(script: type.script, layout: window.layoutClass)
        return VStack(alignment: .leading, spacing: 0) {
            if let url = card.imageUrl.flatMap(URL.init(string:)) {
                OrganicImage(url: url, seed: hue + 11, fill: Tokens.creamDark)
                    // On its way, the cover shimmers in the card's own hue (as in its story card).
                    .environment(\.skeletonHue, card.accentHue)
                    // Its 0.52 cut from the cover's frame (round 25 §G1).
                    .coverFraming(card.coverFraming)
                    .aspectRatio(1 / 0.52, contentMode: .fit)
                    .readingMark(.cover)
                    .padding(.bottom, story.coverGap)
                    .accessibilityLabel(card.imageLabel ?? card.title)
            }
            // The two titles crossfade in one slot, as the story does; only the one that shows measures.
            let translatedCopy = shownTitle != nil
            // The page's own translator (the line's `translator` is left out on a trashed card).
            let live = self.translator
            ZStack(alignment: .topLeading) {
                StoryTitle(shownTitle ?? card.title, typography: story, lang: type.lang)
                    // Where the title ends, for the tablet header's centre (it fades in once this is under the line).
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.pageSpace)).maxY } action: { bottom in
                        if StoryCrossfade.measures(translatedCopy: translatedCopy, showing: live?.showing == true) {
                            meter.titleBottom = bottom
                        }
                    }
                    .id(translatedCopy)
                    .transition(.opacity)
            }
            .padding(.bottom, story.metaGap)
            StoryBylineRow(card: card, anonymous: anonymous, avatar: story.bylineAvatar, metaSize: story.metaSize,
                           privateCard: privateCard) {
                if let detail {
                    HStack(spacing: 4) { cardActions(detail, seed: (card.accentHue ?? 55) + 3) }
                        // The glyphs' own pads sit in the margin, their ink on the column's edge.
                        .padding(.trailing, -12)
                        // Under the bar they are the bar's (round 9 §3): kept in place here, out of sight and reach.
                        .opacity(bylineGone ? 0 : 1)
                        .allowsHitTesting(!bylineGone)
                        .accessibilityHidden(bylineGone)
                }
            }
                // Where the byline ends: past it, the bar names the author.
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.pageSpace)).maxY } action: { meter.bylineBottom = $0 }
                .padding(.bottom, translator == nil ? story.leadGap : story.metaGap)
            // The translate line (round 25 §F2): its own row under the byline, above the story's first block.
            if let translator {
                TranslateLine(translator: translator, metaSize: story.metaSize) { translateLineTapped(translator) }
                    .padding(.bottom, story.leadGap)
            }
        }
    }

    /// The page as a list knew the card: its head as it will stand, then the
    /// story still loading.
    private func placeholderPage(_ card: FeedCard) -> some View {
        let type = model?.storyType ?? StoryType(script: .cjk, lang: nil)
        let story = StoryTypography(script: type.script, layout: window.layoutClass)
        return VStack(alignment: .leading, spacing: 0) {
            // A 私人卡 — the owner's, or one shared with the reader in a message — wears its lock from the start.
            head(card, anonymous: card.anonymous, type: type, privateCard: Self.isPrivate(card))
            StorySkeleton(typography: story)
        }
        .padding(.horizontal, 20)
        .padding(.top, PenLineGap.fromFoot(story.headGap(cover: card.imageUrl.flatMap(URL.init(string:)) != nil)))
    }

    /// A section under the article. On phones the web drops the tinted band
    /// and its wavy edge — the cards' own bands are chrome enough — so the
    /// heading sits straight on the page.
    private func section<Cards: View>(_ title: String, headingGap: CGFloat, @ViewBuilder cards: () -> Cards) -> some View {
        VStack(spacing: 0) {
            Text(title)
                .font(AppFonts.heading(22))
                .foregroundStyle(Tokens.text)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.bottom, headingGap)
                .accessibilityAddTraits(.isHeader)
            cards()
        }
        .padding(.top, tablet ? Self.tabletHeadingAbove : 32)
        .padding(.bottom, 16)
    }

    /// A link's card opens the page as a link in a message does: in the in-app browser — after
    /// asking, when it is an IP address or a punycode name.
    private func openPreview(_ preview: LinkPreview) {
        openLink(preview.link)
    }

    /// A page a link card leads to: asked first when its host is one a reader can't vouch for (punycode).
    private func openLink(_ link: ChatLinks.Parsed) {
        if link.suspicious { linkToConfirm = link } else { InAppBrowser.open(link.url) }
    }

    /// Links in the story lead where their scheme says (`StoryLink`): a page
    /// of this site the app shows itself opens here, any other page of the
    /// site — or of the web — in the in-app browser, mailto: in Mail. Nothing
    /// else is opened: a stranger's story can't start another app.
    private func open(_ url: URL) {
        let origin = session.config.origin
        switch StoryLink.resolve(url.absoluteString, origin: origin) {
        case let .site(path):
            guard let page = URL(string: origin.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else { return }
            if let route = Route(url: page, origin: origin) { openRoute(route) } else { InAppBrowser.open(page) }
        case let .web(page):
            InAppBrowser.open(page)
        case let .mail(address):
            openURL(address)
        case nil:
            break
        }
    }
}

/// The author in the bar once the byline has scrolled away: the avatar small
/// and the pen name (→ their page); an anonymous card shows its dot and
/// "anonymous".
/// The card page's own chrome around its scroll view: the bar with its reading progress, the dialogs,
/// and what reloads the card.
private struct CardChrome: ViewModifier {
    let screen: CardScreen

    func body(content: Content) -> some View { screen.chrome(content) }
}

/// When the card page is on show, for its reading (§U7): it has appeared, its tab is the one chosen (every tab's stack
/// stays mounted, so a page on a tab left never disappears) and the app is in front — read here, so a tab switch or
/// the app's phase never draws the page again. Each time it goes out of show, `report` is given its totals so far.
private struct ReadingOnShow: ViewModifier {
    let reading: ReadingTracker
    let report: (ReadingTracker.Report?) -> Void
    @Environment(\.isSelectedTab) private var onSelectedTab
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .onAppear { report(reading.appeared(true, onSelectedTab: onSelectedTab)) }
            .onDisappear { report(reading.appeared(false, onSelectedTab: onSelectedTab)) }
            .onChange(of: onSelectedTab) { _, chosen in report(reading.tabChosen(chosen)) }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { report(reading.sceneActive(false)) } else if phase == .active { report(reading.sceneActive(true)) }
            }
    }
}

/// What the card page reads from its own scroll view: the bar's line and the reading progress.
private struct CardScroll: ViewModifier {
    let screen: CardScreen

    func body(content: Content) -> some View { screen.scroll(content) }
}

/// The line under the title, at every width (the web's StoryByline; round 8 §10.1): the author's
/// avatar (40) and pen name (each → their page; the name one line, its end cut with an ellipsis),
/// the region's flag and the verified mark, over the meta line. An anonymous card shows the neutral
/// 「·」 and 「匿名」 in muted ink, linking nowhere, to everyone — its owner too. The row grows with large
/// text and a wrapping meta line (at least 44, never a fixed height). On a tablet it ends in the card's
/// share and ⋯ (`actions`, the page's); a phone's are the bar's.
struct StoryBylineRow<Actions: View>: View {
    let card: FeedCard
    let anonymous: Bool
    /// The avatar's size (`StoryTypography.bylineAvatar`).
    var avatar: CGFloat = 40
    /// The meta line's size: 13 on a phone, 14 wider (`StoryTypography.metaSize`).
    var metaSize: CGFloat = Tokens.storyMetaSizeCompact
    /// A 私人卡 — the owner's, or one shared with the reader: the meta line ends with the lock and 私人卡 (round 9 §1).
    var privateCard = false
    /// What ends the row, after the author's words: a tablet's share and ⋯ (nothing on a phone).
    @ViewBuilder var actions: Actions
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        let author = card.author?.value1
        HStack(spacing: 12) {
            if let author, !anonymous {
                // The avatar leads to their page as the pen name does; the name stays the one VoiceOver meets.
                Button { openRoute(.author(author.handle)) } label: {
                    HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                    color: author.accent, size: avatar, seed: author.avatarSeedValue)
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            } else {
                HandDrawnAvatar(initials: "·", color: Tokens.avatarWait, size: avatar, seed: 97)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if let author, !anonymous {
                        Button(author.handle) { openRoute(.author(author.handle)) }
                            .font(AppFonts.body(15, weight: .semibold))
                            .foregroundStyle(Tokens.text)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .buttonStyle(.plain)
                            .layoutPriority(-1)
                        AuthorRegionFlag(region: author.region, size: 14)
                        if author.verified {
                            OrganicIcon(.verified, size: 13, color: Tokens.verifiedMark, strokeWidth: 1.8)
                                .accessibilityLabel(L10n.Card.verified)
                        }
                    } else {
                        Text(L10n.Card.anonymousAuthor)
                            .font(AppFonts.body(15, weight: .semibold))
                            .foregroundStyle(Tokens.textMuted)
                            .lineLimit(1)
                    }
                }
                StoryMetaLine(card: card, size: metaSize, privateCard: privateCard)
            }
            Spacer(minLength: 0)
            actions
        }
        .frame(minHeight: 44)
    }
}

extension StoryBylineRow where Actions == EmptyView {
    /// The byline alone: the author and the read time · date.
    init(card: FeedCard, anonymous: Bool, avatar: CGFloat = 40, metaSize: CGFloat = Tokens.storyMetaSizeCompact) {
        self.init(card: card, anonymous: anonymous, avatar: avatar, metaSize: metaSize) { EmptyView() }
    }
}

/// 「6 分鐘 · 2026年10月10日」: the read time and the published date in the reader's language, muted
/// interface type that may wrap (a draft shows its read time alone). On the owner's 私人卡 it ends with
/// a lock and 「私人卡」 (round 9 §1): 「6 分鐘 · 🔒 私人卡」, the date between them when it has one.
struct StoryMetaLine: View {
    let card: FeedCard
    let size: CGFloat
    var privateCard = false

    static func text(_ card: FeedCard) -> String {
        let minutes = L10n.App.readMinutes(count: card.readMinutes)
        return publishedDate(card).map { "\(minutes) · \($0)" } ?? minutes
    }

    /// What VoiceOver reads: the line, and that it is a 私人卡.
    static func spoken(_ card: FeedCard, privateCard: Bool) -> String {
        privateCard ? "\(text(card)), \(L10n.Card.private)" : text(card)
    }

    var body: some View {
        Group {
            if privateCard {
                let lock = OrganicIcon.image(.lock, size: (size * 0.95).rounded())
                Text("\(Text(verbatim: Self.text(card))) · \(Text(lock).baselineOffset(-size * 0.12)) \(Text(verbatim: L10n.Card.private))")
            } else {
                Text(Self.text(card))
            }
        }
        .font(AppFonts.body(size))
        .lineSpacing(size * 0.4)
        .foregroundStyle(Tokens.textMuted)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.spoken(card, privateCard: privateCard))
    }
}

private struct BarAuthor: View {
    let card: FeedCard
    let anonymous: Bool
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        if let author = card.author?.value1, !anonymous {
            Button { openRoute(.author(author.handle)) } label: {
                HStack(spacing: 8) {
                    HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                    color: author.accent, size: 28, seed: author.avatarSeedValue)
                    Text(author.handle)
                        .font(AppFonts.body(15, weight: .semibold))
                        .foregroundStyle(Tokens.text)
                        .lineLimit(1)
                }
                // The bar's other controls' 44pt target, and their ink on press.
                .padding(.horizontal, 6)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(OrganicPressStyle(inset: 2))
            .padding(.horizontal, -6)
        } else {
            HStack(spacing: 8) {
                HandDrawnAvatar(initials: "·", color: Tokens.avatarWait, size: 28, seed: 97)
                Text(L10n.Card.anonymousAuthor)
                    .font(AppFonts.body(15, weight: .semibold))
                    .foregroundStyle(Tokens.textMuted)
                    .lineLimit(1)
            }
        }
    }
}

/// CardDetailSkeleton: the cover, the title, the byline, the story and its tags as shimmering blocks
/// where they will land — the title's bars its line box's size apart, the story's the body's (its
/// script unknown yet: a CJK story's, the site's own).
private struct CardDetailSkeleton: View {
    @Environment(\.window) private var window

    var body: some View {
        let story = StoryTypography(script: .cjk, layout: window.layoutClass)
        VStack(alignment: .leading, spacing: 0) {
            SkeletonBlock(height: 180, radius: 18).padding(.bottom, story.coverGap)
            VStack(alignment: .leading, spacing: story.titleSize * (story.titleLeading - 1)) {
                SkeletonBlock(fraction: 0.9, height: story.titleSize)
                SkeletonBlock(fraction: 0.55, height: story.titleSize)
            }
            .padding(.bottom, story.metaGap)
            HStack(spacing: 12) {
                SkeletonBlock(width: story.bylineAvatar, circle: true)
                VStack(alignment: .leading, spacing: 7) {
                    SkeletonBlock(width: 120, height: 15)
                    SkeletonBlock(width: 160, height: story.metaSize)
                }
            }
            .frame(minHeight: 44, alignment: .leading)
            .padding(.bottom, story.leadGap)
            StorySkeleton(typography: story)
        }
        .padding(.horizontal, 20)
        // The reading head as the page will stand (round 9 §2): a cover's top 56 / 72 under the pen line.
        .padding(.top, PenLineGap.fromFoot(story.headGap(cover: true)))
        .accessibilityElement()
        .accessibilityLabel("Loading")
        .skeletonTimeline()
    }
}

/// The story and its tags, still loading (under a real or skeleton head): bars the body's size, a
/// line box apart.
private struct StorySkeleton: View {
    let typography: StoryTypography

    var body: some View {
        let size = typography.bodySize
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: size * (typography.bodyLeading - 1)) {
                SkeletonBlock(height: size)
                SkeletonBlock(height: size)
                SkeletonBlock(height: size)
                SkeletonBlock(fraction: 0.65, height: size)
            }
            .padding(.bottom, typography.endGap)
            HStack(spacing: 8) {
                SkeletonBlock(width: 64, height: 26, radius: 13)
                SkeletonBlock(width: 84, height: 26, radius: 13)
                SkeletonBlock(width: 56, height: 26, radius: 13)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading")
        .skeletonTimeline()
    }
}

/// A card link standing alone in a story: the linked card as a block like a link's card, holding
/// the card as a chat shares it (round 5 D2), drawn from the summary the card page brought along
/// with the story. One the viewer can't see isn't this: the story draws its link as prose (web:
/// CardEmbedLink).
struct CardEmbedView: View {
    let href: String
    /// The page's summary of the linked card.
    let card: FeedCard
    @Environment(\.openRoute) private var openRoute

    var body: some View {
        StoryCardEmbed(title: card.title, seed: Double(seedFromString(href)),
                       section: SharedCardSection(card: card, onOpen: nil)) { openRoute(.card(card.routeKey)) }
    }
}

/// What the bar's reading progress is made of (design §3): the story block's frame in the page and
/// the scroll's viewport. Only ``Metered`` reads `progress`, so scrolling redraws the bar alone.
@MainActor @Observable
final class ReadingMeter {
    struct Viewport: Equatable {
        var top: CGFloat
        var height: CGFloat
    }

    var story: CGRect = .zero { didSet { update() } }
    /// The article title's bottom in the page (round 5 C1: a tablet's header names the card past it).
    var titleBottom: CGFloat? { didSet { update() } }
    /// The byline's bottom in the page: once it is under the bar, the bar names the author (only the
    /// scroll's own check reads it).
    @ObservationIgnored var bylineBottom: CGFloat?
    /// The scroll's top inset (the bar): a place in the page is scrolled to less this.
    @ObservationIgnored var insetTop: CGFloat = 0
    /// Where a phone's byline ends before it is measured: the reading head over a two-line title under
    /// no cover, its 20 to the byline, the 44 row.
    static let bylineBottomGuess: CGFloat = PenLineGap.fromFoot(Tokens.storyHeadGapCompact) + 2 * 39.2 + Tokens.storyMetaGapCompact + 44
    var viewport = Viewport(top: 0, height: 0) { didSet { update() } }
    /// The table of contents' headings by their tops in the page, in reading order.
    var headings: [TocReading.Heading] = [] { didSet { update() } }
    private(set) var progress: CGFloat?
    private(set) var titleGone = false
    /// The heading being read (its block's place in the story), for the table of contents to mark;
    /// only the table of contents reads it.
    private(set) var readingHeading: Int?
    /// The heading a tap on the table of contents chose, marked while the page scrolls to it.
    private var chosen: Int? { didSet { update() } }
    @ObservationIgnored private var chosenAt: Date?
    @ObservationIgnored private var chosenToken = 0

    /// A heading tapped in the table of contents is marked at once and stays marked while the page
    /// scrolls to it — until the scroll ends, or a second at most — so those it passes on the way
    /// don't light up in turn.
    func choose(_ index: Int) {
        chosenToken += 1
        let mine = chosenToken
        chosenAt = .now
        chosen = index
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(TocReading.choiceHold))
            guard let self, self.chosenToken == mine else { return }
            self.chosen = nil
        }
    }

    /// The page stopped scrolling: a choice the scroll was taking the reader to has arrived.
    func scrollSettled() {
        guard chosen != nil, let at = chosenAt, Date.now.timeIntervalSince(at) > 0.15 else { return }
        chosenToken += 1
        chosen = nil
    }

    private func update() {
        let p = ReadingProgress.of(storyTop: story.minY, storyHeight: story.height, visibleTop: viewport.top,
                                   visibleHeight: viewport.height)
        if p != progress { progress = p }
        let gone = HeaderContext.shown(headingBottom: titleBottom, visibleTop: viewport.top)
        if gone != titleGone { titleGone = gone }
        let reading = chosen ?? TocReading.current(headings, visibleTop: viewport.top)
        if reading != readingHeading { readingHeading = reading }
    }
}

/// Builds `content` with the meter's progress, so only this view follows the scroll.
private struct Metered<Content: View>: View {
    let meter: ReadingMeter
    @ViewBuilder let content: (CGFloat?, Bool) -> Content

    var body: some View { content(meter.progress, meter.titleGone) }
}

/// The author's region as a small square flag right after the pen name (the web's AuthorRegionFlag):
/// a quiet mark, not a line of its own, its name read out by VoiceOver; nothing without flag art.
private struct AuthorRegionFlag: View {
    let region: String?
    var size: CGFloat = 15

    var body: some View {
        if let region, let code = ProfileRegion.flagCode(region) {
            SquareFlag(code, size: size)
                .accessibilityElement()
                .accessibilityLabel(ProfileRegion.label(region))
        }
    }
}

/// A card's published date with its year in the reader's language (2026年10月10日, Oct 10, 2026),
/// the web's publishedDate.
private func publishedDate(_ card: FeedCard) -> String? {
    card.publishedAt.flatMap(ISO8601.date).map {
        $0.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted, locale: Strings.shared.locale))
    }
}
