import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Asking for notifications in context (docs/specs/notification-asks.md): the reply ask after reaching
/// someone — only while the system was never asked, away for 3 days after 先不要 and for good after
/// three — and the two invites, each shown only while its reason holds, its switch is off, the
/// system hasn't said no and it wasn't answered here; what each button writes.
@MainActor @Suite struct NotificationAsksTests {
    typealias Settings = NotificationSettingsAPI.Settings

    @MainActor final class World {
        var permission: PushCenter.Permission = .undetermined
        var answersYes = true
        var asked = 0
        var reads = 0
        var stored = Settings(picks: false, connectionCards: false)
        var saveFails = false
        var saves: [String] = []
        var now = Date(timeIntervalSince1970: 1_800_000_000)
        var told: [(String, Bool)] = []
        let defaults: UserDefaults

        init() {
            let suite = "NotificationAsksTests.\(UUID().uuidString)"
            defaults = UserDefaults(suiteName: suite)!
            defaults.removePersistentDomain(forName: suite)
        }

        func ask() -> Bool {
            guard permission == .undetermined else { return permission == .allowed }
            asked += 1
            permission = answersYes ? .allowed : .denied
            return answersYes
        }

        func save(_ name: NotificationSettingsAPI.Switch, _ on: Bool) throws -> Settings {
            saves.append("\(name.rawValue)=\(on)")
            if saveFails { throw APIFailure.unexpected(status: 500) }
            stored[name] = on
            return stored
        }
    }

    func asks(_ world: World, uid: String? = "alice", mayAsk: Bool = true) -> NotificationAsks {
        let asks = NotificationAsks(book: .init(defaults: world.defaults), permission: { world.permission }, ask: { world.ask() },
                                    fetch: {
                                        world.reads += 1
                                        return world.stored
                                    },
                                    save: { try world.save($0, $1) }, mayAsk: mayAsk, now: { world.now })
        asks.tell = { world.told.append(($0, $1)) }
        asks.use(account: uid)
        return asks
    }

    // MARK: The reply ask

    @Test func theAskWaitsForTheShellOnlyWhileTheSystemWasNeverAsked() async {
        let world = World()
        let asks = asks(world)
        await asks.reachedOut(.reply)
        #expect(asks.pending == .reply && asks.showing == nil)
        // Never twice at once: a second reaching-out meanwhile changes nothing.
        await asks.reachedOut(.publish)
        #expect(asks.pending == .reply)
        asks.present()
        #expect(asks.showing == .reply && asks.pending == nil)
        await asks.reachedOut(.publish)
        #expect(asks.pending == nil)

        for answered in [PushCenter.Permission.allowed, .denied] {
            let world = World()
            world.permission = answered
            let asks = self.asks(world)
            await asks.reachedOut(.publish)
            #expect(asks.pending == nil)
        }
        // The debug flows' `-askForNotifications NO`, and no one signed in.
        let quiet = self.asks(World(), mayAsk: false)
        await quiet.reachedOut(.reply)
        #expect(quiet.pending == nil)
        let signedOut = self.asks(World(), uid: nil)
        await signedOut.reachedOut(.reply)
        #expect(signedOut.pending == nil)
    }

    @Test func turningOnPutsTheSystemsQuestionAndRemembersNoRefusal() async {
        let world = World()
        let asks = asks(world)
        await asks.reachedOut(.publish)
        asks.present()
        await asks.turnOn()
        #expect(asks.showing == nil && world.asked == 1 && world.permission == .allowed)
        #expect(asks.memory.declines == 0)
        // Answered: never again.
        await asks.reachedOut(.reply)
        #expect(asks.pending == nil)
    }

    @Test func notNowKeepsItAwayThreeDaysAndThreeTimesForGood() async {
        let world = World()
        let asks = asks(world)
        for round in 1...3 {
            await asks.reachedOut(.reply)
            #expect(asks.pending == .reply, "round \(round)")
            asks.present()
            asks.putAway()
            #expect(asks.showing == nil && asks.memory.declines == round)
            #expect(world.asked == 0)
            // Two days on: still away.
            world.now += 2 * 24 * 60 * 60
            await asks.reachedOut(.reply)
            #expect(asks.pending == nil)
            // Three days after the 先不要: back.
            world.now += 24 * 60 * 60
        }
        // A third 先不要 was the last: never again, however long.
        world.now += 365 * 24 * 60 * 60
        await asks.reachedOut(.reply)
        #expect(asks.pending == nil)
        // Remembered on this install for the account: a new run reads it.
        #expect(self.asks(world).memory.declines == 3)
    }

    @Test func notNowIsTheInstallsAnswerWhoeverSignsIn() async {
        let world = World()
        let asks = asks(world)
        await asks.reachedOut(.reply)
        asks.present()
        asks.putAway()
        // Signed out and someone else in: the system's permission is the install's, and so is the 先不要.
        asks.use(account: nil)
        asks.use(account: "bob")
        #expect(asks.memory.declines == 1)
        await asks.reachedOut(.reply)
        #expect(asks.pending == nil)
        // While card pages and invites are each account's own.
        asks.cardOpened()
        asks.use(account: "alice")
        #expect(asks.memory.cardOpens == 0 && asks.memory.declines == 1)
    }

    @Test func theRulesAlone() {
        var memory = NotificationAsks.Memory()
        let now = Date()
        typealias Rules = NotificationAsks.Rules
        #expect(Rules.asks(permission: .undetermined, mayAsk: true, memory: memory, now: now))
        memory.declines = 1
        memory.declinedAt = now.addingTimeInterval(-Rules.snooze + 1)
        #expect(!Rules.asks(permission: .undetermined, mayAsk: true, memory: memory, now: now))
        memory.declinedAt = now.addingTimeInterval(-Rules.snooze)
        #expect(Rules.asks(permission: .undetermined, mayAsk: true, memory: memory, now: now))
        memory.declines = Rules.maxDeclines
        #expect(!Rules.asks(permission: .undetermined, mayAsk: true, memory: memory, now: now))
    }

    // MARK: Tonight's card's invite

    @Test func tonightsCardIsOfferedAfterFiveCardPagesOnceItsSwitchIsKnownOff() async {
        let world = World()
        let asks = asks(world)
        for _ in 1...4 { asks.cardOpened() }
        await asks.refresh()
        // Four pages: not yet, and the switches weren't read for it.
        #expect(!asks.shows(.picks) && world.reads == 0)
        asks.cardOpened()
        await asks.refresh()
        #expect(asks.shows(.picks))
        // Read once a session, however often the feed comes back.
        await asks.refresh()
        await asks.refresh()
        #expect(world.reads == 1)
        // Never the connections' one without a connection.
        #expect(!asks.shows(.connectionCards))
    }

    @Test func noInviteWhileItsSwitchIsOnOrTheSystemSaidNo() async {
        let world = World()
        world.stored = Settings(picks: true, connectionCards: false)
        let on = asks(world)
        for _ in 1...5 { on.cardOpened() }
        await on.refresh()
        #expect(!on.shows(.picks))

        let denied = World()
        denied.permission = .denied
        let asks = asks(denied)
        for _ in 1...5 { asks.cardOpened() }
        await asks.refresh()
        #expect(!asks.shows(.picks))
        // Turned on in the system's settings meanwhile: back from there, it shows.
        denied.permission = .allowed
        await asks.refresh()
        #expect(asks.shows(.picks))
    }

    @Test func noThanksPutsItAwayForGoodForThisAccount() async {
        let world = World()
        let asks = asks(world)
        for _ in 1...5 { asks.cardOpened() }
        await asks.refresh()
        asks.decline(.picks)
        #expect(!asks.shows(.picks) && world.saves.isEmpty)
        // Another run: still answered.
        let again = self.asks(world)
        await again.refresh()
        #expect(again.memory.cardOpens == 5 && !again.shows(.picks))
        // Another account on this install starts afresh, and the first one's memory goes (signed out).
        let bob = self.asks(world, uid: "bob")
        #expect(bob.memory == NotificationAsks.Memory())
        #expect(self.asks(world).memory == NotificationAsks.Memory())
    }

    @Test func yesAsksTheSystemThenTurnsTheSwitchOn() async {
        let world = World()
        let asks = asks(world)
        for _ in 1...5 { asks.cardOpened() }
        await asks.refresh()
        await asks.accept(.picks)
        #expect(world.asked == 1 && world.saves == ["picks=true"])
        #expect(!asks.shows(.picks) && asks.memory.answered == [.picks])
        #expect(world.told.map(\.0) == [L10n.NotifyAsk.picksOn] && world.told.map(\.1) == [false])
    }

    @Test func yesWithNotificationsAllowedAlreadyOnlySaves() async {
        let world = World()
        world.permission = .allowed
        let asks = asks(world)
        await asks.refresh(connected: true)
        #expect(asks.shows(.connectionCards, connected: true))
        #expect(!asks.shows(.connectionCards, connected: false))
        await asks.accept(.connectionCards)
        #expect(world.asked == 0 && world.saves == ["connectionCards=true"])
        #expect(world.told.map(\.0) == [L10n.NotifyAsk.connectionCardsOn])
        #expect(!asks.shows(.connectionCards, connected: true))
    }

    @Test func aNoFromTheSystemTakesTheCardAwaySavingNothing() async {
        let world = World()
        world.answersYes = false
        let asks = asks(world)
        for _ in 1...5 { asks.cardOpened() }
        await asks.refresh()
        await asks.accept(.picks)
        #expect(world.saves.isEmpty && !asks.shows(.picks))
        #expect(asks.memory.answered.isEmpty)
        #expect(world.told.map(\.0) == [L10n.NotifyAsk.systemOff] && world.told.map(\.1) == [true])
    }

    @Test func aFailedSaveLeavesTheCardAndSaysSo() async {
        let world = World()
        world.permission = .allowed
        world.saveFails = true
        let asks = asks(world)
        for _ in 1...5 { asks.cardOpened() }
        await asks.refresh()
        await asks.accept(.picks)
        #expect(asks.shows(.picks) && asks.working == nil)
        #expect(world.told.map(\.0) == [L10n.Settings.Notifications.saveError])
    }

    @Test func aSwitchTurnedOnInSettingsTakesItsInviteAway() async {
        let world = World()
        let asks = asks(world)
        await asks.refresh(connected: true)
        #expect(asks.shows(.connectionCards, connected: true))
        asks.settingsChanged(Settings(picks: false, connectionCards: true))
        #expect(!asks.shows(.connectionCards, connected: true))
    }
}
