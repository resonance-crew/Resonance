package com.resonance.design

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.graphics.fonts.FontStyle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel

/**
 * Each font file is mapped once and every weight instanced from that one buffer (A1): a face built
 * from the file's mapped bytes measures exactly as one built through the asset manager, weight by
 * weight — the variable ones by their `wght` instance, the handwriting face as it is — and the
 * faces AppFonts makes still do (here the test's asset manager can't hand out a descriptor, so
 * they come the asset manager's way: the fallback a compressed asset would take).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FontBuffersTest {
    private val app get() = RuntimeEnvironment.getApplication()

    @Before fun fonts() {
        AppFonts.init(app)
    }

    /** The file's bytes mapped as the app maps the stored asset: read-only, in place. */
    private fun mapped(asset: String): ByteBuffer = FileInputStream(File("../../../shared/fonts", asset)).use { input ->
        input.channel.map(FileChannel.MapMode.READ_ONLY, 0, input.channel.size())
    }

    private fun typeface(font: Font, weight: Int): Typeface =
        Typeface.CustomFallbackBuilder(FontFamily.Builder(font).build()).setStyle(FontStyle(weight, FontStyle.FONT_SLANT_UPRIGHT)).build()

    private fun width(typeface: Typeface, text: String) = Paint().apply { this.typeface = typeface; textSize = 100f }.measureText(text)

    @Test fun aWeightFromTheMappedFileMeasuresAsTheAssetsOwn() {
        for ((asset, weights) in listOf(
            "DMSans.ttf" to listOf(400, 500, 600, 700),
            "PlayfairDisplay.ttf" to listOf(400, 700),
            "NotoSansTC.ttf" to listOf(400, 700),
            "NotoSerifTC.ttf" to listOf(600, 700),
            "ChenYuluoyanThin.ttf" to listOf(400),
        )) {
            val bytes = mapped(asset)
            val sample = "Resonance 共振的故事 0123"
            for (weight in weights) {
                val expected = width(typeface(AppFonts.buildFont(null, asset, weight), weight), sample)
                assertEquals("$asset $weight", expected, width(typeface(AppFonts.buildFont(bytes, asset, weight), weight), sample), 0.001f)
            }
            // One buffer serves every weight, each its own instance: the heavier is wider.
            if (weights.size > 1) {
                assertTrue(asset, width(typeface(AppFonts.buildFont(bytes, asset, weights.last()), weights.last()), sample) >
                    width(typeface(AppFonts.buildFont(bytes, asset, weights.first()), weights.first()), sample))
            }
        }
    }

    @Test fun theFacesStillComeWhenAFileCantBeMapped() {
        val latin = "Resonance"
        assertTrue(width(AppFonts.typeface(AppFonts.Family.Body, 700), latin) > width(AppFonts.typeface(AppFonts.Family.Body, 400), latin))
        assertEquals(100f, width(AppFonts.typeface(AppFonts.Family.BodyCJK, 400), "共"), 2f)
    }
}
