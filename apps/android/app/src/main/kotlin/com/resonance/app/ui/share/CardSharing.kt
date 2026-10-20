package com.resonance.app.ui.share

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.size.Size
import coil3.toBitmap
import com.resonance.api.models.CardDetail
import com.resonance.app.AppConfig
import com.resonance.app.ui.avatarSeedValue
import com.resonance.app.ui.mediumDate
import com.resonance.design.ShareByline
import com.resonance.design.ShareCardModel
import com.resonance.kit.story.SharePassages
import com.resonance.kit.story.StoryScripts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * What the card page's share glyph does (share.spec, Owner revision): one tap, straight to the
 * system sheet. It makes the card's 1080 × 1920 picture on the device first — the cover and the
 * author's photo as the page already has them (a cover that doesn't come at once is left out: the
 * card is drawn without one), the card recorded by [renderer] — writes it (and, when Instagram
 * Stories can be offered, the sticker and its backdrop) to [ShareFiles], and opens the sheet with
 * the link for the apps that take text, the picture for the ones that take only pictures, and the
 * app's own Stories and Save actions. When the picture can't be made, the sheet opens with the link
 * alone. [busy] while it is made (the glyph shows the pen loop).
 */
@Stable
class CardSharing(private val context: Context, private val config: AppConfig, val renderer: ShareCardRenderer) {
    var busy by mutableStateOf(false)
        private set

    suspend fun share(detail: CardDetail) {
        if (busy) return
        busy = true
        try {
            context.startActivity(sheet(detail))
        } catch (e: CancellationException) {
            throw e
        } catch (e: ActivityNotFoundException) {
            // No sheet on the device: nothing to open.
        } finally {
            busy = false
        }
    }

    /** The sheet for [detail]: with its picture and actions when they could be made, else the link alone. */
    private suspend fun sheet(detail: CardDetail): Intent {
        val card = detail.card
        val anonymous = detail.anonymous
        val key = ShareLinks.cardKey(card.id, card.slug, anonymous)
        val link = ShareLinks.card(config.origin, card.id, card.slug, anonymous)
        val title = card.title
        val stories = storiesOffered()
        val written = try {
            withTimeoutOrNull(PICTURE_MILLIS) { picture(detail, key, stories) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        if (written == null) return ShareIntents.cardChooser(link, title, image = null)
        val share = SharedCard(link, title, key, written.name, stories = written.stories, metaAppId = config.metaAppId)
        val actions = ShareActionActivity.actions(context, share)
        return ShareIntents.cardChooser(link, title, ShareFiles.uri(context, written.file), actions.custom, actions.initial)
    }

    /** Whether Instagram Stories can be offered: the app has a Meta app id and Instagram's Stories composer is installed. */
    private fun storiesOffered(): Boolean =
        config.metaAppId != null && ShareIntents.storiesProbe().resolveActivity(context.packageManager) != null

    private class Written(val file: java.io.File, val name: String, val stories: Boolean)

    /** Draws the card and writes its files (the share folder emptied first). */
    private suspend fun picture(detail: CardDetail, key: String, stories: Boolean): Written = coroutineScope {
        val card = detail.card
        val author = card.author?.takeUnless { detail.anonymous }
        val cover = async { card.imageUrl?.let { load(it, COVER_PX) } }
        val photo = async { author?.avatarUrl?.let { load(it, PHOTO_PX) } }
        val model = shareCardModel(detail, photo.await())
        val pictures = renderer.render(model, cover.await(), stories)
        withContext(Dispatchers.IO) {
            try {
                val dir = ShareFiles.dir(context)
                ShareFiles.clear(dir)
                val name = ShareLinks.imageName(key)
                val file = java.io.File(dir, name)
                ShareFiles.write(pictures.composite, file, png = false)
                val sticker = pictures.sticker
                val backdrop = pictures.backdrop
                val withStories = stories && sticker != null && backdrop != null
                if (withStories) {
                    ShareFiles.write(sticker!!, java.io.File(dir, ShareFiles.STICKER), png = true)
                    ShareFiles.write(backdrop!!, java.io.File(dir, ShareFiles.BACKDROP), png = false)
                }
                Written(file, name, withStories)
            } finally {
                pictures.recycle()
            }
        }
    }

    /** A picture the page shows, as a bitmap, if it comes within a moment (the page's own copy is usually in Coil's caches). */
    private suspend fun load(url: String, px: Int): ImageBitmap? = withTimeoutOrNull(IMAGE_MILLIS) {
        val request = ImageRequest.Builder(context).data(url).size(Size(px, px)).build()
        val result = SingletonImageLoader.get(context).execute(request)
        (result as? SuccessResult)?.image?.toBitmap()?.asImageBitmap()
    }

    companion object {
        /** How long a picture may take before the sheet opens with the link alone. */
        const val PICTURE_MILLIS = 4_000L
        /** How long the cover or the photo may take before the card is drawn without it. */
        const val IMAGE_MILLIS = 1_500L
        /** The cover's pixels at the composite's 3× (256 × 128 and its bleed). */
        const val COVER_PX = 900
        const val PHOTO_PX = 180
    }
}

/**
 * The share card a card page's [detail] draws: its title, its story's opening, its script, its
 * family and date — and its author only when it is named. An anonymous card's model holds no
 * person at all (ShareByline.Anonymous): its owner's own copy of the card names them, the picture
 * never does.
 */
fun shareCardModel(detail: CardDetail, photo: ImageBitmap? = null): ShareCardModel {
    val card = detail.card
    val author = card.author?.takeUnless { detail.anonymous }
    return ShareCardModel(
        cardId = card.id,
        title = card.title,
        words = SharePassages.opening(detail.story),
        script = StoryScripts.storyScript(card.title, detail.story),
        accentHue = card.accentHue,
        date = mediumDate(card.publishedAt),
        byline = if (author == null) ShareByline.Anonymous
            else ShareByline.Named(author.handle, author.initials, author.avatarSeedValue(), author.verified, photo),
    )
}
