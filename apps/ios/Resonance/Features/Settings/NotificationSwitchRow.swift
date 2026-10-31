import DesignSystem
import ResonanceKit
import SwiftUI

/// One push switch as Settings → 通知 and the signup's notifications step draw it: the label with
/// its hint under it, and the switch at the row's end; a tap anywhere on the row flips it, as on
/// Android. VoiceOver reads the switch, the hint as its hint.
struct NotificationSwitchRow: View {
    let label: String
    let hint: String
    let seed: Double
    @Binding var isOn: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text(label).font(AppFonts.body(16)).foregroundStyle(Tokens.text)
                    .fixedSize(horizontal: false, vertical: true)
                CSSText(hint, font: AppFonts.scaledUIFont(.body, size: Tokens.hintSize), lineHeight: 1.55, color: Tokens.UI.textMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { if isEnabled { isOn.toggle() } }
            .accessibilityHidden(true)
            OrganicToggle(isOn: $isOn, label: label, seed: seed)
                .accessibilityHint(hint)
                .padding(.top, 1)
        }
    }
}

/// The system keeps this app's notifications off: only Settings can turn them on again — said, with
/// the way there.
struct NotificationsDeniedNotice: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CSSText(L10n.Settings.Notifications.permissionDenied, font: AppFonts.scaledUIFont(.body, size: 14), lineHeight: 1.55,
                    color: Tokens.UI.textMuted)
            OrganicButton(L10n.Settings.Notifications.openSettings, variant: .tonal, size: .sm) {
                if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
            }
        }
    }
}

extension NotificationSettingsAPI.Switch {
    /// Its label and hint, in the interface's language of the moment, and its toggle's seed (the web's).
    var row: (label: String, hint: String, seed: Double) {
        switch self {
        case .messages: (L10n.Settings.Notifications.messages, L10n.Settings.Notifications.messagesHint, 79)
        case .picks: (L10n.Settings.Notifications.picks, L10n.Settings.Notifications.picksHint, 83)
        // 91, as the web's: 89's track pinched at its middle (a peanut, QA r4).
        case .connectionCards: (L10n.Settings.Notifications.connectionCards, L10n.Settings.Notifications.connectionCardsHint, 91)
        }
    }
}
