package com.resonance.app.ui.share

import android.app.Activity
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.LabeledIntent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.service.chooser.ChooserAction
import androidx.annotation.RequiresApi
import com.resonance.app.R
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.getAndUpdate
import kotlinx.coroutines.launch
import java.time.LocalDateTime

/**
 * The app's own actions in the system share sheet (share.spec, Owner revision): Instagram 限時動態
 * and 儲存圖片. The sheet starts this activity — not exported, so nothing but the app's own
 * PendingIntents (API 34+'s ChooserActions) and LabeledIntents (API 29–33's initial intents) can —
 * which does the one thing and finishes at once, before it is ever drawn:
 *
 * - Stories copies the card's link (for Instagram's own link sticker: a third-party app can't attach
 *   one) and opens Instagram's Stories composer with the card as a movable sticker over its backdrop;
 * - Save writes the card picture into Pictures/Resonance.
 *
 * What it has to say (saved, couldn't save, couldn't open Instagram) waits in [ShareFeedback] for the
 * card page, which shows it as the shell's toast once it is back.
 */
class ShareActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val intent = intent
        when (intent?.action) {
            STORIES -> stories(intent)
            SAVE -> save(intent)
        }
        finish()
    }

    private fun stories(intent: Intent) {
        val appId = intent.getStringExtra(EXTRA_APP_ID)
        val link = intent.getStringExtra(EXTRA_LINK)
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val background = ShareFiles.file(this, ShareFiles.BACKDROP)?.takeIf { it.isFile }
        val sticker = ShareFiles.file(this, ShareFiles.STICKER)?.takeIf { it.isFile }
        if (appId == null || link == null || background == null || sticker == null) return ShareFeedback.say(L10n.Share.Image.storiesFailed)
        // Copied first, for Instagram's link sticker (the system shows its own "copied" from API 33).
        getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(title, link))
        val stickerUri = ShareFiles.uri(this, sticker)
        val stories = ShareIntents.stories(appId, ShareFiles.uri(this, background), stickerUri)
        grantUriPermission(ShareIntents.INSTAGRAM, stickerUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try {
            if (stories.resolveActivity(packageManager) == null) throw ActivityNotFoundException()
            startActivity(stories)
        } catch (e: Exception) {
            ShareFeedback.say(L10n.Share.Image.storiesFailed)
        }
    }

    private fun save(intent: Intent) {
        val name = intent.getStringExtra(EXTRA_IMAGE)
        val key = intent.getStringExtra(EXTRA_KEY) ?: "card"
        val image = name?.let { ShareFiles.file(this, it) }?.takeIf { it.isFile }
        val app = applicationContext
        Work.scope.launch {
            val saved = image?.let { f -> runCatching { f.inputStream().use { ImageSaver.save(app, it, ShareLinks.savedName(key, LocalDateTime.now())) } }.getOrNull() }
            ShareFeedback.say(if (saved != null) L10n.Share.Image.saved else L10n.Share.Image.saveFailed)
        }
    }

    /** Where a save goes on after the activity has finished. */
    private object Work {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    companion object {
        const val STORIES = "com.resonance.app.share.STORIES"
        const val SAVE = "com.resonance.app.share.SAVE"
        const val EXTRA_LINK = "link"
        const val EXTRA_TITLE = "title"
        const val EXTRA_KEY = "key"
        const val EXTRA_IMAGE = "image"
        const val EXTRA_APP_ID = "appId"

        /** What one of the two actions starts: this activity, told what to do with which share. */
        fun intent(context: Context, action: String, share: SharedCard): Intent = Intent(context, ShareActionActivity::class.java)
            .setAction(action)
            .putExtra(EXTRA_LINK, share.link)
            .putExtra(EXTRA_TITLE, share.title)
            .putExtra(EXTRA_KEY, share.key)
            .putExtra(EXTRA_IMAGE, share.imageName)
            .apply { share.metaAppId?.let { putExtra(EXTRA_APP_ID, it) } }

        /**
         * The actions the sheet offers for [share] on this device: Stories when [share] has its sticker
         * and backdrop (a Meta app id, Instagram's Stories composer installed), then Save — as
         * ChooserActions on API 34+ (the sheet's own row of actions), else as LabeledIntents the
         * sheet lists first (API 29–33). Stories wears Instagram's own app icon, as the sheet draws
         * every app's; Save the app's picture glyph.
         */
        fun actions(context: Context, share: SharedCard, sdk: Int = Build.VERSION.SDK_INT): ShareActions {
            val pm = context.packageManager
            val instagramIcon = if (share.stories) instagramIcon(pm) else 0
            val stories = share.stories && instagramIcon != 0
            val labels = listOfNotNull(if (stories) STORIES else null, SAVE)
            if (sdk >= 34 && Build.VERSION.SDK_INT >= 34) {
                return ShareActions(custom = chooserActions(context, share, labels, instagramIcon), initial = null)
            }
            val initial: List<LabeledIntent> = labels.map { action ->
                val (source, icon) = if (action == STORIES) ShareIntents.INSTAGRAM to instagramIcon else context.packageName to R.drawable.ic_share_save
                LabeledIntent(intent(context, action, share), source, label(action), icon)
            }
            return ShareActions(custom = null, initial = initial.toTypedArray())
        }

        /** The sheet's own row of actions (API 34+): each a PendingIntent to this activity. */
        @RequiresApi(34)
        private fun chooserActions(context: Context, share: SharedCard, labels: List<String>, instagramIcon: Int): Array<ChooserAction> =
            labels.map { action ->
                val pending = PendingIntent.getActivity(
                    context, action.hashCode(), intent(context, action, share).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
                val icon = if (action == STORIES) Icon.createWithResource(ShareIntents.INSTAGRAM, instagramIcon) else Icon.createWithResource(context, R.drawable.ic_share_save)
                ChooserAction.Builder(icon, label(action), pending).build()
            }.toTypedArray()

        private fun label(action: String): String = if (action == STORIES) L10n.Share.toStories else L10n.Share.Image.save

        private fun instagramIcon(pm: PackageManager): Int =
            runCatching { pm.getApplicationInfo(ShareIntents.INSTAGRAM, 0).icon }.getOrDefault(0)
    }
}

/** A card as one share sends it: its link and title, the key its files are named by, its picture's file, and whether Stories is ready. */
data class SharedCard(
    val link: String,
    val title: String,
    val key: String,
    val imageName: String,
    /** Its sticker and backdrop are written, and the app has a Meta app id: Instagram Stories can be offered. */
    val stories: Boolean,
    val metaAppId: String?,
)

/** The sheet's own actions for one share: ChooserActions (API 34+) or initial LabeledIntents (API 29–33). */
class ShareActions(val custom: Array<out Parcelable>?, val initial: Array<out Parcelable>?)

/**
 * What a share action has to say once the app is back in front (it ran with the sheet on top): the
 * last word, taken once by the card page and shown as the shell's toast.
 */
object ShareFeedback {
    private val _pending = MutableStateFlow<String?>(null)
    val pending: StateFlow<String?> = _pending

    fun say(message: String) {
        _pending.value = message
    }

    /** The word waiting, now no longer waiting. */
    fun take(): String? = _pending.getAndUpdate { null }
}
