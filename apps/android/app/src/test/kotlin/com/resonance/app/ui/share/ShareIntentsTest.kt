package com.resonance.app.ui.share

import android.app.Application
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.LabeledIntent
import android.content.pm.PackageInfo
import android.net.Uri
import android.os.Parcelable
import android.service.chooser.ChooserAction
import com.resonance.app.R
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

/**
 * The system sheet a card's share opens (share.spec, Owner revision), payload by payload: the link
 * for every app that takes text, the card picture as the alternate for an app that takes only
 * pictures, the app's own Instagram 限時動態 and 儲存圖片 actions (ChooserActions on API 34+,
 * LabeledIntents to its own unexported activity on 29–33), the link alone when there is no picture;
 * Instagram's Stories intent (its keys, the backdrop as data, the sticker, the grants), the link
 * copied for its link sticker first; and a profile's plain link.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class ShareIntentsTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private val link = "https://resonance.channel/card/plums"
    private val picture = Uri.parse("content://com.resonance.stories.share/share/resonance-plums.jpg")

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @Test fun theLinkIsForEveryAppThatTakesText() {
        val intent = ShareIntents.link(link, "外婆的醃梅子", picture)
        assertEquals(Intent.ACTION_SEND, intent.action)
        assertEquals("text/plain", intent.type)
        assertEquals(link, intent.getStringExtra(Intent.EXTRA_TEXT))
        assertEquals("外婆的醃梅子", intent.getStringExtra(Intent.EXTRA_TITLE))
        // The picture rides along only as the sheet's preview, readable for it.
        assertEquals(picture, intent.clipData!!.getItemAt(0).uri)
        assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNull(intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
    }

    @Test fun thePictureGoesToTheAppsThatTakeOnlyPictures() {
        val chooser = ShareIntents.cardChooser(link, "外婆的醃梅子", picture)
        assertEquals(Intent.ACTION_CHOOSER, chooser.action)
        val target = chooser.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)!!
        assertEquals("text/plain", target.type)
        assertEquals(link, target.getStringExtra(Intent.EXTRA_TEXT))
        val alternates = chooser.getParcelableArrayExtra(Intent.EXTRA_ALTERNATE_INTENTS, Intent::class.java)!!
        assertEquals(1, alternates.size)
        val image = alternates[0]
        assertEquals(Intent.ACTION_SEND, image.action)
        assertEquals("image/jpeg", image.type)
        assertEquals(picture, image.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
        assertEquals(picture, image.clipData!!.getItemAt(0).uri)
        assertTrue(image.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        // No link in the picture's intent: an app that takes it gets the picture alone.
        assertNull(image.getStringExtra(Intent.EXTRA_TEXT))
    }

    @Test fun withoutAPictureTheSheetCarriesTheLinkAlone() {
        val actions = arrayOf<Parcelable>(LabeledIntent(Intent(), app.packageName, "x", 0))
        val chooser = ShareIntents.cardChooser(link, "外婆的醃梅子", image = null, initialIntents = actions)
        assertNull(chooser.getParcelableArrayExtra(Intent.EXTRA_ALTERNATE_INTENTS, Intent::class.java))
        assertNull(chooser.getParcelableArrayExtra(Intent.EXTRA_INITIAL_INTENTS, Intent::class.java))
        val target = chooser.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)!!
        assertNull(target.clipData)
        assertEquals(link, target.getStringExtra(Intent.EXTRA_TEXT))
    }

    @Test fun storiesIsInstagramsComposerWithTheStickerOverTheBackdrop() {
        val background = Uri.parse("content://com.resonance.stories.share/share/backdrop.jpg")
        val sticker = Uri.parse("content://com.resonance.stories.share/share/sticker.png")
        val intent = ShareIntents.stories("1115208464203859", background, sticker)
        assertEquals("com.instagram.share.ADD_TO_STORY", intent.action)
        assertEquals("com.instagram.android", intent.`package`)
        assertEquals("1115208464203859", intent.getStringExtra("source_application"))
        assertEquals(background, intent.data)
        assertEquals("image/jpeg", intent.type)
        assertEquals(sticker, intent.getParcelableExtra("interactive_asset_uri", Uri::class.java))
        assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        // No colours: Instagram ignores them under a background.
        assertFalse(intent.hasExtra("top_background_color"))
    }

    @Test fun aProfileIsSharedByItsLinkAlone() {
        val chooser = ShareIntents.profileChooser("https://resonance.channel/u/bob", "bob · Resonance")
        val target = chooser.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)!!
        assertEquals("text/plain", target.type)
        assertEquals("https://resonance.channel/u/bob", target.getStringExtra(Intent.EXTRA_TEXT))
        assertEquals("bob · Resonance", target.getStringExtra(Intent.EXTRA_TITLE))
        assertNull(target.clipData)
    }

    // The sheet's own actions

    private val share = SharedCard(link, "外婆的醃梅子", "plums", "resonance-plums.jpg", stories = true, metaAppId = "1115208464203859")

    /** Instagram on the device, its app icon and its Stories composer. */
    private fun installInstagram() {
        val pm = shadowOf(app.packageManager)
        val info = ApplicationInfo().apply { packageName = ShareIntents.INSTAGRAM; icon = 0x7f080001; name = "Instagram" }
        pm.installPackage(PackageInfo().apply { packageName = ShareIntents.INSTAGRAM; applicationInfo = info })
        val stories = ComponentName(ShareIntents.INSTAGRAM, "com.instagram.share.AddToStoryActivity")
        pm.addActivityIfNotPresent(stories)
        pm.addIntentFilterForActivity(stories, IntentFilter(ShareIntents.ADD_TO_STORY).apply { addCategory(Intent.CATEGORY_DEFAULT); addDataType("image/*") })
    }

    @Test fun onApi34TheActionsAreTheSheetsOwnStoriesThenSave() {
        installInstagram()
        val actions = ShareActionActivity.actions(app, share, sdk = 34)
        assertNull(actions.initial)
        val custom = actions.custom!!.map { it as ChooserAction }
        assertEquals(listOf(L10n.Share.toStories, L10n.Share.Image.save), custom.map { it.label.toString() })
        // Stories wears Instagram's own app icon; Save the app's picture glyph.
        assertEquals(ShareIntents.INSTAGRAM, custom[0].icon.resPackage)
        assertEquals(R.drawable.ic_share_save, custom[1].icon.resId)
        // Each reaches the app's own activity, told what to do with this share.
        val stories = shadowOf(custom[0].action).savedIntent
        assertEquals(ComponentName(app, ShareActionActivity::class.java), stories.component)
        assertEquals(ShareActionActivity.STORIES, stories.action)
        assertEquals(link, stories.getStringExtra(ShareActionActivity.EXTRA_LINK))
        assertEquals("1115208464203859", stories.getStringExtra(ShareActionActivity.EXTRA_APP_ID))
        val save = shadowOf(custom[1].action).savedIntent
        assertEquals(ShareActionActivity.SAVE, save.action)
        assertEquals("resonance-plums.jpg", save.getStringExtra(ShareActionActivity.EXTRA_IMAGE))
        assertTrue(shadowOf(custom[0].action).isImmutable)

        val chooser = ShareIntents.cardChooser(link, "外婆的醃梅子", picture, actions.custom, actions.initial)
        assertEquals(2, chooser.getParcelableArrayExtra(Intent.EXTRA_CHOOSER_CUSTOM_ACTIONS, ChooserAction::class.java)!!.size)
        assertFalse(chooser.hasExtra(Intent.EXTRA_INITIAL_INTENTS))
    }

    @Test fun beforeApi34TheActionsAreListedFirstAsLabeledIntents() {
        installInstagram()
        val actions = ShareActionActivity.actions(app, share, sdk = 33)
        assertNull(actions.custom)
        val initial = actions.initial!!.map { it as LabeledIntent }
        assertEquals(listOf(L10n.Share.toStories, L10n.Share.Image.save), initial.map { it.nonLocalizedLabel.toString() })
        assertEquals(ShareIntents.INSTAGRAM, initial[0].sourcePackage)
        assertEquals(0x7f080001, initial[0].iconResource)
        assertEquals(app.packageName, initial[1].sourcePackage)
        assertEquals(R.drawable.ic_share_save, initial[1].iconResource)
        assertEquals(ComponentName(app, ShareActionActivity::class.java), initial[0].component)
        assertEquals(ShareActionActivity.STORIES, initial[0].action)
        assertEquals(ShareActionActivity.SAVE, initial[1].action)
    }

    @Test fun withoutInstagramOrItsStickerOnlySaveIsOffered() {
        // Instagram isn't installed.
        assertEquals(listOf(L10n.Share.Image.save), ShareActionActivity.actions(app, share, sdk = 34).custom!!.map { (it as ChooserAction).label.toString() })
        installInstagram()
        // The sticker wasn't made (no Meta app id, or Instagram's composer missing when it was drawn).
        val noStories = share.copy(stories = false)
        assertEquals(listOf(L10n.Share.Image.save), ShareActionActivity.actions(app, noStories, sdk = 33).initial!!.map { (it as LabeledIntent).nonLocalizedLabel.toString() })
    }

    @Test fun theStoriesActionCopiesTheLinkThenOpensInstagramWithTheFilesGranted() {
        installInstagram()
        val dir = ShareFiles.dir(app).apply { mkdirs() }
        File(dir, ShareFiles.BACKDROP).writeBytes(byteArrayOf(1))
        File(dir, ShareFiles.STICKER).writeBytes(byteArrayOf(2))
        ShareFeedback.take()
        Robolectric.buildActivity(ShareActionActivity::class.java, ShareActionActivity.intent(app, ShareActionActivity.STORIES, share)).create()
        assertEquals(link, app.getSystemService(ClipboardManager::class.java).primaryClip!!.getItemAt(0).text.toString())
        val started = shadowOf(app).nextStartedActivity
        assertNotNull(started)
        assertEquals(ShareIntents.ADD_TO_STORY, started.action)
        assertEquals(ShareIntents.INSTAGRAM, started.`package`)
        assertEquals("1115208464203859", started.getStringExtra(ShareIntents.SOURCE_APPLICATION))
        assertEquals("content", started.data!!.scheme)
        assertEquals(ShareFiles.authority(app), started.data!!.authority)
        assertTrue(started.data!!.path!!.endsWith(ShareFiles.BACKDROP))
        assertTrue(started.getParcelableExtra(ShareIntents.INTERACTIVE_ASSET, Uri::class.java)!!.path!!.endsWith(ShareFiles.STICKER))
        assertNull(ShareFeedback.take())
    }

    @Test fun withoutItsFilesStoriesSaysItCouldNotOpenInstagram() {
        ShareFiles.clear(ShareFiles.dir(app))
        ShareFeedback.take()
        Robolectric.buildActivity(ShareActionActivity::class.java, ShareActionActivity.intent(app, ShareActionActivity.STORIES, share)).create()
        assertNull(shadowOf(app).nextStartedActivity)
        assertEquals(L10n.Share.Image.storiesFailed, ShareFeedback.take())
    }

    @Test fun aShareFileIsFoundOnlyInsideTheShareFolder() {
        assertEquals(File(ShareFiles.dir(app), "resonance-plums.jpg"), ShareFiles.file(app, "resonance-plums.jpg"))
        for (out in listOf("../prefs.xml", "a/b.jpg", ".hidden", "")) assertNull(out, ShareFiles.file(app, out))
        val dir = ShareFiles.dir(app).apply { mkdirs() }
        File(dir, "old.jpg").writeBytes(byteArrayOf(1))
        ShareFiles.clear(dir)
        assertArrayEquals(emptyArray<File>(), dir.listFiles())
    }
}
