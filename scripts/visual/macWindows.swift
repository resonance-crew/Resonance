// The windows of the running copies of one app, as JSON lines: `{"id","pid","width","height","layer"}`
// (points), for mac.ts to capture one with `screencapture -l <id>`. Usage: macWindows <bundle id>.
// Read from the window server (CGWindowListCopyWindowInfo), which names no bundle: each window's
// process is asked for its own.
import AppKit

let bundle = CommandLine.arguments.dropFirst().first ?? ""
let infos = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
for info in infos {
    guard let pid = info[kCGWindowOwnerPID as String] as? pid_t,
          NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == bundle,
          let id = info[kCGWindowNumber as String] as? Int,
          let bounds = info[kCGWindowBounds as String] as? [String: Double] else { continue }
    let layer = info[kCGWindowLayer as String] as? Int ?? 0
    print("{\"id\":\(id),\"pid\":\(pid),\"width\":\(bounds["Width"] ?? 0),\"height\":\(bounds["Height"] ?? 0),\"layer\":\(layer)}")
}
