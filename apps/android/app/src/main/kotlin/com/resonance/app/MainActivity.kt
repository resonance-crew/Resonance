package com.resonance.app

import com.resonance.design.AppearanceAccent
import androidx.compose.ui.graphics.toArgb
import android.os.Build
import android.graphics.drawable.ColorDrawable
import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.google.firebase.firestore.FirebaseFirestore
import com.resonance.app.ui.KeyShortcuts
import com.resonance.app.ui.ResonanceRoot
import com.resonance.kit.chat.ChatPush
import com.resonance.kit.push.PushPlacement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Debug launch extras (the twins of the iOS launch arguments):
 *   --ez emulator true             use the local Firebase emulators + dev server
 *   --es email … --es password …   sign that seeded account in, switching from a restored one (emulator only)
 *   --es route /card/<slug>        open that page (with --es notificationId … [--es fromUserId …], what a tapped push starts the app with)
 *   --es writeTitle … --es writeStory … --es writeCover <url>   a new card starts with them
 *   --es threadDraft …             fills a conversation's composer (--es route /messages/<handle> opens one)
 *   --es pushToken …               registers that stand-in push token under the signed-in account
 *   --es pushTitle … [--es pushBody … --es pushRoute … --es pushId … --es pushFromUserId … --es pushType pick|new_card --es pushCardId …]   posts the notification a push received while open shows
 *   --es pushChatBody … [--es pushChatConversation <pair> --es pushChatTitle … --es pushChatId … --es pushFromUserId …
 *     --es pushChatAvatar <url> --es pushChatInitials … --es pushChatColor "oklch(…)"]   posts a chat message's notification, as a data-only chat push does
 *   --ez avifDecoder true          reads AVIF with the app's own decoder (Android 10–11's path) on any version
 *   --ei feedPicksDelay <s> [--es feedPicks <id,…>]   holds today's picks back that long, and stands those cards in for them
 *   --ez mascots true|false        turns 外觀's 小精靈 on or off; --es mascotJs "mascots.visit({ ledge: 'more', slug: 'tuck' }); mascots.advance(3)"
 *                                  calls the paper puppets' island on screen (answers in Logcat, tag Mascots)
 *   --ez firestoreLog true         Firestore's own debug log in Logcat (tag Firestore: its streams, connectivity, targets)
 */
class MainActivity : ComponentActivity() {
    private val incomingRoute = mutableStateOf<String?>(null)
    private var session: Session? = null
    // The answer to the notification permission dialog: the device registers for pushes once they can show.
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        lifecycleScope.launch { session?.registerPush() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch's splash (the waves on the paper) before anything else draws; see [Launch].
        val splash = installSplashScreen()
        // See-through bars whose glyphs follow the scheme the screens wear (外觀's, or the system's):
        // dark on the paper, light on the night paper. Said again whenever it changes (SystemBars).
        systemBarsFor(AppearanceStore.shared.isDark(resources.configuration))
        // Under the first frame, the chosen theme's paper (the manifest's theme knows only terracotta's).
        window.setBackgroundDrawable(ColorDrawable(AppearanceStore.shared.palette(this).Cream.toArgb()))
        super.onCreate(savedInstanceState)
        val emulator = BuildConfig.LOCAL_STACK && intent.getBooleanExtra("emulator", false)
        val config = if (!emulator) AppConfig(usesEmulator = false) else {
            fun port(name: String, default: Int) = intent.getIntExtra(name, default).takeIf { it in 1..65535 } ?: default
            AppConfig(
                usesEmulator = true,
                emulatorHost = AppConfig.emulatorHostOf(intent.getStringExtra("emulatorHost")),
                emulatorAuthPort = port("emulatorAuthPort", 9099),
                emulatorFirestorePort = port("emulatorFirestorePort", 8080),
                emulatorApiPort = port("emulatorApiPort", 3100),
            )
        }
        if (BuildConfig.LOCAL_STACK && intent.getBooleanExtra("firestoreLog", false)) FirebaseFirestore.setLoggingEnabled(true)
        AppFirebase.configure(this, config)
        val session = (application as ResonanceApp).session(config)
        this.session = session
        // The splash stays until the first screen is the page itself (not the loader while the
        // account restores, nor the wait for a profile this device hasn't seen), at most Launch.HOLD_MILLIS.
        Launch.hold(this, splash, fresh = savedInstanceState == null) {
            when (session.phase.value) {
                Session.Phase.Restoring -> false
                Session.Phase.SignedOut -> true
                Session.Phase.SignedIn -> session.entry.value != Session.Entry.Waiting
            }
        }
        if (emulator) {
            val email = intent.getStringExtra("email")
            val password = intent.getStringExtra("password")
            // Switches from whoever was restored to the requested account.
            if (email != null && password != null && !AppFirebase.auth.currentUser?.email.equals(email, ignoreCase = true)) {
                lifecycleScope.launch { session.signIn(email, password) }
            }
        }
        if (BuildConfig.DEBUG) {
            DebugLaunch.writeTitle = intent.getStringExtra("writeTitle")
            DebugLaunch.writeStory = intent.getStringExtra("writeStory")
            DebugLaunch.writeCover = intent.getStringExtra("writeCover")
            DebugLaunch.threadDraft = intent.getStringExtra("threadDraft")
            DebugLaunch.linkDraft = intent.getStringExtra("linkDraft")
            DebugLaunch.avifDecoder = intent.getBooleanExtra("avifDecoder", false)
            DebugLaunch.feedPicksDelay = intent.getIntExtra("feedPicksDelay", 0)
            DebugLaunch.feedPicksIds = intent.getStringExtra("feedPicks")?.split(',')?.map(String::trim)?.filter(String::isNotEmpty)
            mascotExtras(intent)
        }
        // A recreated activity (rotation, process restore) still holds the intent it was first started with,
        // and its back stacks come back as they were: the link was opened then and isn't pushed again.
        if (savedInstanceState == null) {
            incomingRoute.value = routeFrom(intent)
            handleExtras(intent)
        }
        setContent { ResonanceRoot(session, incomingRoute) }
        // 外觀's theme where the screens don't reach: the system's controls, the next launch's splash.
        lifecycleScope.launch { AppearanceStore.shared.state.collect { wearTheme(it.accent) } }
        // Once signed in: give this install's push token to the session.
        lifecycleScope.launch {
            session.phase.collect { phase ->
                if (phase == Session.Phase.SignedIn) PushCenter.fetchToken(config.usesEmulator)
            }
        }
        // Ask to show notifications (API 33+, once) the first time the person reaches someone — a
        // note, a message, a card published (PushCenter.reachedOut) — when an answer is worth
        // hearing about; not on first opening the app.
        lifecycleScope.launch {
            PushCenter.permissionWanted.collect { wanted ->
                if (!wanted) return@collect
                PushCenter.permissionShown()
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    /**
     * [accent] outside Compose: the system's own controls in it (the writer WebView's selection handles,
     * from the views made after), and from Android 13 the next launch's splash on its paper.
     */
    private fun wearTheme(accent: AppearanceAccent) {
        theme.applyStyle(AppearanceStore.controlsOverlay(accent), true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) runCatching { splashScreen.setSplashScreenTheme(AppearanceStore.splashTheme(accent)) }
    }

    /** The bars' glyphs for the scheme on screen: [dark] light glyphs, else dark ones, on see-through bars. */
    fun systemBarsFor(dark: Boolean) {
        val style = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    // Ctrl-N / Cmd-N on a hardware keyboard opens the writer, whatever has focus (a text field doesn't use the chord).
    // Activity.dispatchKeyEvent is public; lint sees androidx.core's ComponentActivity override, marked @RestrictTo.
    @SuppressLint("RestrictedApi")
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val chord = event.isCtrlPressed || event.isMetaPressed
        if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_N && chord && !event.isAltPressed && !event.isShiftPressed) {
            val open = KeyShortcuts.newCard
            if (open != null) {
                if (event.repeatCount == 0) open()
                return true
            }
        }
        // Ctrl-1…4 / Cmd-1…4: the four tabs, in the header's order.
        val n = event.keyCode - KeyEvent.KEYCODE_0
        if (event.action == KeyEvent.ACTION_DOWN && n in 1..4 && chord && !event.isAltPressed && !event.isShiftPressed) {
            val choose = KeyShortcuts.tab
            if (choose != null) {
                if (event.repeatCount == 0) choose(n)
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStart() {
        super.onStart()
        // Back after a while: the screens read again in the background (what they show stays meanwhile).
        session?.enteredForeground()
    }

    override fun onStop() {
        super.onStop()
        // Off the screen (the app is one activity), not just recreated: when Firestore reconnects on the way back.
        if (!isChangingConfigurations) session?.enteredBackground()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (BuildConfig.DEBUG) mascotExtras(intent)
        incomingRoute.value = routeFrom(intent)
        handleExtras(intent)
    }

    /** Debug: `--ez mascots true|false` sets 外觀's 小精靈; `--es mascotJs "mascots.visit({…})"` calls the island on screen. */
    private fun mascotExtras(intent: Intent) {
        if (intent.hasExtra("mascots")) AppearanceStore.shared.setMascots(intent.getBooleanExtra("mascots", false))
        intent.getStringExtra("mascotJs")?.let { DebugLaunch.mascotCalls.trySend(it) }
    }

    /** A site link: /card/…, /u/…, /messages/…?note=…&card=…, its query kept. */
    private fun routeFrom(intent: Intent): String? =
        intent.data?.let { uri -> uri.path?.let { path -> path + (uri.encodedQuery?.let { "?$it" } ?: "") } }

    /**
     * A tapped push starts the app with its data as extras (`route`, `notificationId`,
     * `fromUserId`; the system's own notification does it for a push that arrived while the app
     * was closed, and the one the app posts itself does the same), in every build. The tabs open
     * what it points at.
     */
    private fun handleExtras(intent: Intent) {
        if (intent.data == null && (intent.hasExtra(PushCenter.EXTRA_ROUTE) || intent.hasExtra(PushCenter.EXTRA_NOTIFICATION_ID))) {
            PushCenter.open(
                intent.getStringExtra(PushCenter.EXTRA_ROUTE).orEmpty(),
                intent.getStringExtra(PushCenter.EXTRA_NOTIFICATION_ID),
                intent.getStringExtra(PushCenter.EXTRA_FROM_USER_ID),
            )
        }
        if (BuildConfig.DEBUG) {
            intent.getStringExtra("pushToken")?.let(PushCenter::tokenChanged)
            intent.getStringExtra("pushTitle")?.let {
                // `pushType` pick / new_card (with `pushCardId`) lands in the "picks" channel, as those pushes do.
                val data = listOfNotNull(
                    intent.getStringExtra("pushType")?.let { type -> "type" to type },
                    intent.getStringExtra("pushCardId")?.let { id -> "cardId" to id },
                    intent.getStringExtra("pushId")?.let { id -> PushCenter.EXTRA_NOTIFICATION_ID to id },
                ).toMap()
                PushCenter.show(
                    this, it, intent.getStringExtra("pushBody"), intent.getStringExtra("pushRoute").orEmpty(), intent.getStringExtra("pushId"),
                    intent.getStringExtra("pushFromUserId"), PushPlacement.of(data),
                )
            }
            // A chat message as the push service would show it (`pushChatConversation` is the pair id; screen checks of its notification).
            intent.getStringExtra("pushChatBody")?.let { body ->
                val conversation = intent.getStringExtra("pushChatConversation").orEmpty()
                val push = ChatPush(
                    conversationId = conversation, messageId = intent.getStringExtra("pushChatId"), fromUserId = intent.getStringExtra("pushFromUserId"),
                    toUserId = null,
                    title = intent.getStringExtra("pushChatTitle").orEmpty().ifEmpty { "bob" }, body = body,
                    route = intent.getStringExtra("pushRoute").orEmpty(), sentAt = System.currentTimeMillis(),
                    fromAvatarUrl = intent.getStringExtra("pushChatAvatar"), fromInitials = intent.getStringExtra("pushChatInitials"),
                    fromColor = intent.getStringExtra("pushChatColor"),
                )
                // Off the main thread, as the push service draws it: the sender's photo may be fetched first.
                lifecycleScope.launch(Dispatchers.IO) { PushCenter.showChatMessage(applicationContext, push) }
            }
            // An unsent message's push (round 16 §3): `pushChatUnsend` is its id, in `pushChatConversation`.
            intent.getStringExtra("pushChatUnsend")?.let { id ->
                PushCenter.removeChatLine(applicationContext, intent.getStringExtra("pushChatConversation").orEmpty(), id)
            }
        }
    }
}

/** Debug launch extras the screens read (the writer's and a thread's prefill). */
object DebugLaunch {
    var writeTitle: String? = null
    var writeStory: String? = null
    var writeCover: String? = null
    /** A conversation's composer starts with this text. */
    var threadDraft: String? = null
    /** What the writer's link sheet's field starts with when it opens on no link (screen checks: an IME's keys are slow to drive). */
    var linkDraft: String? = null
    /** Pictures in AVIF go through [AvifDecoder] whatever the Android version (its check on a recent emulator). */
    var avifDecoder = false
    /** Today's picks held back this many seconds (screen checks of picks put on top of the latest cards). */
    var feedPicksDelay = 0
    /** Cards stood in for today's picks (the emulator's recommender has none). */
    var feedPicksIds: List<String>? = null
    /**
     * The paper puppets' island's screen checks (`--es mascotJs …`): calls into its API, logged with
     * their answers (tag Mascots). Each is taken once, by the island on screen, once it has a scene —
     * one sent with the launch waits for it; none is ever run again or retried (round 20).
     */
    val mascotCalls = kotlinx.coroutines.channels.Channel<String>(capacity = 8)

    /**
     * The home feed's picks as the debug extras ask (null: as the server answers them): held back
     * [feedPicksDelay] seconds, and — with [feedPicksIds] — those cards as picks of their own (their
     * ids marked, as the latest cards hold the real ones), with a reason, as picks have. iOS's
     * `-feedPicksDelay` / `-feedPicks`.
     */
    fun feedPicks(reading: com.resonance.kit.api.ReadingApi): (suspend () -> List<com.resonance.api.models.FeedCard>)? {
        if (!BuildConfig.DEBUG || (feedPicksDelay <= 0 && feedPicksIds == null)) return null
        val delay = feedPicksDelay
        val ids = feedPicksIds
        return {
            if (delay > 0) kotlinx.coroutines.delay(delay * 1000L)
            if (ids == null) reading.recommended()
            else reading.cards(ids).map { it.copy(id = "pick-${it.id}", reason = "stand-in pick") }
        }
    }
}
