import DesignSystem
import ResonanceKit
import SwiftUI

/// A person's page (u/[handle]/page.tsx): avatar, name, bio, region · cards ·
/// joined · connected; then their public cards and the cards linking to theirs.
struct AuthorScreen: View {
    let handle: String
    @Environment(SessionStore.self) private var session
    @Environment(WriteLauncher.self) private var writer
    @Environment(\.openRoute) private var openRoute
    @State private var model: ProfileModel?
    @State private var scrolled = false
    @State private var unblocking = false
    /// The person comes up into the bar once their name on the page has scrolled under it, as a card's
    /// author does once its byline has: beside the arrow on a phone, on a tablet header's centre line.
    @Environment(\.headerChrome) private var headerChrome
    @State private var nameBottom: CGFloat?
    @State private var nameGone = false
    private static let pageSpace = "profile.page"

    var body: some View {
        ScrollView {
            Group {
            switch model?.phase ?? .loading {
            case .loading:
                ProfileSkeleton()
            case .notFound:
                OrganicEmptyState(title: L10n.Profile.notFound, actionTitle: L10n.Profile.backHome, actionStyle: .link) {
                    openRoute.dismissToRoot()
                }
            case .failed:
                OrganicEmptyState(message: L10n.Native.loadError, actionTitle: L10n.Native.retry, actionStyle: .outline) {
                    Task { await model?.load() }
                }
            case .loaded:
                if let model, let profile = model.profile { page(model, profile) }
            }
            }
            .coordinateSpace(.named(Self.pageSpace))
        }
        .onHeaderScroll($scrolled)
        .onScrollGeometryChange(for: Bool.self) { geo in
            HeaderContext.shown(headingBottom: nameBottom, visibleTop: geo.contentOffset.y + geo.contentInsets.top)
        } action: { _, gone in
            withAnimation(.easeOut(duration: 0.2)) { nameGone = gone }
        }
        .scrollIndicators(.hidden)
        .background(Tokens.cream)
        .safeAreaInset(edge: .top, spacing: 0) {
            OrganicInlineBar("", backLabel: L10n.App.Nav.back, scrolled: scrolled) {
                if let profile = model?.profile, model?.phase == .loaded, nameGone {
                    BarPerson(author: profile.author, centred: headerChrome != nil)
                        .transition(.opacity.combined(with: .offset(y: 8)))
                }
            } trailing: {
                // Their page's link, straight to the system's sheet (nothing to choose between): before the
                // ⋯, or alone on your own page; not while you have them blocked.
                if let profile = model?.profile, !profile.isBlocked {
                    let handle = profile.author.handle
                    ShareLink(item: ShareLinks.profileURL(handle: handle, origin: session.config.origin),
                              preview: SharePreview(L10n.Profile.shareTitle(handle: handle))) {
                        OrganicChipFace(.share, seed: Double(seedFromString(profile.author.id)) + 5, trigger: .bare)
                    }
                    .buttonStyle(OrganicPressStyle())
                    .accessibilityLabel(L10n.Share.profile)
                }
                if let profile = model?.profile, !profile.isSelf {
                    SafetyMenu(target: .user(id: profile.author.id), handle: profile.author.handle, isBlocked: profile.isBlocked,
                               seed: Double(seedFromString(profile.author.id)), triggerSize: 36) {
                        Task { await model?.load() }
                    }
                }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            if model == nil { model = ProfileModel(handle: handle, api: session.reading) }
            if let model, model.profile == nil { await model.load() }
        }
        // Connected to them, or no longer (a resonance, a take-back — from anywhere): the way into the
        // conversation and their cards for connections only are asked again, the page kept meanwhile.
        .onChange(of: session.connectionsMoved) { _, moved in
            guard let model, moved.concerns(model.profile?.author.id) else { return }
            Task { await model.revalidate() }
        }
    }

    private func page(_ model: ProfileModel, _ profile: Profile) -> some View {
        let author = profile.author
        return VStack(spacing: 0) {
            VStack(spacing: 14) {
                HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                                color: author.accent, size: 96, seed: author.avatarSeedValue)
                    // The avatar → the pen name: 16 (`--people-name-gap`, round 9 §9).
                    .padding(.bottom, Tokens.peopleNameGap - 14)
                Text(author.handle)
                    .font(AppFonts.heading(32))
                    .foregroundStyle(Tokens.text)
                    .accessibilityAddTraits(.isHeader)
                    .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.pageSpace)).maxY } action: { nameBottom = $0 }
                Text(profile.bio ?? L10n.Profile.bioEmpty)
                    .font(AppFonts.body(15))
                    .foregroundStyle(profile.bio == nil ? Tokens.textMuted.opacity(0.8) : Tokens.textMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(15 * 0.6)
                meta(profile, author: author)
                if !profile.isBlocked, profile.isSelf {
                    OrganicButton(L10n.Profile.editProfile, variant: .tonal) { openRoute(.settings) }
                } else if !profile.isBlocked, profile.isConnected {
                    // Connected: a way into the conversation (the web's small ghost button with the chat glyph).
                    OrganicButton(L10n.Messages.messageLink, icon: .chat, variant: .tonal, size: .sm) {
                        openRoute(.thread(handle: author.handle, uid: author.id, note: nil))
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 24)
            // The people head (round 9 §9): the avatar 40 / 56 under the bar's pen line.
            .peopleHeadGap()
            .padding(.bottom, 36)
            .readableColumn()

            if profile.isBlocked {
                blockedNotice(author)
            } else if !model.cards.isEmpty || profile.isSelf {
                heading(L10n.Profile.publishedHeading)
                if model.cards.isEmpty {
                    // The owner's empty page teaches rather than apologizes (the shared empty state, design §1).
                    OrganicEmptyState(title: L10n.Profile.emptyPublishedSelf, actionTitle: L10n.Profile.emptyPublishedCta,
                                      icon: .cards, seed: 71) { writer.open() }
                } else {
                    StoryCardList(cards: model.cards) { Task { await model.loadMore() } }
                }
            }
            if !model.linked.isEmpty {
                heading(L10n.Profile.linkedCards).padding(.top, 48)
                MiniCardList(cards: model.linked)
            }
            Color.clear.frame(height: 48)
        }
    }

    /// BlockedNotice: in place of their cards, with the way back.
    private func blockedNotice(_ author: Author) -> some View {
        VStack(spacing: 8) {
            Text(L10n.Safety.blockedNotice(handle: author.handle)).font(AppFonts.heading(20)).foregroundStyle(Tokens.text)
            Text(L10n.Safety.blockedNoticeBody).font(AppFonts.body(14.5)).foregroundStyle(Tokens.textMuted)
                .padding(.bottom, 8)
            OrganicButton(L10n.Safety.unblock, variant: .tonal, size: .sm) {
                Task { await unblock(author.id) }
            }
            .loading(unblocking)
            .workingLabel(L10n.Safety.unblockShort)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 24)
    }

    private func unblock(_ id: String) async {
        guard !unblocking else { return }
        unblocking = true
        defer { unblocking = false }
        do {
            try await session.safety?.unblock(id)
        } catch {
            // Still blocked: the notice stays, and the toast says it didn't go through (round 21).
            session.toasts.show(L10n.Safety.unblockFailed)
            return
        }
        await model?.load()
    }

    /// The web's section heading: Playfair 20, set tight, on the left — where the cards under it start.
    private func heading(_ title: String) -> some View {
        Text(title)
            .font(AppFonts.heading(20))
            .tracking(-0.01 * 20)
            .foregroundStyle(Tokens.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardListHeaderInset()
            .padding(.bottom, 24)
            .accessibilityAddTraits(.isHeader)
    }

    private func meta(_ profile: Profile, author: Author) -> some View {
        let joined = ISO8601.date(profile.joinedAt).map {
            // The web's joined date: year and the month in full ("August 2026", "2026年8月").
            $0.formatted(.dateTime.year().month(.wide).locale(Strings.shared.locale))
        } ?? ""
        // page.module.css .meta: centred, gap 6px 14px.
        return FlowRow(spacing: 14, lineSpacing: 6, alignment: .center) {
            if let region = author.region {
                // page.module.css .metaItem: the SquareFlag, 5 before the name.
                HStack(spacing: 5) {
                    SquareFlag(region, size: 16)
                    Text(Self.regionLabel(region))
                }
                .metaStyle()
            }
            Label { Text(L10n.Profile.cardCount(count: profile.cardCount)) } icon: { OrganicIcon(.cards, size: 16, strokeWidth: Tokens.ink) }.metaStyle()
            Text(L10n.Profile.joined(date: joined)).metaStyle()
            if !profile.isSelf && profile.isConnected {
                OrganicIcon(.userCheck, size: 20, color: Tokens.terracotta)
                    .accessibilityLabel(L10n.Profile.connected)
            }
        }
    }

    /// "TW" → "台灣" in the reader's language (its SquareFlag is drawn beside it); free text stays as it is.
    static func regionLabel(_ region: String) -> String { ProfileRegion.label(region) }
}

/// The person in the bar once their name on the page has gone up under it (the card page's author in
/// its bar): their avatar small and the pen name, one line, truncated — a phone's beside the arrow in the
/// bar's 15 semibold, a tablet's on the header's centre line in its context title's face.
private struct BarPerson: View {
    let author: Author
    let centred: Bool

    var body: some View {
        HStack(spacing: centred ? 10 : 8) {
            HandDrawnAvatar(initials: author.initials, imageURL: author.avatarUrl.flatMap(URL.init(string:)),
                            color: author.accent, size: 28, seed: author.avatarSeedValue)
            Text(author.handle)
                .font(centred ? HeaderContextTitle.font : AppFonts.body(15, weight: .semibold))
                .foregroundStyle(Tokens.text)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(author.handle)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The profile's loading state: the hero's avatar, name, bio and meta as
/// blocks, then four loading cards (u/[handle]/page.tsx).
private struct ProfileSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 14) {
                SkeletonBlock(width: 96, circle: true)
                    .padding(.bottom, Tokens.peopleNameGap - 14)
                SkeletonBlock(width: 220, height: 34, radius: 10)
                SkeletonBlock(fraction: 0.8, height: 16, alignment: .center)
                SkeletonBlock(fraction: 0.6, height: 16, alignment: .center)
                SkeletonBlock(fraction: 0.7, height: 13, alignment: .center)
            }
            // The blocks are centred like the hero they stand in for.
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            // Where the page's avatar will stand (round 9 §9): nothing moves as it loads.
            .peopleHeadGap()
            .padding(.bottom, 36)
            .readableColumn()
            FeedSkeleton(count: 4)
        }
        .skeletonTimeline()
    }
}

private extension View {
    func metaStyle() -> some View {
        font(AppFonts.body(13)).foregroundStyle(Tokens.textMuted)
    }
}
