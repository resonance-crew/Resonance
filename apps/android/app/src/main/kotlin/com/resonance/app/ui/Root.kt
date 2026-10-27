package com.resonance.app.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import android.graphics.drawable.ColorDrawable
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.foundation.LocalIndication
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.AppearanceStore
import com.resonance.app.Launch
import com.resonance.app.MainActivity
import com.resonance.app.Session
import com.resonance.design.CappedTextScale
import com.resonance.design.LocalModalBackdrop
import com.resonance.design.ModalBackdrop
import com.resonance.design.softenedUnder
import com.resonance.design.OrganicIndication
import com.resonance.design.ResonanceTheme
import com.resonance.design.SketchLoader
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.cream
import com.resonance.design.generated.Tokens

/**
 * Signed out → sign-in; signed in → the tabs, or first the pen-name step for
 * a new account (see [Session.Entry]); restoring → the paper and a loader.
 */
@Composable
fun ResonanceRoot(session: Session, incomingRoute: MutableState<String?>) {
    // A large system text size is followed only part of the way, for every screen, dialog and sheet below.
    CappedTextScale {
    // 外觀: the scheme and theme every colour below reads (and Material's, made from the same palette).
    val appearance by AppearanceStore.shared.state.collectAsStateWithLifecycle()
    ResonanceTheme(appearance.scheme, appearance.accent) {
    SystemBars()
    // Every press is the hand-drawn ink spread, never Material's rectangular ripple (it spilt past round chips and bare glyphs).
    // What lies under a modal is softened while it is up (round 16 review F8; Android 12 and later).
    val backdrop = remember { ModalBackdrop() }
    val soft = remember { Animatable(0f) }
    // Followed outside composition: a dialog opening redraws the screens under it, recomposing none of them.
    LaunchedEffect(backdrop) { snapshotFlow { backdrop.open > 0 }.collect { soft.animateTo(if (it) 1f else 0f, tween(150)) } }
    CompositionLocalProvider(LocalIndication provides OrganicIndication(), LocalModalBackdrop provides backdrop) {
        val phase by session.phase.collectAsStateWithLifecycle()
        // Under the launch's splash the first screen simply is; a crossfade would show the loader leaving as it dissolves.
        Crossfade(phase, Modifier.fillMaxSize().cream().softenedUnder { soft.value }, animationSpec = if (Launch.covering) snap() else tween(), label = "phase") { p ->
            when (p) {
                Session.Phase.Restoring -> Loading()
                Session.Phase.SignedOut -> SignInScreen(session)
                Session.Phase.SignedIn -> SignedIn(session, incomingRoute)
            }
        }
    }
    }
    }
}

/**
 * A link that arrives meanwhile waits in `incomingRoute` until the tabs open it. The tabs belong to
 * the account: another one signing in (without a sign-out between) gets its own, nothing kept.
 */
@Composable
private fun SignedIn(session: Session, incomingRoute: MutableState<String?>) {
    val entry by session.entry.collectAsStateWithLifecycle()
    val account by session.signedInUid.collectAsStateWithLifecycle()
    Crossfade(entry, Modifier.fillMaxSize().cream(), animationSpec = if (Launch.covering) snap() else tween(), label = "entry") { e ->
        when (e) {
            Session.Entry.Waiting -> Loading()
            Session.Entry.Onboarding -> OnboardingScreen(session)
            Session.Entry.App -> key(account) { MainTabs(session, incomingRoute) }
        }
    }
}

/**
 * What the system draws round the screens, in the scheme they wear: the bars' glyphs (light on the
 * night paper) and the window's own paper — what shows under a screen as the keyboard slides or a
 * page is swapped — said again whenever the scheme or theme changes (the activity isn't started
 * again for it: configChanges takes uiMode).
 */
@Composable
private fun SystemBars() {
    val activity = LocalActivity.current as? MainActivity ?: return
    val dark = LocalResonanceColors.current.dark
    val paper = Tokens.Cream
    LaunchedEffect(dark) { activity.systemBarsFor(dark) }
    LaunchedEffect(paper) { activity.window.setBackgroundDrawable(ColorDrawable(paper.toArgb())) }
}

@Composable
private fun Loading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { SketchLoader(56.dp) }
}

private val Int.dp get() = androidx.compose.ui.unit.Dp(this.toFloat())
