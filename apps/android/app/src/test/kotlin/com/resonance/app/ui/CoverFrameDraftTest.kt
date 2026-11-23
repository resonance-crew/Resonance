package com.resonance.app.ui

import com.resonance.app.DraftService
import com.resonance.app.DraftValues
import com.resonance.app.thoughtmap.ThoughtMapService
import com.resonance.design.CoverFraming
import com.resonance.app.draftUpdate
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * A cover's frame in the writer (round 25 §G1, §G2): read from a draft's `media.frame` (a malformed one is the
 * centre), written by 調整位置's 完成 into the draft and shown on the preview at once, cleared by a new picture or by
 * removing it, and never set on a card without a cover; the map's thumb and the feed's cards read it too.
 */
class CoverFrameDraftTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val store = WriterStepsTest.FakeStore()
    private val calls = WriterStepsTest.FakeCalls()
    private val editor = WriterStepsTest.FakeEditor()

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private val framed = mapOf("cx" to 0.3, "cy" to 0.6, "zoom" to 1.4, "ar" to 1.5)

    @Test fun aDraftsFrameIsReadFromItsMediaAndAMalformedOneIsTheCentre() {
        val withFrame = DraftService.draftValues(mapOf("media" to mapOf("type" to "image", "url" to "https://img.example/a.jpg", "label" to "a", "frame" to framed)))
        assertEquals(CoverFraming(0.3, 0.6, 1.4, 1.5), withFrame.imageFrame)
        val bad = DraftService.draftValues(mapOf("media" to mapOf("type" to "image", "url" to "https://img.example/a.jpg", "frame" to framed + ("zoom" to 9.0))))
        assertNull(bad.imageFrame)
        assertNull(DraftService.draftValues(mapOf("media" to mapOf("type" to "image", "url" to "https://img.example/a.jpg"))).imageFrame)
    }

    @Test fun doneWritesTheFrameIntoTheDraftAndANewPictureOrNoneClearsIt() {
        val opened = DraftService.OpenedCard(
            "d1", DraftValues(title = "雨中散步", story = "那天下午雨停了。", imageUrl = "https://img.example/a.jpg", imageLabel = "cover.jpg", accentHue = 30.0),
            isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false,
        )
        val m = WriteModel(store, calls, null, editor, opened, WriterStep.Publish, scope, reachedOut = {}, locale = { "zh-TW" })
        val frame = CoverFraming(0.3, 0.6, 1.4, 1.5)
        m.setCoverFrame(frame)
        assertEquals(frame, m.values.imageFrame)
        // The preview draws it at once; the card's colour stays the whole picture's.
        assertEquals(frame, previewContent(m, null).imageFrame)
        assertEquals(30.0, m.values.accentHue)
        // Removing the picture takes its frame with it; with no picture, nothing can be framed.
        m.removeCover()
        assertNull(m.values.imageFrame)
        m.setCoverFrame(frame)
        assertNull(m.values.imageFrame)
    }

    /**
     * Round 32 §P5: an illustration (the generate route's picture, labelled as one, its `-w960` copy beside it) is framed
     * as a photo is — the frame in the draft, on the preview, in both writes (the merge's `media.frame`, the contract's
     * `DraftMedia.frame`), its small copy kept.
     */
    @Test fun anIllustrationsFrameGoesWhereAPhotosGoes() {
        val ai = "https://img.resonance.channel/image/2026-11/0b6c.webp"
        val opened = DraftService.OpenedCard(
            "d1",
            DraftValues(
                title = "放鬆的心才接得住靈感", story = "那天下午雨停了。", imageUrl = ai, imageLabel = L10n.Write.mediaGeneratedLabel,
                accentHue = 30.0, imageThumbUrl = "https://img.resonance.channel/image/2026-11/0b6c-w960.webp",
                imageFrame = CoverFraming(0.5, 0.4, 1.2, 1.5),
            ),
            isPublished = true, slug = "s", referenceCardId = null, hasPendingEdit = false,
        )
        val m = WriteModel(store, calls, null, editor, opened, WriterStep.Publish, scope, reachedOut = {}, locale = { "zh-TW" })
        val frame = CoverFraming(0.2, 0.7, 1.8, 1.5)
        m.setCoverFrame(frame)
        assertEquals(frame, m.values.imageFrame)
        assertEquals(frame, previewContent(m, null).imageFrame)
        @Suppress("UNCHECKED_CAST")
        val media = draftUpdate(m.values)["media"] as Map<String, Any?>
        assertEquals(frame.toMap(), media["frame"])
        val sent = DraftService.draftMedia(m.values)!!
        assertEquals(frame.cx, sent.frame!!.cx, 0.0)
        assertEquals(frame.zoom, sent.frame!!.zoom, 0.0)
        assertEquals("https://img.resonance.channel/image/2026-11/0b6c-w960.webp", sent.thumbUrl)
    }

    @Test fun theMapsThumbReadsTheFrameOfAPictureCover() {
        val card = ThoughtMapService.mapCardOf("c1", mapOf("media" to mapOf("type" to "image", "url" to "https://img.example/a.jpg", "frame" to framed)))!!
        assertEquals(CoverFraming(0.3, 0.6, 1.4, 1.5), card.mediaFrame)
    }
}
