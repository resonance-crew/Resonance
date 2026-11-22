package com.resonance.app.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.resonance.design.OrganicEmptyState
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.L10n

/**
 * This build is below client-config's `minBuild.android` (Phase 2): the service no longer takes
 * it, so the app shows only this — the empty state's pieces on the paper (its mark, the title, the
 * line saying why, the solid button to the store), nothing behind it to reach: what is behind it
 * would fail. Drawn as iOS's UpdateRequiredScreen is (the same mark, seed and words; the owner,
 * 2026-11-21, on the two apps' first screenshots side by side: 「使用 ios 好了」) — it was the
 * pen-name step's shell before, with the lockup and a full-width button.
 */
@Composable
fun UpdateScreen() {
    val context = LocalContext.current
    OrganicEmptyState(
        message = L10n.App.Update.body,
        actionTitle = L10n.App.Update.action,
        onAction = { openStoreListing(context) },
        title = L10n.App.Update.title,
        icon = IconName.ArrowUp,
        seed = 41.0,
        fill = true,
        modifier = Modifier.fillMaxSize(),
    )
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
