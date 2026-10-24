package com.resonance.app.ui.share

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Parcelable

/**
 * The intents a share hands the system (share.spec, Owner revision; round 8 §9.2): one sheet, and
 * every app in it gets the card's link — Facebook as a feed post with its link card, Threads, LINE,
 * X, Messages, Copy, and Instagram too, whose own picker (Story · Feed · Message) never tells which it
 * chose, so a message sent through it carries a link that can be tapped (with its og image). The
 * 1080 × 1920 card picture goes only through the app's own two actions, first in the sheet: Instagram
 * 限時動態 (the card as a movable sticker over its backdrop) and 儲存圖片. Pure: the caller makes the
 * files, their content URIs and the actions' intents.
 */
object ShareIntents {
    const val JPEG = "image/jpeg"
    const val TEXT = "text/plain"

    /** Instagram's package and its Stories intent (Meta's "Sharing to Stories", Android). */
    const val INSTAGRAM = "com.instagram.android"
    const val ADD_TO_STORY = "com.instagram.share.ADD_TO_STORY"
    const val SOURCE_APPLICATION = "source_application"
    const val INTERACTIVE_ASSET = "interactive_asset_uri"

    /** The link — what every app that takes text gets. [preview]: the card picture the sheet shows beside the title. */
    fun link(link: String, title: String, preview: Uri?): Intent = Intent(Intent.ACTION_SEND).apply {
        type = TEXT
        putExtra(Intent.EXTRA_TEXT, link)
        putExtra(Intent.EXTRA_TITLE, title)
        putExtra(Intent.EXTRA_SUBJECT, title)
        if (preview != null) {
            clipData = imageClip(title, preview)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    /**
     * The system sheet for a card: the [link] intent for every app — no picture as an alternate
     * (EXTRA_ALTERNATE_INTENTS once handed Instagram the picture, a story that couldn't be tapped and a
     * message without a link); an app that takes only pictures simply isn't listed — the card picture
     * the sheet's preview beside the title, and the app's own actions in front, which carry it —
     * [customActions] (ChooserActions, API 34+) or [initialIntents] (LabeledIntents to the app's own
     * activity, API 29–33). Without a picture (it couldn't be made) the sheet carries the link alone.
     */
    fun cardChooser(
        link: String,
        title: String,
        image: Uri?,
        customActions: Array<out Parcelable>? = null,
        initialIntents: Array<out Parcelable>? = null,
    ): Intent {
        val chooser = Intent.createChooser(link(link, title, image), title)
        if (image != null) {
            if (!customActions.isNullOrEmpty()) chooser.putExtra(Intent.EXTRA_CHOOSER_CUSTOM_ACTIONS, customActions)
            if (!initialIntents.isNullOrEmpty()) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, initialIntents)
        }
        return chooser
    }

    /** The system sheet for a profile: its link, nothing to choose between. */
    fun profileChooser(link: String, title: String): Intent = Intent.createChooser(link(link, title, preview = null), title)

    /**
     * Instagram's Stories composer with the card as a sticker over its backdrop: the backdrop as the
     * intent's data (a 1080 × 1920 JPEG), the sticker (a PNG with its alpha) as the interactive
     * asset, the Meta app id as the source, read access granted. Instagram can't take a link from a
     * third-party app, so the caller copies it first for Instagram's own link sticker.
     */
    fun stories(metaAppId: String, background: Uri, sticker: Uri): Intent = Intent(ADD_TO_STORY).apply {
        setPackage(INSTAGRAM)
        putExtra(SOURCE_APPLICATION, metaAppId)
        setDataAndType(background, JPEG)
        putExtra(INTERACTIVE_ASSET, sticker)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    /** What resolves to Instagram's Stories composer at all (whether to offer it). */
    fun storiesProbe(): Intent = Intent(ADD_TO_STORY).setPackage(INSTAGRAM).setType(JPEG)

    private fun imageClip(title: String, uri: Uri): ClipData = ClipData(title, arrayOf(JPEG), ClipData.Item(uri))
}
