import CryptoKit
import Foundation
import Observation
import ResonanceKit

/// Asking for notifications in context (docs/specs/notification-asks.md): never at signup — a new
/// account doesn't yet know what the switches mean — but at the moment the reason is plain, our
/// own words first and the system's question after them.
///
/// - **The reply ask** (§2): after a note or a message has gone (`reply`), or a card was published
///   (`publish`), while the system was never asked: a small dialog the shell draws over the tabs once
///   whatever triggered it has closed (``MainTabView``), 先不要 · 開啟通知. 開啟通知 puts the
///   system's question; 先不要 (or closing it) asks nothing, and the ask comes back at the next such
///   moment only after ``Rules/snooze`` — never after ``Rules/maxDeclines`` of them.
/// - **The invites** (§3, §4): a card above the home feed offering tonight's card to someone who has
///   opened ``Rules/opensForPicks`` card pages here, and one atop the conversations offering a
///   connection's new cards to someone connected — each while its switch is off, the system hasn't
///   said no, and it wasn't answered here. 好，通知我 asks the system (when never asked) and turns
///   the switch on; 不用了 puts it away for good.
///
/// 先不要 is remembered for the install (the system's permission is the install's); card pages opened
/// and invites answered live in the account's local preferences on this install (``Book``), cleared
/// with the rest of the account's local data at sign-out or a switch of account.
@MainActor @Observable
final class NotificationAsks {
    typealias Settings = NotificationSettingsAPI.Settings

    /// What the person just did that a reply could answer.
    enum Moment: String, Equatable, Sendable {
        /// A note or a message went.
        case reply
        /// A card was published.
        case publish
    }

    /// An invite card and the switch it turns on.
    enum Invite: String, CaseIterable, Codable, Sendable {
        /// Above the home feed: tonight's card.
        case picks
        /// Atop the conversations: a connection's new cards.
        case connectionCards

        var switchName: NotificationSettingsAPI.Switch {
            switch self {
            case .picks: .picks
            case .connectionCards: .connectionCards
            }
        }
    }

    /// What this install remembers: the reply ask's 先不要s for the install (the system's permission
    /// is the install's, whoever signs in), card pages opened and invites answered for the account.
    struct Memory: Codable, Equatable, Sendable {
        /// How many times the reply ask was put away (先不要, or closed) on this install.
        var declines = 0
        /// When it last was.
        var declinedAt: Date?
        /// Card pages this account opened here.
        var cardOpens = 0
        /// Invites this account answered here (either button, or the switch turned on through it).
        var answered: Set<Invite> = []
    }

    /// The decisions, without the world (the tests' subject).
    enum Rules {
        /// How long 先不要 keeps the reply ask away.
        static let snooze: TimeInterval = 3 * 24 * 60 * 60
        /// After this many 先不要s it never comes back.
        static let maxDeclines = 3
        /// Card pages opened before tonight's card is offered.
        static let opensForPicks = 5

        /// Whether reaching someone now shows the reply ask: only while the system was never asked
        /// (allowed or refused, Settings → 通知 says the rest), and not while 先不要 still stands.
        static func asks(permission: PushCenter.Permission, mayAsk: Bool, memory: Memory, now: Date) -> Bool {
            guard mayAsk, permission == .undetermined, memory.declines < maxDeclines else { return false }
            guard let last = memory.declinedAt else { return true }
            return now.timeIntervalSince(last) >= snooze
        }

        /// Whether an invite card shows: its reason holds (`opens` card pages for tonight's card, a
        /// connection for theirs), its switch is known to be off, the system hasn't said no (nor is
        /// still unread), and it wasn't answered here.
        static func invites(_ invite: Invite, memory: Memory, settings: Settings?, permission: PushCenter.Permission?,
                            connected: Bool, mayAsk: Bool) -> Bool {
            guard mayAsk, !memory.answered.contains(invite), let settings, !settings[invite.switchName],
                  let permission, permission != .denied else { return false }
            switch invite {
            case .picks: return memory.cardOpens >= opensForPicks
            case .connectionCards: return connected
            }
        }
    }

    /// The memory, kept in the standard defaults: the 先不要s under one install-wide key, never cleared
    /// with an account; the rest per account, by a digest of its uid (never the uid), only the
    /// signed-in account's kept (``retainOnly(_:)``).
    struct Book {
        let defaults: UserDefaults
        static let key = "notificationAsks"
        static let installKey = "notificationAskDeclines"

        private struct Declines: Codable {
            var count = 0
            var at: Date?
        }

        func memory(_ uid: String?) -> Memory {
            var memory = uid.flatMap { entries[Self.name($0)] }.flatMap { try? JSONDecoder().decode(Memory.self, from: $0) } ?? Memory()
            let declines = defaults.data(forKey: Self.installKey).flatMap { try? JSONDecoder().decode(Declines.self, from: $0) } ?? Declines()
            memory.declines = declines.count
            memory.declinedAt = declines.at
            return memory
        }

        func save(_ memory: Memory, uid: String?) {
            defaults.set(try? JSONEncoder().encode(Declines(count: memory.declines, at: memory.declinedAt)), forKey: Self.installKey)
            guard let uid else { return }
            var account = memory
            account.declines = 0
            account.declinedAt = nil
            var all = entries
            all[Self.name(uid)] = try? JSONEncoder().encode(account)
            defaults.set(all, forKey: Self.key)
        }

        /// Only `uid`'s account memory is kept from now on (nil: no one's); the install's stays.
        func retainOnly(_ uid: String?) {
            let keep = uid.map(Self.name)
            let kept = entries.filter { $0.key == keep }
            if kept.isEmpty { defaults.removeObject(forKey: Self.key) } else { defaults.set(kept, forKey: Self.key) }
        }

        private var entries: [String: Data] { defaults.dictionary(forKey: Self.key) as? [String: Data] ?? [:] }

        static func name(_ uid: String) -> String {
            SHA256.hash(data: Data(uid.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined()
        }
    }

    /// The reply ask waiting for the shell to show it (never two at once).
    private(set) var pending: Moment?
    /// The reply ask on show.
    private(set) var showing: Moment?
    /// The switches as read this session (once, when an invite's reason first holds), or as since set.
    private(set) var settings: Settings?
    /// What the system said last (nil until read).
    private(set) var permission: PushCenter.Permission?
    private(set) var memory = Memory()
    /// An invite's 好，通知我 on its way.
    private(set) var working: Invite?
    /// Invites gone for this session without being remembered (the system said no to them).
    private(set) var hidden: Set<Invite> = []

    @ObservationIgnored private var uid: String?
    @ObservationIgnored private var reading = false
    @ObservationIgnored private let book: Book
    @ObservationIgnored private let systemPermission: () async -> PushCenter.Permission
    @ObservationIgnored private let ask: () async -> Bool
    @ObservationIgnored private let fetch: () async throws -> Settings
    @ObservationIgnored private let save: (NotificationSettingsAPI.Switch, Bool) async throws -> Settings
    @ObservationIgnored private let mayAsk: Bool
    @ObservationIgnored private let now: () -> Date
    /// The shell's toast: a message, and 打開設定 when it offers the system's settings.
    @ObservationIgnored var tell: (String, _ offersSettings: Bool) -> Void = { _, _ in }

    init(book: Book = Book(defaults: .standard),
         permission: @escaping () async -> PushCenter.Permission,
         ask: @escaping () async -> Bool,
         fetch: @escaping () async throws -> Settings,
         save: @escaping (NotificationSettingsAPI.Switch, Bool) async throws -> Settings,
         mayAsk: Bool = PushCenter.mayAsk,
         now: @escaping () -> Date = { Date() }) {
        self.book = book
        systemPermission = permission
        self.ask = ask
        self.fetch = fetch
        self.save = save
        self.mayAsk = mayAsk
        self.now = now
    }

    // MARK: The account

    /// The account signed in now (nil: none): its memory is read, every other account's goes, and
    /// what this session knew is forgotten.
    func use(account uid: String?) {
        book.retainOnly(uid)
        guard uid != self.uid else { return }
        self.uid = uid
        memory = book.memory(uid)
        pending = nil
        showing = nil
        settings = nil
        working = nil
        hidden = []
    }

    private func remember(_ change: (inout Memory) -> Void) {
        change(&memory)
        book.save(memory, uid: uid)
    }

    // MARK: The reply ask

    /// A note or a message went, or a card was published: the ask waits for the shell, when it shows.
    func reachedOut(_ moment: Moment) async {
        guard uid != nil, pending == nil, showing == nil, mayAsk else { return }
        let permission = await systemPermission()
        self.permission = permission
        guard pending == nil, showing == nil,
              Rules.asks(permission: permission, mayAsk: mayAsk, memory: memory, now: now()) else { return }
        pending = moment
    }

    /// The shell shows the waiting ask now.
    func present() {
        guard let pending, showing == nil else { return }
        showing = pending
        self.pending = nil
    }

    /// 開啟通知: the dialog goes and the system's question comes (a yes registers this install).
    func turnOn() async {
        guard showing != nil else { return }
        showing = nil
        _ = await ask()
        permission = await systemPermission()
    }

    /// 先不要, or the dialog closed beside it: nothing asked, and remembered.
    func putAway() {
        guard showing != nil else { return }
        showing = nil
        remember {
            $0.declines += 1
            $0.declinedAt = now()
        }
    }

    // MARK: The invites

    /// A card page opened (any card): counted toward tonight's card's invite.
    func cardOpened() {
        guard uid != nil else { return }
        remember { $0.cardOpens += 1 }
        if memory.cardOpens >= Rules.opensForPicks { Task { await read() } }
    }

    /// Reads what an invite needs: the system's word (each time — it may have changed in Settings),
    /// and the switches once a session, once an invite's reason holds (`connected` for theirs).
    func refresh(connected: Bool = false) async {
        guard uid != nil else { return }
        permission = await systemPermission()
        let wanted = memory.cardOpens >= Rules.opensForPicks || connected
        if wanted { await read() }
    }

    private func read() async {
        guard settings == nil, !reading, uid != nil else { return }
        reading = true
        defer { reading = false }
        let account = uid
        if permission == nil { permission = await systemPermission() }
        // A failed read shows nothing, and is tried again at the next chance.
        guard let read = try? await fetch(), account == uid else { return }
        settings = read
    }

    /// Whether `invite` shows now (`connected`: the account has someone, for the connections' one).
    func shows(_ invite: Invite, connected: Bool = false) -> Bool {
        guard !hidden.contains(invite) else { return false }
        #if DEBUG
        if debugInvites.contains(invite) { return !memory.answered.contains(invite) }
        #endif
        return Rules.invites(invite, memory: memory, settings: settings, permission: permission, connected: connected, mayAsk: mayAsk)
    }

    /// The switches as Settings → 通知 just saved them: an invite follows.
    func settingsChanged(_ settings: Settings) {
        guard uid != nil else { return }
        self.settings = settings
    }

    /// 不用了: gone for good, on this install, for this account.
    func decline(_ invite: Invite) {
        remember { $0.answered.insert(invite) }
    }

    /// 好，通知我: the system's question when never asked; on a yes (or allowed already) the switch
    /// goes on and the card goes, said in the toast. A no from the system: the card goes, nothing
    /// saved, and the toast offers the system's settings. A failed save: the card stays, said.
    func accept(_ invite: Invite) async {
        guard working == nil else { return }
        working = invite
        defer { working = nil }
        let allowed = await ask()
        permission = await systemPermission()
        guard allowed else {
            hidden.insert(invite)
            tell(L10n.NotifyAsk.systemOff, true)
            return
        }
        do {
            settings = try await save(invite.switchName, true)
            remember { $0.answered.insert(invite) }
            // What was turned on, in so many words.
            tell(invite == .picks ? L10n.NotifyAsk.picksOn : L10n.NotifyAsk.connectionCardsOn, false)
        } catch {
            tell(L10n.Settings.Notifications.saveError, false)
        }
    }

    #if DEBUG
    /// `-notifyAsk reply|publish` (screen checks): the ask waits for the shell at launch, whatever
    /// the system said; `-notifyInvite picks|connectionCards|all`: those invites show, whatever their reasons.
    func debugLaunch() {
        // Once a launch: the tab view comes again (a language change) and must not put it up again.
        guard !Self.launched else { return }
        Self.launched = true
        let defaults = UserDefaults.standard
        if let moment = defaults.string(forKey: "notifyAsk").flatMap(Moment.init(rawValue:)) { pending = moment }
        guard let invite = defaults.string(forKey: "notifyInvite") else { return }
        debugInvites = invite == "all" ? Set(Invite.allCases) : Set([Invite(rawValue: invite)].compactMap { $0 })
    }

    private static var launched = false

    /// Invites forced on by `-notifyInvite`.
    private(set) var debugInvites: Set<Invite> = []
    #endif
}
