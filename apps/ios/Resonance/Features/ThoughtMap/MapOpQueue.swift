import Foundation
import ResonanceAPI
import ResonanceKit

/// The thought map's changes on their way to the server (`features.apiThoughtMap`): the web's
/// lib/db/firestore/client/thoughtMap.ts queue, op for op. The canvas draws every change at once (its own state)
/// and hands it here; this only has to get it to the server in the order it was made, without slowing a drag:
///
/// - what is handed over within one frame (`batchDelay`) goes in one batch (a group dragged: it and its cards);
/// - one batch is in flight at a time; what comes meanwhile waits, and a second move of a card, a group or an
///   arrow's words still waiting is folded into the first (only the last place is sent);
/// - a batch the network loses is sent again after a pause (`retries` times, then given up and its callers told,
///   as a failed write was before); one the server refuses is dropped and its callers told;
/// - the map is read again only once every change made here has landed (`flush`), so leaving the map and coming
///   back never shows the board from before the last move.
@MainActor final class MapOpQueue {
    typealias Op = ThoughtMapAPI.Op

    private struct Queued {
        var op: Op
        /// Settle once this op (and so every op before it) is stored.
        var waiters: [CheckedContinuation<Void, Error>] = []
    }

    static let batchDelay: Duration = .milliseconds(16)
    static let retries = 5
    static let retryBase: Duration = .seconds(1)

    private let send: @Sendable ([Op]) async throws -> Void
    private let pause: @Sendable (Duration) async -> Void
    private var queue: [Queued] = []
    /// How many ops at the queue's head were sent once already (a batch to send again: nothing folds into them).
    private var sentHead = 0
    private var inflight = false
    private var timer: Task<Void, Never>?
    private var failures = 0
    private var idle: [CheckedContinuation<Void, Never>] = []
    /// The batches sent, in order (tests).
    private(set) var batchesSent = 0

    init(send: @escaping @Sendable ([Op]) async throws -> Void,
         pause: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }) {
        self.send = send
        self.pause = pause
    }

    convenience init(_ api: ThoughtMapAPI) {
        self.init(send: { _ = try await api.apply($0) })
    }

    /// A change made here is still waiting or on its way (a signal's pull waits for its own touch).
    var busy: Bool { !queue.isEmpty || inflight || timer != nil }

    /// Hands `ops` over (synchronously, in the order of the calls); returns once they are stored, or throws when
    /// they were refused or kept failing.
    func enqueue(_ ops: [Op]) async throws {
        guard !ops.isEmpty else { return }
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            var last = -1
            for op in ops {
                if let at = foldIndex(op) {
                    queue[at].op = Self.fold(queue[at].op, op)
                    last = max(last, at)
                } else {
                    queue.append(Queued(op: op))
                    last = queue.count - 1
                }
            }
            queue[last].waiters.append(done)
            schedule(Self.batchDelay)
        }
    }

    /// Every change handed over so far, stored (or given up).
    func flush() async {
        guard busy else { return }
        if timer != nil, !inflight {
            timer?.cancel()
            timer = nil
            sendNext()
        }
        guard busy else { return }
        await withCheckedContinuation { idle.append($0) }
    }

    // MARK: Folding

    /// What an op is about: a card's node, a group, an arrow.
    nonisolated static func subject(_ op: Op) -> String {
        switch op.op {
        case .addNode, .moveNode, .setNodeGroup, .removeNode: "node:\(op.cardId ?? "")"
        case .addGroup, .updateGroup, .removeGroup: "group:\(op.groupId ?? "")"
        case .addEdge: "edge:\(op.sourceCardId ?? "")_\(op.targetCardId ?? "")"
        case .setEdgeLabel, .removeEdge: "edge:\(op.id ?? "")"
        }
    }

    /// Ops that only move or relabel what is there: one waiting can be folded into a later one of its kind.
    nonisolated static let folds: Set<Op.OpPayload> = [.moveNode, .setNodeGroup, .updateGroup, .setEdgeLabel]

    /// `later` folded into `earlier` (same kind, same subject): the result of applying both.
    nonisolated static func fold(_ earlier: Op, _ later: Op) -> Op {
        var merged = later
        switch later.op {
        case .moveNode:
            // An absent groupId leaves the card's group: the earlier one's still stands.
            merged.groupId = later.groupId ?? earlier.groupId
        case .updateGroup:
            merged.title = later.title ?? earlier.title
            merged.hue = later.hue ?? earlier.hue
            merged.x = later.x ?? earlier.x
            merged.y = later.y ?? earlier.y
            merged.w = later.w ?? earlier.w
            merged.h = later.h ?? earlier.h
        default: break
        }
        return merged
    }

    /// Where `op` folds: the latest waiting op on its subject, when it is of the same kind and only folding ops on
    /// other things lie after it (so folding changes no order that matters). Nil: appended.
    private func foldIndex(_ op: Op) -> Int? {
        guard Self.folds.contains(op.op) else { return nil }
        let about = Self.subject(op)
        var i = queue.count - 1
        while i >= sentHead {
            let q = queue[i].op
            if Self.subject(q) == about { return q.op == op.op ? i : nil }
            if !Self.folds.contains(q.op) { return nil }
            i -= 1
        }
        return nil
    }

    // MARK: Sending

    private func schedule(_ wait: Duration) {
        guard timer == nil, !inflight else { return }
        let pause = pause
        timer = Task { [weak self] in
            await pause(wait)
            guard !Task.isCancelled, let self else { return }
            timer = nil
            sendNext()
        }
    }

    private func settleIdle() {
        guard !busy else { return }
        let waiting = idle
        idle = []
        for w in waiting { w.resume() }
    }

    private func sendNext() {
        guard !inflight else { return }
        guard !queue.isEmpty else { return settleIdle() }
        let batch = Array(queue.prefix(ThoughtMapAPI.opsPerBatch))
        queue.removeFirst(batch.count)
        sentHead = max(0, sentHead - batch.count)
        inflight = true
        batchesSent += 1
        let send = send
        // Held until it lands (every waiter is answered, even should the map's path change meanwhile).
        Task {
            do {
                try await send(batch.map(\.op))
                inflight = false
                failures = 0
                for q in batch { for w in q.waiters { w.resume() } }
            } catch {
                inflight = false
                if APIFailure.isRetryable(error), failures < Self.retries {
                    // Back at the head, as it was (nothing that came since folds into it: order stays).
                    failures += 1
                    queue = batch + queue
                    sentHead = batch.count
                    schedule(Self.retryBase * (1 << (failures - 1)))
                    return
                }
                failures = 0
                for q in batch { for w in q.waiters { w.resume(throwing: error) } }
            }
            // What came meanwhile goes at once (it waited a frame already).
            if queue.isEmpty { settleIdle() } else { sendNext() }
        }
    }
}
