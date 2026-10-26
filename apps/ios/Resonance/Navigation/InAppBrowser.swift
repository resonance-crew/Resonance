import DesignSystem
import SafariServices
import UIKit

/// Opens a web page inside the app (SFSafariViewController), so the reader
/// never leaves for Safari — the store rules want the privacy policy
/// reachable in the app itself.
@MainActor
enum InAppBrowser {
    /// Presents `url` over whatever is on screen. Only http(s) pages open:
    /// SFSafariViewController refuses any other scheme.
    static func open(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard var top = scene?.keyWindow?.rootViewController ?? scene?.windows.first?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        let browser = SFSafariViewController(url: url)
        // The browser draws its bar out of process and takes plain colours: the paper and the accent as
        // the screen under it wears them now (it opens in the scene's appearance and closes before a switch).
        let traits = top.traitCollection
        browser.preferredControlTintColor = Tokens.UI.terracotta.resolvedColor(with: traits)
        browser.preferredBarTintColor = Tokens.UI.cream.resolvedColor(with: traits)
        top.present(browser, animated: true)
    }
}
