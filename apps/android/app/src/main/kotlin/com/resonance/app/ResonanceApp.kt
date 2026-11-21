package com.resonance.app

import android.app.Application
import android.os.Build
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.annotation.ExperimentalCoilApi
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.api.AppHttp
import com.resonance.kit.api.HttpCaching
import com.resonance.kit.chat.NoteDrafts
import com.resonance.kit.chat.ChatDrafts
import com.resonance.kit.chat.KeyboardHeights
import com.resonance.kit.chat.StickerRecents
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.ApiCache
import com.resonance.app.ui.share.ShareFiles
import okhttp3.Cache
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import okhttp3.OkHttpClient
import java.io.File

class ResonanceApp : Application(), SingletonImageLoader.Factory {
    private var session: Session? = null

    /** The app's one HTTP client: the API and the images share its connections and threads. */
    private val http by lazy {
        AppHttp.client(AppHttp.userAgent(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE.toLong(), Build.VERSION.RELEASE))
    }
    /** The API's HTTP cache (what the server lets a private cache keep; emptied on sign-out). */
    private val httpCaching by lazy { HttpCaching(Cache(File(cacheDir, "http"), 10L * 1024 * 1024)) }

    /** One session for the process, so a recreated activity finds the same state and listeners. */
    fun session(config: AppConfig): Session = session ?: Session(
        config,
        getSharedPreferences("settings", MODE_PRIVATE),
        http = httpCaching.client(http),
        httpCaching = httpCaching,
        // What the screens a cold start opens on last showed, per account (cache: never backed up).
        kept = ApiCache(File(cacheDir, "api")),
        shareFiles = File(cacheDir, ShareFiles.DIR),
        // Notes not sent yet, per account and card: they outlive the app being killed, not the account's sign-out.
        noteDraftStore = NoteDrafts(NoteDraftPrefs(getSharedPreferences(NoteDraftPrefs.FILE, MODE_PRIVATE))),
        // Messages not sent yet, per account and conversation (round 22): likewise.
        chatDraftStore = ChatDrafts(ChatDraftPrefs(getSharedPreferences(ChatDraftPrefs.FILE, MODE_PRIVATE))),
        stickerRecentsStore = StickerRecents(StickerRecentsPrefs(getSharedPreferences(StickerRecentsPrefs.FILE, MODE_PRIVATE))),
        keyboardHeights = KeyboardHeights(KeyboardHeightPrefs(getSharedPreferences(KeyboardHeightPrefs.FILE, MODE_PRIVATE))),
        // Chat pictures: through the app's client with the token, kept in a folder of their own (cache: never backed up).
        pictureHttp = http,
        pictureLoader = { client -> ChatPictures.loader(this, File(cacheDir, "chat-pictures"), client) },
        // How cards were read and not reported yet (round 26 §U7): sent at the next launch.
        readingReports = com.resonance.app.ui.ReadingReports(ReadingReportPrefs(getSharedPreferences(com.resonance.app.ui.ReadingReports.FILE, MODE_PRIVATE))),
        // The writer's words on their way through /api/v1 (Phase 2, `apiDrafts`): they outlive the app being killed.
        draftOutboxPrefs = getSharedPreferences("draft-outbox", MODE_PRIVATE),
    ).also {
        session = it
        it.start { it.loadMe() }
        watchNetwork(it)
    }

    /** A network that comes back sends at once what waited for it (Session.networkBack). */
    private fun watchNetwork(session: Session) {
        val connectivity = getSystemService(android.net.ConnectivityManager::class.java) ?: return
        runCatching {
            connectivity.registerDefaultNetworkCallback(object : android.net.ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) {
                    android.os.Handler(android.os.Looper.getMainLooper()).post { session.networkBack() }
                }
            })
        }
    }

    /**
     * A light, unauthenticated HEAD to the API's host on the app's one client (A1 c): its DNS, TLS and
     * HTTP/2 connection are made while the first screen waits for the account's tokens, and the API
     * calls after it find the connection open. Nothing is read from it, nothing is cached.
     */
    fun warmConnection(origin: String) {
        val request = runCatching { Request.Builder().url(origin.trimEnd('/') + "/api/v1/openapi.json").head().build() }.getOrNull() ?: return
        http.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = Unit
            override fun onResponse(call: Call, response: Response) = response.close()
        })
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader(context, http)

    override fun onCreate() {
        super.onCreate()
        AppFonts.init(this)
        // Production's Firebase and App Check provider in every process the app starts (A1 a): a push
        // can wake one no activity ever runs in, which then warms the tokens (ResonancePushService).
        // Builds that may point at the local stack choose in MainActivity (its launch extras).
        if (!BuildConfig.LOCAL_STACK) AppFirebase.configure(this, AppConfig(usesEmulator = false))
        // 外觀 before any screen: its mode is also the app's night mode on Android 12+.
        AppearanceStore.init(this)
        Grain.init(this)
        Grain.warmUp()
        // The 小紙團 stickers the build bundles (round 22): their catalog read once, their files on demand.
        Stickers.init(this, http)
        // The web's catalogs, bundled as they are (see L10n.kt).
        Strings.load { lang -> runCatching { assets.open("${lang.tag}.json").bufferedReader().use { it.readText() } }.getOrNull() }
        val saved = getSharedPreferences("settings", MODE_PRIVATE).getString(Session.LANGUAGE_KEY, null)
        Strings.language = Strings.Language.fromTag(saved)
            ?: Strings.Language.preferred(resources.configuration.locales.let { l -> List(l.size()) { l[it].toLanguageTag() } })
        // The "activity" channel (named in the language just chosen) exists before any push can arrive.
        PushCenter.init(this)
    }

    companion object {
        /**
         * Coil reads the pictures — covers, avatars, story and link pictures — through the app's
         * [client] (its own disk cache keeps them; their addresses never change), and keeps only a
         * picture ([PicturesOnly]): a cover that failed once is asked for again when its card is
         * opened again. AVIF — the AI illustrations — needs its own decoder before Android 12.
         */
        @OptIn(ExperimentalCoilApi::class)
        fun imageLoader(context: PlatformContext, client: OkHttpClient): ImageLoader = ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(callFactory = { client }, cacheStrategy = { PicturesOnly }))
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || (BuildConfig.DEBUG && DebugLaunch.avifDecoder)) add(AvifDecoder.Factory())
            }
            .build()
    }
}
