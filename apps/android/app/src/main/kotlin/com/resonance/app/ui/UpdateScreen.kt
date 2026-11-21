package com.resonance.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.resonance.design.AuthShell
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.Toasts
import com.resonance.kit.l10n.L10n

/**
 * This build is below client-config's `minBuild.android` (Phase 2): the service no longer takes
 * it, so the app shows only this — the pen-name step's shell (the lockup, the sheet), the reason,
 * and the way to the store. No way past it: what is behind it would fail. The twin of iOS's
 * UpdateRequiredView.
 */
@Composable
fun UpdateScreen() {
    val context = LocalContext.current
    AuthShell {
        SheetHeading(L10n.App.Update.title, L10n.App.Update.body)
        OrganicButton(L10n.App.Update.action, variant = ButtonVariant.Solid, block = true) { openStoreListing(context) }
    }
}

/**
 * A newer build is out (`recommendedBuild.android`): said once a launch in the shell's toast, its
 * action the store; it goes by itself (the person may let it go — 稍後再說 is simply not tapping).
 */
fun showUpdateAvailable(toasts: Toasts, context: Context) {
    toasts.show(
        L10n.App.Update.available,
        action = Toasts.Action(
            label = L10n.App.Update.action,
            accessibilityLabel = "${L10n.App.Update.available} · ${L10n.App.Update.action}",
            onAction = { openStoreListing(context) },
        ),
    )
}

/** Whether [showUpdateAvailable] was said in this process (a launch): the tabs of another account don't say it again. */
internal object UpdateNote {
    @Volatile var said = false
}

/** The app's Play Store listing: the store app, or its page in the browser when there is none. */
fun openStoreListing(context: Context) {
    val id = context.packageName
    val store = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(store)
    } catch (_: ActivityNotFoundException) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
