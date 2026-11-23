import Foundation
import os

/// A cold start's way to the page a tapped push names (round 32 §P7, the owner: 「App 冷启动…点击推送通知 → 进入目标页并
/// 显示出消息的耗时」): each step marked once, with the milliseconds since the process began, in the unified log
/// (subsystem `com.resonance.stories`, category `launch`) — process → first frame → session restored → route opened →
/// first request → first message drawn. Debug builds only, and only when the simulator's defaults say `traceLaunch`
/// (a push's cold start takes no launch arguments): `xcrun simctl spawn <udid> defaults write com.resonance.stories
/// traceLaunch -bool YES`, then `xcrun simctl spawn <udid> log stream --predicate 'category == "launch"'`.
nonisolated enum LaunchTrace {
    #if DEBUG
    static let enabled = UserDefaults.standard.bool(forKey: "traceLaunch")
    #else
    static let enabled = false
    #endif

    private static let log = Logger(subsystem: "com.resonance.stories", category: "launch")
    private static let marked = OSAllocatedUnfairLock(initialState: Set<String>())

    /// When the process began (the kernel's record of it), or now when it can't be read.
    static let processStart: Date = {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var name: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&name, 4, &info, &size, nil, 0) == 0 else { return .now }
        let start = info.kp_proc.p_un.__p_starttime
        return Date(timeIntervalSince1970: Double(start.tv_sec) + Double(start.tv_usec) / 1_000_000)
    }()

    /// The first time `step` happens in this process: logged with the milliseconds since it began.
    static func mark(_ step: String) {
        guard enabled, marked.withLock({ $0.insert(step).inserted }) else { return }
        let ms = Int(Date.now.timeIntervalSince(processStart) * 1000)
        log.notice("[launch] +\(ms, privacy: .public) ms \(step, privacy: .public)")
    }
}
