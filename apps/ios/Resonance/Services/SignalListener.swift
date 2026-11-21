import FirebaseFirestore
import Foundation
import ResonanceKit

/// Where `signals/{uid}` comes from: Firestore's one listener in the app, a fake in tests.
@MainActor
protocol SignalSource {
    /// Starts listening to `uid`'s signal document; `onChange` gets every read of it (an absent document reads as
    /// all zeros), `onFailure` an error that ended the listener. Returns how to stop.
    func listen(uid: String, onChange: @escaping @MainActor (SignalCounters) -> Void,
                onFailure: @escaping @MainActor () -> Void) -> () -> Void
}

/// The app's: one snapshot listener on `signals/{uid}` (the owner may read it; no client writes it).
struct FirestoreSignalSource: SignalSource {
    func listen(uid: String, onChange: @escaping @MainActor (SignalCounters) -> Void,
                onFailure: @escaping @MainActor () -> Void) -> () -> Void {
        let registration = FirebaseBootstrap.db.collection("signals").document(uid).addSnapshotListener { snap, _ in
            let counters = snap.map { SignalCounters(fields: $0.data()) }
            MainActor.assumeIsolated {
                guard let counters else { return onFailure() }
                onChange(counters)
            }
        }
        return { registration.remove() }
    }
}

/// The signal channel (Phase 2 of the middleware decouple): while signed in, one listener on `signals/{uid}` —
/// with the `/api/v1` paths on, the only business-data listener left — whose counters say which list to pull again.
/// The stores that read through the API subscribe to their topics (`observe`) and pull their GET with
/// `If-None-Match` when one moves; every subscriber is also told every `safetyInterval` while the app is in the
/// foreground (`setForeground`), which catches writes that touch no signal (an older build's straight to Firestore)
/// and a listener that failed (re-attached on the next foreground, as `LiveListeners`).
@MainActor
final class SignalListener {
    /// The foreground safety pull's period.
    static let safetyInterval: Duration = .seconds(60)

    /// The counters as last read (nil before the first read, or with the listener off).
    private(set) var counters: SignalCounters?
    /// The listener reported an error and waits for the next foreground.
    private(set) var failed = false
    /// Whose document is listened to.
    private(set) var uid: String?

    private let source: any SignalSource
    private let interval: Duration
    private var detach: (() -> Void)?
    private var listens = false
    private var subscribers: [Int: (topics: (SignalTopic) -> Bool, pull: @MainActor (Set<SignalTopic>) -> Void)] = [:]
    private var nextToken = 0
    private var ticking: Task<Void, Never>?
    private var foreground = true

    init(source: any SignalSource = FirestoreSignalSource(), interval: Duration = SignalListener.safetyInterval) {
        self.source = source
        self.interval = interval
    }

    /// Signed in as `uid`: the safety pull runs, and with `listens` (`features.signals`) the document is listened to.
    func start(uid: String, listens: Bool) {
        stop()
        self.uid = uid
        self.listens = listens
        attach()
        tick()
    }

    func stop() {
        detach?()
        detach = nil
        ticking?.cancel()
        ticking = nil
        counters = nil
        failed = false
        uid = nil
    }

    /// Tells `pull` about the topics `wanted` says are its own, as they move (and all of them on each safety pull).
    /// The subscription lasts until it is cancelled or released.
    func observe(_ wanted: @escaping (SignalTopic) -> Bool, pull: @escaping @MainActor (Set<SignalTopic>) -> Void) -> SignalSubscription {
        nextToken += 1
        let token = nextToken
        subscribers[token] = (wanted, pull)
        return SignalSubscription { [weak self] in self?.subscribers[token] = nil }
    }

    /// The topics in `topics`.
    func observe(_ topics: Set<SignalTopic>, pull: @escaping @MainActor (Set<SignalTopic>) -> Void) -> SignalSubscription {
        observe({ topics.contains($0) }, pull: pull)
    }

    /// The app came to the foreground (or left it): a failed listener listens again, and the safety pull runs only
    /// while it is in front — at once on the way back.
    func setForeground(_ active: Bool) {
        guard active != foreground else { return }
        foreground = active
        guard uid != nil else { return }
        if active {
            if failed { attach() }
            pullAll()
            tick()
        } else {
            ticking?.cancel()
            ticking = nil
        }
    }

    /// Every subscriber pulls everything it reads (the safety pull, or a retry the screen asked for).
    func pullAll() {
        for subscriber in Array(subscribers.values) { subscriber.pull([]) }
    }

    /// A read of the document arrived.
    func received(_ next: SignalCounters) {
        let moved = next.changes(since: counters)
        counters = next
        guard !moved.isEmpty else { return }
        for subscriber in Array(subscribers.values) {
            let mine = moved.filter(subscriber.topics)
            if !mine.isEmpty { subscriber.pull(mine) }
        }
    }

    private func attach() {
        detach?()
        detach = nil
        failed = false
        guard listens, let uid else { return }
        detach = source.listen(uid: uid, onChange: { [weak self] counters in
            guard let self, self.uid == uid else { return }
            self.received(counters)
        }, onFailure: { [weak self] in
            guard let self, self.uid == uid else { return }
            self.detach?()
            self.detach = nil
            self.failed = true
        })
    }

    private func tick() {
        ticking?.cancel()
        guard foreground else { return }
        let interval = interval
        ticking = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled, let self else { return }
                self.pullAll()
            }
        }
    }
}

/// A store's subscription to signals: gone when cancelled or released.
final class SignalSubscription {
    private var cancelling: (@MainActor () -> Void)?

    init(_ cancel: @escaping @MainActor () -> Void) {
        cancelling = cancel
    }

    @MainActor func cancel() {
        cancelling?()
        cancelling = nil
    }

    deinit {
        guard let cancelling else { return }
        Task { @MainActor in cancelling() }
    }
}
