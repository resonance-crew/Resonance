import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// Where the app's page in the App Store is (the web's `APP_STORE_URL`, src/lib/appStores.ts): the iPhone, iPad and
/// Mac app share one record, so one address opens the store's page on each (the App Store app on iOS, the Mac App
/// Store on a Mac).
enum AppStorePage {
    static let id = "6817604797"
    static let url = URL(string: "https://apps.apple.com/app/id\(id)")!

    @MainActor static func open() {
        UIApplication.shared.open(url)
    }
}

/// This build below `minBuild` (client-config, Phase 2 of the middleware decouple): the whole window is the update
/// page — the empty state's pieces on the paper (its mark, the title, the line saying why, the solid button to the
/// App Store page), nothing behind it to reach. The web's not-found page, drawn the same way on every device.
struct UpdateRequiredScreen: View {
    var body: some View {
        ZStack {
            Tokens.cream.ignoresSafeArea()
            GeometryReader { geo in
                OrganicEmptyState(title: L10n.App.Update.title, message: L10n.App.Update.body,
                                  actionTitle: L10n.App.Update.action, actionStyle: .primary, icon: .arrowUp, seed: 41,
                                  fills: true) { AppStorePage.open() }
                    .environment(\.emptyStateRegion, geo.size.height)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

extension View {
    /// A newer build is out (`recommendedBuild`): a note the reader may put off — the one-question modal with 稍後再說
    /// and 前往更新 at its foot — once per recommended build.
    func updateRecommendation(_ config: ClientConfigStore) -> some View {
        organicModal(isPresented: Binding(get: { config.recommendsUpdate }, set: { if !$0 { config.later() } }),
                     seed: 59, maxWidth: 400, closeLabel: L10n.App.Update.later) {
            VStack(alignment: .leading, spacing: 0) {
                ModalTitle(L10n.App.Update.available).padding(.bottom, 18)
                ModalActions {
                    OrganicButton(L10n.App.Update.later, variant: .tonal, size: .sm) { config.later() }
                } verb: {
                    OrganicButton(L10n.App.Update.action, variant: .solid, size: .sm) {
                        config.later()
                        AppStorePage.open()
                    }
                }
            }
        }
    }
}
