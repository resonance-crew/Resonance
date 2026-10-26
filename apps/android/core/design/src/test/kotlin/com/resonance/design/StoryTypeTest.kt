package com.resonance.design

import android.graphics.Paint
import android.graphics.text.LineBreaker
import androidx.compose.ui.unit.em
import com.resonance.design.generated.Tokens
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * A story's type has one vocabulary (reading-type §3 and §8): every number comes from tokens.css's
 * "A story's type" — read here from the web's own file, not only from the generated Tokens — by
 * script and by window, the CJK story in Noto first (its title Noto Serif TC 600, its words Noto
 * Sans TC with their tracking, justified where the device can), the Latin story in Playfair over
 * DM Sans, ragged; and the CJK faces fall back per glyph to the Latin face, then the system.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryTypeTest {
    private val cjkPhone = StoryType(StoryScript.Cjk, compact = true)
    private val cjkWide = StoryType(StoryScript.Cjk, compact = false)
    private val latinPhone = StoryType(StoryScript.Latin, compact = true)
    private val latinWide = StoryType(StoryScript.Latin, compact = false)

    /** tokens.css's own `--name: N(px)?;`, as scripts/native/tokens.ts reads it. */
    private val css: Map<String, Float> by lazy {
        val text = File("../../../../src/styles/tokens.css").readText()
        Regex("""(--story-[a-z0-9-]+):\s*(-?[\d.]+)(?:px)?;""").findAll(text).associate { it.groupValues[1] to it.groupValues[2].toFloat() }
    }

    private fun token(name: String) = css[name] ?: error("tokens.css has no $name")

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
    }

    @Test fun aCjkStoryIsSetInTheCjkNumbers() {
        assertEquals(token("--story-size-compact"), cjkPhone.bodySize)
        assertEquals(token("--story-size"), cjkWide.bodySize)
        assertEquals(token("--story-leading-compact"), cjkPhone.bodyLeading)
        assertEquals(token("--story-leading"), cjkWide.bodyLeading)
        assertEquals(token("--story-tracking"), cjkWide.bodyTracking)
        assertEquals(token("--story-title-compact"), cjkPhone.titleSize)
        assertEquals(token("--story-title"), cjkWide.titleSize)
        assertEquals(token("--story-title-leading"), cjkWide.titleLeading)
        assertEquals(token("--story-heading-tracking"), cjkWide.headingTracking)
        assertEquals(token("--story-heading-weight").toInt(), cjkWide.headingWeight)
        assertEquals(AppFonts.Family.BodyCJK, cjkWide.bodyFamily)
        assertEquals(AppFonts.Family.HeadingCJK, cjkWide.headingFamily)
        assertTrue(cjkWide.justified)
    }

    @Test fun aLatinStoryIsSetInItsOwnNumbersWithoutTrackingAndRagged() {
        assertEquals(token("--story-size-latin-compact"), latinPhone.bodySize)
        assertEquals(token("--story-size-latin"), latinWide.bodySize)
        assertEquals(token("--story-leading-latin-compact"), latinPhone.bodyLeading)
        assertEquals(token("--story-leading-latin"), latinWide.bodyLeading)
        assertEquals(token("--story-title-latin-compact"), latinPhone.titleSize)
        assertEquals(token("--story-title-latin"), latinWide.titleSize)
        assertEquals(token("--story-title-leading-latin"), latinWide.titleLeading)
        assertEquals(token("--story-heading-weight-latin").toInt(), latinWide.headingWeight)
        assertEquals(0f, latinWide.bodyTracking)
        assertEquals(0f, latinWide.headingTracking)
        assertEquals(AppFonts.Family.Body, latinWide.bodyFamily)
        assertEquals(AppFonts.Family.Heading, latinWide.headingFamily)
        assertFalse(latinWide.justified)
    }

    @Test fun headingsAndGapsAreRatiosOfTheWordsTheySitAmong() {
        val body = cjkPhone.bodySize
        assertEquals(body * token("--story-h2"), cjkPhone.headingSize(1), 1e-4f)
        assertEquals(body * token("--story-h2"), cjkPhone.headingSize(2), 1e-4f)
        assertEquals(body * token("--story-h3"), cjkPhone.headingSize(3), 1e-4f)
        assertEquals(body * token("--story-h3"), cjkPhone.headingSize(6), 1e-4f)
        assertEquals(cjkPhone.headingSize(2) * token("--story-heading-above"), cjkPhone.headingAbove(2), 1e-4f)
        assertEquals(cjkPhone.headingSize(2) * token("--story-h2-below"), cjkPhone.headingBelow(2), 1e-4f)
        assertEquals(cjkPhone.headingSize(3) * token("--story-h3-below"), cjkPhone.headingBelow(3), 1e-4f)
        assertEquals(token("--story-heading-leading"), latinWide.headingLeading)
        assertEquals(body * token("--story-para-gap"), cjkPhone.paragraphGap, 1e-4f)
        assertEquals(body * token("--story-list-indent"), cjkPhone.listIndent, 1e-4f)
        assertEquals(body * token("--story-item-gap"), cjkPhone.itemGap, 1e-4f)
        assertEquals(body * token("--story-code"), cjkPhone.codeSize, 1e-4f)
        assertEquals(token("--story-bold").toInt(), cjkPhone.boldWeight)
    }

    @Test fun thePagesGapsTakeThePhonesNumbersOnAPhone() {
        assertEquals(token("--story-block-gap-compact"), cjkPhone.blockGap)
        assertEquals(token("--story-block-gap"), cjkWide.blockGap)
        assertEquals(token("--story-rule-gap-compact"), latinPhone.ruleGap)
        assertEquals(token("--story-rule-gap"), latinWide.ruleGap)
        assertEquals(token("--story-cover-gap-compact"), cjkPhone.coverGap)
        assertEquals(token("--story-cover-gap"), cjkWide.coverGap)
        assertEquals(token("--story-lead-gap-compact"), cjkPhone.leadGap)
        assertEquals(token("--story-lead-gap"), cjkWide.leadGap)
        assertEquals(token("--story-end-gap-compact"), cjkPhone.endGap)
        assertEquals(token("--story-end-gap"), cjkWide.endGap)
        assertEquals(token("--story-meta-size-compact"), cjkPhone.metaSize)
        assertEquals(token("--story-meta-size"), cjkWide.metaSize)
        assertEquals(token("--story-meta-gap"), cjkWide.metaGap)
        // Round 9 §2: title → byline 20 on a phone, 24 wider; byline → story 40 / 48; cover → title 24 / 32.
        assertEquals(token("--story-meta-gap-compact"), cjkPhone.metaGap)
        assertEquals(20f, cjkPhone.metaGap)
        assertEquals(24f, cjkWide.metaGap)
        assertEquals(40f, cjkPhone.leadGap)
        assertEquals(48f, cjkWide.leadGap)
        assertEquals(24f, cjkPhone.coverGap)
        assertEquals(32f, cjkWide.coverGap)
        // The meta line is 14 at every regular width (it used to be 13 everywhere).
        assertEquals(14f, cjkWide.metaSize)
        assertEquals(token("--story-byline-avatar"), cjkWide.bylineAvatar)
        assertEquals(token("--story-rail-gap"), cjkWide.railGap)
        // A window is a phone's only in the compact class.
        assertEquals(cjkPhone, StoryType.of(StoryScript.Cjk, LayoutClass.Compact))
        assertEquals(cjkWide, StoryType.of(StoryScript.Cjk, LayoutClass.Medium))
        assertEquals(cjkWide, StoryType.of(StoryScript.Cjk, LayoutClass.Expanded))
    }

    @Test fun theTitleAndHeadingsStandOnLiningFiguresWithNoNegativeTracking() = composed {
        val title = cjkPhone.titleStyle()
        assertEquals("lnum", title.fontFeatureSettings)
        assertEquals(0.02f.em, title.letterSpacing)
        assertEquals(AppFonts.family(AppFonts.Family.HeadingCJK, 600), title.fontFamily)
        assertEquals("lnum", latinWide.headingStyle(2).fontFeatureSettings)
        assertEquals(AppFonts.family(AppFonts.Family.Heading, 700), latinWide.headingStyle(2).fontFamily)
        assertEquals(0f.em, latinWide.titleStyle().letterSpacing)
        val words = cjkWide.bodyStyle()
        assertEquals(0.03f.em, words.letterSpacing)
        assertEquals(AppFonts.family(AppFonts.Family.BodyCJK, 400), words.fontFamily)
        assertEquals(Tokens.Text, words.color)
    }

    @Test fun aCjkParagraphIsJustifiedWhereTheDeviceCanAndBrokenStrictly() {
        assertEquals(LineBreaker.JUSTIFICATION_MODE_NONE, cjkWide.justificationMode(sdk = 34))
        assertEquals(LineBreaker.JUSTIFICATION_MODE_INTER_CHARACTER, cjkWide.justificationMode(sdk = 35))
        assertEquals(LineBreaker.JUSTIFICATION_MODE_NONE, latinWide.justificationMode(sdk = 36))
        assertFalse(cjkWide.strictLineBreaks(sdk = 32))
        assertTrue(cjkWide.strictLineBreaks(sdk = 33))
    }

    @Test fun aCjkFaceDrawsItsOwnLatinAndFallsBackToTheLatinFaceForWhatItLacks() {
        fun width(family: AppFonts.Family, weight: Int, text: String) =
            Paint().apply { typeface = AppFonts.typeface(family, weight); textSize = 100f }.measureText(text)
        // Noto TC draws ’ full-width (the half-em hole latinMarks exists for); Playfair and DM Sans draw it narrow.
        assertEquals(100f, width(AppFonts.Family.HeadingCJK, 600, "’"), 2f)
        assertTrue(width(AppFonts.Family.Heading, 700, "’") < 50f)
        assertEquals(100f, width(AppFonts.Family.BodyCJK, 400, "’"), 2f)
        // Latin letters in a CJK story are Noto's, not DM Sans's.
        assertNotEquals(width(AppFonts.Family.Body, 400, "Resonance"), width(AppFonts.Family.BodyCJK, 400, "Resonance"), 1f)
        // ŋ is outside the bundled Noto's subset: it comes from DM Sans, the next in the chain.
        assertEquals(width(AppFonts.Family.Body, 400, "ŋ"), width(AppFonts.Family.BodyCJK, 400, "ŋ"), 0.5f)
        // The apostrophe's Latin face is the element's own Latin family.
        assertEquals(AppFonts.Family.Body, AppFonts.Family.BodyCJK.latin)
        assertEquals(AppFonts.Family.Heading, AppFonts.Family.HeadingCJK.latin)
        assertEquals(AppFonts.Family.Body, AppFonts.Family.Body.latin)
    }

    @Test fun theCjkFacesKeepTheirBundledPrimaryWhenTheLatinFacesUseTheSystemsCjk() {
        val before = AppFonts.useBundledCJK
        try {
            AppFonts.useBundledCJK = false
            val paint = Paint().apply { typeface = AppFonts.typeface(AppFonts.Family.BodyCJK, 400); textSize = 100f }
            assertEquals(100f, paint.measureText("’"), 2f)
        } finally {
            AppFonts.useBundledCJK = before
        }
    }
}
