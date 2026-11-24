import Observation

/// Whether the reader has answered a card already — their resonance to it, a draft or published —
/// as 用卡片回應 under the story needs to know before it begins one (a second resonance must not
/// be begun by accident). A lookup that fails — or hangs, which is a failure once `patience` has
/// run out — is tried again by itself, a little later, and then on the reader's press.
///
/// Round 35 §4 (the owner: 「这个用卡片回應的这个按钮，有时候进到页面都会一直在 loading」): the segment is live from
/// the first frame and never inks for this lookup, which runs in the background (on a simulator Firestore's channel
/// can stall without failing); when it answers, the segment becomes 已回應 / 修改. A press before an answer asks right
/// then (``askOnTap(_:)``, the segment inking only meanwhile, for ``askPatience`` at most) and goes where the answer
/// says: the picker, the card or the writer.
@MainActor @Observable
final class ResonanceLookup {
    enum State: Equatable {
        /// Not answered yet: the segment is there to press, which asks (``askOnTap(_:)``).
        case looking
        /// Answered: the reader's resonance, or none.
        case found(DraftService.Resonance?)
        /// It couldn't be asked (after its retries): the button is there to tap, which asks again.
        case failed
    }

    typealias Find = @MainActor () async throws -> DraftService.Resonance?

    /// What a press learnt by asking (``askOnTap(_:)``).
    enum Asked: Equatable {
        /// The reader hasn't answered the card: the picker opens.
        case unanswered
        /// Their resonance to it: the card (published) or the writer (a draft) opens — never a second one begun.
        case answered(DraftService.Resonance)
        /// Not known (failed, ran out of patience, or a press already asking): nothing opens.
        case unknown
    }

    private(set) var state: State = .looking
    /// A tap's own lookup is on its way (the button inks while it is).
    private(set) var asking = false
    /// A tap's lookup failed too: a quiet line says so (the button stays, to try again).
    private(set) var tapFailed = false
    /// The pauses before each retry of a failed lookup.
    @ObservationIgnored private let retries: [Duration]
    /// How long one read may take before it counts as failed.
    @ObservationIgnored private let patience: Duration
    /// How long a press's own read may take (the segment inks meanwhile): the spec's 6 s.
    @ObservationIgnored let askPatience: Duration
    /// Each press's answer bumps this: a background lookup that fails after a press was answered keeps that answer.
    @ObservationIgnored private var pressAnswers = 0

    init(retries: [Duration] = [.seconds(1), .seconds(3)], patience: Duration = .seconds(8),
         askPatience: Duration = .seconds(6)) {
        self.retries = retries
        self.patience = patience
        self.askPatience = askPatience
    }

    /// Whether 用卡片回應 inks now: only while a press asks — never for the background lookup.
    var inks: Bool { asking }

    /// Whether a press opens the picker at once: it is known the reader hasn't answered the card. Otherwise
    /// (still looking, or the lookup failed) the press asks first (``askOnTap(_:)``).
    var pressOpensPicker: Bool { state == .found(nil) }

    /// Looks (again: after a change, coming back to the page) — keeping an answer already had on
    /// screen meanwhile — and tries a failure again after each of `retries` before it is `failed`.
    /// One that can't be asked again doesn't keep the earlier answer: the draft it named may have
    /// been deleted since (修改 on a card that isn't there), and 共振 asks again on a tap.
    func look(_ find: @escaping Find) async {
        if state == .failed { state = .looking }
        let answered = pressAnswers
        for pause in [Duration.zero] + retries {
            if pause > .zero {
                try? await Task.sleep(for: pause)
                if Task.isCancelled { return }
            }
            do {
                state = .found(try await answer(find, within: patience))
                tapFailed = false
                return
            } catch {
                if Task.isCancelled { return }
            }
        }
        // A press asked and was answered meanwhile: that answer is newer than this failure.
        if pressAnswers == answered { state = .failed }
    }

    /// The reader pressed 用卡片回應 before the lookup answered (still looking, or failed): asked once
    /// more, at once, for ``askPatience`` at most — the segment inks only meanwhile. One that hangs
    /// ends then too, with the quiet line under the capsule and the segment there to press again.
    func askOnTap(_ find: @escaping Find) async -> Asked {
        guard !asking else { return .unknown }
        asking = true
        defer { asking = false }
        do {
            let mine = try await answer(find, within: askPatience)
            pressAnswers += 1
            state = .found(mine)
            tapFailed = false
            return mine.map(Asked.answered) ?? .unanswered
        } catch {
            tapFailed = !Task.isCancelled
            return .unknown
        }
    }

    /// `find`'s answer, or a failure once `patience` has run out without one: a read that hangs
    /// (Firestore waiting on a connection that doesn't come, deaf to cancellation) fails like any
    /// other. The read is left to end when it does; a late answer is not used.
    private func answer(_ find: @escaping Find, within patience: Duration) async throws -> DraftService.Resonance? {
        let first = FirstAnswer()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { done in
                first.waiting = done
                let read = Task {
                    do { first.give(.success(try await find())) } catch { first.give(.failure(error)) }
                }
                let timer = Task {
                    try? await Task.sleep(for: patience)
                    first.give(.failure(TookTooLong()))
                }
                first.running = [read, timer]
            }
        } onCancel: {
            Task { @MainActor in first.give(.failure(CancellationError())) }
        }
    }

    struct TookTooLong: Error {}

    /// Whichever comes first — the read's answer, the deadline, the lookup cancelled — is the answer;
    /// the rest are stopped and ignored.
    @MainActor private final class FirstAnswer {
        var waiting: CheckedContinuation<DraftService.Resonance?, Error>?
        var running: [Task<Void, Never>] = []

        func give(_ result: Result<DraftService.Resonance?, Error>) {
            guard let waiting else { return }
            self.waiting = nil
            waiting.resume(with: result)
            running.forEach { $0.cancel() }
        }
    }
}
