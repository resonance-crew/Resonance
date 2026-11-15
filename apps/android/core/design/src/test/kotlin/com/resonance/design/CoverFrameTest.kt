package com.resonance.design

import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.roundToInt

/**
 * A cover's frame (round 25 §G1, §G3): [coverCrop] answers every case of native/fixtures/cover-frame.json as the web's
 * coverCrop wrote it (and iOS reads it too); [CoverFit] draws that crop; the one crop stage's maths turns a framed
 * state into the card's frame and back, keeps its place when the stage changes size, slides on a multiplying scale,
 * and is never taller than the window less 200.
 */
class CoverFrameTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File("../../../../native/fixtures/cover-frame.json").readText()).jsonObject

    @Test fun everyFixtureCaseIsCutAsTheWebCutsIt() {
        val cases = fixture.getValue("cases").jsonArray
        assertTrue(cases.size >= 100)
        for (c in cases) {
            val o = c.jsonObject
            val name = o.getValue("name").jsonPrimitive.content
            val f = o.getValue("frame")
            val frame = if (f is JsonNull) null else f.jsonObject.let {
                CoverFraming(it.num("cx"), it.num("cy"), it.num("zoom"), it.num("ar"))
            }
            val got = coverCrop(o.num("ar"), frame, o.num("boxRatio"))
            val want = o.getValue("crop").jsonObject
            assertEquals("$name x", want.num("x"), got.x, 1e-5)
            assertEquals("$name y", want.num("y"), got.y, 1e-5)
            assertEquals("$name w", want.num("w"), got.w, 1e-5)
            assertEquals("$name h", want.num("h"), got.h, 1e-5)
        }
    }

    private fun JsonObject.num(k: String) = getValue(k).jsonPrimitive.double

    @Test fun aStoredFrameIsReadOnlyWhenTheRulesWouldTakeIt() {
        assertEquals(CoverFraming(0.3, 0.7, 1.5, 1.5), CoverFraming.of(mapOf("cx" to 0.3, "cy" to 0.7, "zoom" to 1.5, "ar" to 1.5)))
        assertEquals(CoverFraming(0.0, 1.0, 1.0, 1.0), CoverFraming.of(mapOf("cx" to 0L, "cy" to 1L, "zoom" to 1L, "ar" to 1L)))
        assertNull(CoverFraming.of(mapOf("cx" to 0.3, "cy" to 0.7, "zoom" to 2.5, "ar" to 1.5)))
        assertNull(CoverFraming.of(mapOf("cx" to 0.3, "cy" to 0.7, "zoom" to 1.5)))
        assertNull(CoverFraming.of(mapOf("cx" to 0.3, "cy" to 0.7, "zoom" to 1.5, "ar" to 1.5, "x" to 1)))
        assertNull(CoverFraming.of(null as Map<*, *>?))
        assertEquals(mapOf("cx" to 0.3, "cy" to 0.7, "zoom" to 1.5, "ar" to 1.5), CoverFraming(0.3, 0.7, 1.5, 1.5).toMap())
    }

    @Test fun aFramedCoverIsDrawnOnItsCropAndAnUnframedOneCentredAsBefore() {
        assertSame(ContentScale.Crop, CoverFit.scale(null))
        assertSame(Alignment.Center, CoverFit.alignment(null))
        // A 2000 × 1000 picture in a 620 × 384.4 (0.62) box, framed left of centre at zoom 1.5.
        val frame = CoverFraming(0.3, 0.4, 1.5, 2.0)
        val fit = CoverFit(frame)
        val src = Size(2000f, 1000f)
        val dst = Size(620f, 384.4f)
        val crop = coverCrop(2.0, frame, 384.4 / 620)
        val s = fit.computeScaleFactor(src, dst).scaleX
        assertEquals(620.0 / (crop.w * 2000), s.toDouble(), 1e-4)
        val drawn = IntSize((2000 * s).roundToInt(), (1000 * s).roundToInt())
        val at = fit.align(drawn, IntSize(620, 384), LayoutDirection.Ltr)
        assertEquals(-(crop.x * drawn.width), at.x.toDouble(), 1.0)
        assertEquals(-(crop.y * drawn.height), at.y.toDouble(), 1.0)
    }

    @Test fun theStagesStateIsTheCardsFrameAndBack() {
        // A 3000 × 2000 picture under the feed card's 0.62 frame, 432 wide.
        val crop = FrameCrop(3000.0, 2000.0, 432.0, 432.0 * 0.62, CoverFraming.MAX_ZOOM)
        assertEquals(CoverFraming(0.5, 0.5, 1.0, 1.5), crop.framing(CropState()))
        val moved = crop.pan(crop.zoomTo(CropState(), 1.6), 80.0, -20.0)
        val frame = crop.framing(moved)
        // What the stage shows is what coverCrop cuts for that frame at the frame's own ratio.
        val shown = crop.cropFractions(moved)
        val cut = coverCrop(1.5, frame, 0.62)
        assertEquals(cut.x, shown.x, 1e-9)
        assertEquals(cut.y, shown.y, 1e-9)
        assertEquals(cut.w, shown.w, 1e-9)
        assertEquals(cut.h, shown.h, 1e-9)
        // And back: the frame opens where it was left.
        val again = crop.stateOf(frame)
        assertEquals(moved.z, again.z, 1e-9)
        assertEquals(moved.ox, again.ox, 1e-9)
        assertEquals(moved.oy, again.oy, 1e-9)
        assertEquals(CropState(), crop.stateOf(null))
        // The cover zooms 1…2.
        assertEquals(2.0, crop.zoomTo(CropState(), 3.0).z, 1e-9)
    }

    @Test fun theStageKeepsThePicturesPlaceWhenItChangesSize() {
        val wide = FrameCrop(3000.0, 2000.0, 432.0, 432.0 * 0.62, 2.0)
        val narrow = FrameCrop(3000.0, 2000.0, 300.0, 300.0 * 0.62, 2.0)
        val state = wide.pan(wide.zoomTo(CropState(), 1.4), 60.0, 10.0)
        val kept = narrow.clamp(FrameCrop.resized(state, 432.0, 300.0))
        val before = wide.framing(state)
        val after = narrow.framing(kept)
        assertEquals(before.cx, after.cx, 1e-9)
        assertEquals(before.cy, after.cy, 1e-9)
        assertEquals(before.zoom, after.zoom, 1e-9)
    }

    @Test fun theSliderSlidesOnAMultiplyingScale() {
        // Equal slides multiply the zoom by equal factors: 1 → 2 is as far as 2 → 4.
        val one = FrameCrop.sliderOf(1.0)
        val two = FrameCrop.sliderOf(2.0)
        val four = FrameCrop.sliderOf(4.0)
        assertEquals(two - one, four - two, 1e-6f)
        assertEquals(2.0, FrameCrop.zoomOf(two), 1e-6)
    }

    @Test fun theCoverStageIsAtMost480AndNeverTallerThanTheWindowLess200() {
        // A phone upright: its dialog's width.
        assertEquals(343f, cropStageWidth(343f, 800f, COVER_STAGE_MAX, 0.62f), 1e-3f)
        // A tablet: 480 at most.
        assertEquals(480f, cropStageWidth(700f, 1200f, COVER_STAGE_MAX, 0.62f), 1e-3f)
        // A phone held sideways (411 tall): the stage's height (w − 48) × 0.62 + 48 stays within 211.
        val w = cropStageWidth(800f, 411f, COVER_STAGE_MAX, 0.62f)
        assertEquals(211f, (w - 48f) * 0.62f + 48f, 1e-3f)
    }
}
