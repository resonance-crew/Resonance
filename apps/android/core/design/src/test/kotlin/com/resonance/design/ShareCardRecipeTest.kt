package com.resonance.design

import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.kit.story.StoryScript
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.File

/**
 * The share card is drawn from the web's one recipe (share.spec §4.5): every number of
 * native/fixtures/share-card.json — written from src/lib/share/shareCard.ts — is the one
 * ShareCardRecipe holds, every story token it names resolves to the value the story's own type
 * takes (StoryType, from tokens.css), and the colours are the card's family as the feed's cards
 * wear it.
 */
@RunWith(RobolectricTestRunner::class)
class ShareCardRecipeTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File("../../../../native/fixtures/share-card.json").readText()).jsonObject

    private fun at(vararg path: String): JsonElement = path.fold(fixture as JsonElement) { e, key -> e.jsonObject.getValue(key) }
    private fun num(vararg path: String): Double = at(*path).jsonPrimitive.double
    private fun text(vararg path: String): String = at(*path).jsonPrimitive.content

    /** A number of the recipe, or the story token it names, as the story's own type resolves it. */
    private fun value(e: JsonElement, script: StoryScript): Double {
        val p = e.jsonPrimitive
        if (!p.isString) return p.double
        val type = StoryType(script, compact = false)
        return when (p.content) {
            "--story-heading-weight", "--story-heading-weight-latin" -> type.headingWeight.toDouble()
            "--story-heading-tracking" -> type.headingTracking.toDouble()
            "--story-tracking" -> type.bodyTracking.toDouble()
            "--story-title-leading", "--story-title-leading-latin" -> type.titleLeading.toDouble()
            "--story-leading", "--story-leading-latin" -> type.bodyLeading.toDouble()
            else -> error("share-card.json names ${p.content}, which StoryType doesn't")
        }
    }

    private fun near(expected: Double, actual: Number, what: String) = assertEquals(what, expected, actual.toDouble(), 1e-4)

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
    }

    @Test fun theCanvasAndTheCardAreTheWebsNumbers() {
        near(num("canvas", "width"), ShareCardRecipe.Canvas.WIDTH, "canvas width")
        near(num("canvas", "height"), ShareCardRecipe.Canvas.HEIGHT, "canvas height")
        near(num("canvas", "scale"), ShareCardRecipe.Canvas.SCALE, "scale")
        near(num("canvas", "jpegQuality"), ShareCardRecipe.Canvas.JPEG_QUALITY, "jpeg quality")
        near(num("safeZone", "top"), ShareCardRecipe.SafeZone.TOP, "safe top")
        near(num("safeZone", "bottom"), ShareCardRecipe.SafeZone.BOTTOM, "safe bottom")
        near(num("backdrop", "grain"), ShareCardRecipe.Backdrop.GRAIN, "backdrop grain")
        assertEquals(text("backdrop", "grainTile"), ShareCardRecipe.Backdrop.GRAIN_TILE)
        near(num("card", "width"), ShareCardRecipe.Card.WIDTH, "card width")
        near(num("card", "maxHeight"), ShareCardRecipe.Card.MAX_HEIGHT, "card max height")
        near(num("card", "padding"), ShareCardRecipe.Card.PADDING, "padding")
        near(num("card", "paddingBottom"), ShareCardRecipe.Card.PADDING_BOTTOM, "padding bottom")
        near(num("card", "radius"), ShareCardRecipe.Card.RADIUS, "radius")
        near(num("card", "outline", "magnitude"), ShareCardRecipe.Card.OUTLINE_MAGNITUDE, "magnitude")
        val outline = ShareCardRecipe.Card.OUTLINE
        val h = at("card", "outline", "segmentsH").jsonArray.map { it.jsonPrimitive.int }
        val v = at("card", "outline", "segmentsV").jsonArray.map { it.jsonPrimitive.int }
        assertEquals(SegValue.Range(h[0], h[1]), outline.segmentsH)
        assertEquals(SegValue.Range(v[0], v[1]), outline.segmentsV)
        near(num("card", "outline", "curve"), outline.curve!!, "curve")
        near(num("card", "outline", "cornerJitter"), outline.cornerJitter!!, "corner jitter")
        near(num("card", "outline", "cornerOffset"), outline.cornerOffset!!, "corner offset")
        near(num("card", "paper", "grain"), ShareCardRecipe.Card.PAPER_GRAIN, "paper grain")
        assertEquals(text("card", "paper", "grainTile"), ShareCardRecipe.Card.PAPER_GRAIN_TILE)
        near(num("card", "pen", "width"), ShareCardRecipe.Card.PEN_WIDTH, "pen")
        near(num("cover", "ratio"), ShareCardRecipe.Cover.RATIO, "cover ratio")
        near(num("cover", "seedOffset"), ShareCardRecipe.Cover.SEED_OFFSET, "cover seed")
        near(num("cover", "grain"), ShareCardRecipe.Cover.GRAIN, "cover grain")
        near(num("cover", "gapBelow"), ShareCardRecipe.Cover.GAP_BELOW, "cover gap")
    }

    @Test fun theTitleAndTheWordsKeepTheirSizesAndLineBudgets() {
        near(num("title", "withCover", "size"), ShareCardRecipe.Title.SIZE_WITH_COVER, "title with cover")
        near(num("title", "withCover", "maxLines"), ShareCardRecipe.Title.MAX_LINES_WITH_COVER, "title lines with cover")
        near(num("title", "withoutCover", "size"), ShareCardRecipe.Title.SIZE_WITHOUT_COVER, "title without cover")
        near(num("title", "withoutCover", "maxLines"), ShareCardRecipe.Title.MAX_LINES_WITHOUT_COVER, "title lines without cover")
        near(num("title", "gapBelow"), ShareCardRecipe.Title.GAP_BELOW, "title gap")
        near(num("words", "size"), ShareCardRecipe.Words.SIZE, "words size")
        near(num("words", "withCover", "maxLines"), ShareCardRecipe.Words.MAX_LINES_WITH_COVER, "words with cover")
        near(num("words", "withoutCover", "maxLines"), ShareCardRecipe.Words.MAX_LINES_WITHOUT_COVER, "words without cover")
        near(num("words", "gapBelow"), ShareCardRecipe.Words.GAP_BELOW, "words gap")
        assertEquals("opening", text("words", "text"))
    }

    @Test fun theTypeIsTheStorysOwnByItsScript() {
        val faces = mapOf(
            "--font-story-serif" to AppFonts.Family.HeadingCJK,
            "--font-story-sans" to AppFonts.Family.BodyCJK,
            "--font-heading" to AppFonts.Family.Heading,
            "--font-body" to AppFonts.Family.Body,
        )
        for ((name, script) in listOf("cjk" to StoryScript.Cjk, "latin" to StoryScript.Latin)) {
            val title = at("title", "type", name).jsonObject
            val style = ShareCardRecipe.titleStyle(script, ShareCardRecipe.Title.SIZE_WITHOUT_COVER)
            val type = StoryType(script, compact = false)
            assertEquals(name, faces.getValue(title.getValue("face").jsonPrimitive.content), type.headingFamily)
            assertEquals(name, AppFonts.family(type.headingFamily, value(title.getValue("weight"), script).toInt()), style.fontFamily)
            near(value(title.getValue("tracking"), script), style.letterSpacing.value, "$name title tracking")
            near(value(title.getValue("leading"), script), style.lineHeight.value, "$name title leading")
            assertEquals("lining", title.getValue("figures").jsonPrimitive.content)
            assertEquals("lnum", style.fontFeatureSettings)

            val words = at("words", "type", name).jsonObject
            val body = ShareCardRecipe.wordsStyle(script)
            assertEquals(name, faces.getValue(words.getValue("face").jsonPrimitive.content), type.bodyFamily)
            assertEquals(name, AppFonts.family(type.bodyFamily, value(words.getValue("weight"), script).toInt()), body.fontFamily)
            near(value(words.getValue("tracking"), script), body.letterSpacing.value, "$name words tracking")
            near(value(words.getValue("leading"), script), body.lineHeight.value, "$name words leading")
            val align = words.getValue("align").jsonPrimitive.content
            assertEquals(name, if (align == "justify") TextAlign.Justify else TextAlign.Start, body.textAlign)
        }
        // The CJK title's tracking is the story's +0.02em: never the old −0.015.
        assertEquals(0.02f.em, ShareCardRecipe.titleStyle(StoryScript.Cjk, 22f).letterSpacing)
    }

    @Test fun theRuleTheBylineAndTheLockupAreTheWebs() = composed {
        near(num("rule", "height"), ShareCardRecipe.Rule.HEIGHT, "rule height")
        near(num("rule", "width"), ShareCardRecipe.Rule.WIDTH, "rule width")
        near(num("rule", "seedOffset"), ShareCardRecipe.Rule.SEED_OFFSET, "rule seed")
        near(num("rule", "amplitude"), ShareCardRecipe.Rule.AMPLITUDE, "rule amplitude")
        near(num("rule", "steps"), ShareCardRecipe.Rule.STEPS, "rule steps")
        near(num("rule", "gapBelow"), ShareCardRecipe.Rule.GAP_BELOW, "rule gap")
        near(num("byline", "height"), ShareCardRecipe.Byline.HEIGHT, "byline height")
        near(num("byline", "avatar", "size"), ShareCardRecipe.Byline.AVATAR, "avatar")
        assertEquals(text("byline", "avatar", "outline"), ShareCardRecipe.Byline.AVATAR_OUTLINE)
        near(num("byline", "avatar", "width"), ShareCardRecipe.Byline.AVATAR_WIDTH, "avatar pen")
        near(num("byline", "gap"), ShareCardRecipe.Byline.GAP, "byline gap")
        near(num("byline", "name", "size"), ShareCardRecipe.Byline.NAME_SIZE, "name size")
        near(num("byline", "name", "weight"), ShareCardRecipe.Byline.NAME_WEIGHT, "name weight")
        near(num("byline", "name", "leading"), ShareCardRecipe.Byline.NAME_LEADING, "name leading")
        near(num("byline", "verifiedMark", "size"), ShareCardRecipe.Byline.VERIFIED_SIZE, "verified size")
        near(num("byline", "verifiedMark", "gap"), ShareCardRecipe.Byline.VERIFIED_GAP, "verified gap")
        near(num("byline", "date", "size"), ShareCardRecipe.Byline.DATE_SIZE, "date size")
        near(num("byline", "date", "weight"), ShareCardRecipe.Byline.DATE_WEIGHT, "date weight")
        near(num("byline", "minSpace"), ShareCardRecipe.Byline.MIN_SPACE, "min space")
        assertEquals(text("anonymous", "avatar", "initials"), ShareCardRecipe.Anonymous.INITIALS)
        near(num("anonymous", "avatar", "seed"), ShareCardRecipe.Anonymous.SEED, "anonymous seed")
        assertEquals("--color-cream-dark", text("anonymous", "avatar", "fill"))
        assertEquals(Tokens.CreamDark, ShareCardRecipe.Anonymous.FILL)
        assertEquals("card.anonymousAuthor", text("anonymous", "name", "message"))
        assertEquals(Tokens.TextMuted, ShareCardRecipe.Anonymous.NAME_COLOUR)
        assertEquals(text("lockup", "wave", "icon"), ShareCardRecipe.Lockup.WAVE.key)
        near(num("lockup", "wave", "size"), ShareCardRecipe.Lockup.WAVE_SIZE, "wave size")
        near(num("lockup", "wave", "width"), ShareCardRecipe.Lockup.WAVE_WIDTH, "wave pen")
        near(num("lockup", "gap"), ShareCardRecipe.Lockup.GAP, "lockup gap")
        assertEquals(text("lockup", "wordmark", "text"), ShareCardRecipe.Lockup.WORDMARK)
        near(num("lockup", "wordmark", "size"), ShareCardRecipe.Lockup.WORDMARK_SIZE, "wordmark size")
        near(num("lockup", "wordmark", "weight"), ShareCardRecipe.Lockup.WORDMARK_WEIGHT, "wordmark weight")
        near(num("lockup", "wordmark", "tracking"), ShareCardRecipe.Lockup.WORDMARK_TRACKING, "wordmark tracking")
        assertEquals(text("lockup", "domain", "text"), ShareCardRecipe.Lockup.DOMAIN)
        near(num("lockup", "domain", "size"), ShareCardRecipe.Lockup.DOMAIN_SIZE, "domain size")
        near(num("lockup", "domain", "weight"), ShareCardRecipe.Lockup.DOMAIN_WEIGHT, "domain weight")
        near(num("lockup", "domain", "tracking"), ShareCardRecipe.Lockup.DOMAIN_TRACKING, "domain tracking")
        near(num("sticker", "margin"), ShareCardRecipe.Sticker.MARGIN, "sticker margin")
        near(num("sticker", "scale"), ShareCardRecipe.Sticker.SCALE, "sticker scale")
        near(num("storiesBackground", "width"), ShareCardRecipe.StoriesBackground.WIDTH, "background width")
        near(num("storiesBackground", "height"), ShareCardRecipe.StoriesBackground.HEIGHT, "background height")
        // The sticker is the card and its margins at @2: 624 px wide.
        assertEquals(624f, (ShareCardRecipe.Card.WIDTH + 2 * ShareCardRecipe.Sticker.MARGIN) * ShareCardRecipe.Sticker.SCALE)
    }

    @Test fun theColoursAreTheCardsFamily() = composed {
        // A cover's family wins; without one the id fixes it, as the web's sharePalette does.
        assertEquals(CardPalette.nearest(140.0), ShareCardRecipe.palette("any", 140.0).index)
        assertEquals(Math.floorMod(seedFromId("c1").toInt(), CardPalette.HUES.size), ShareCardRecipe.palette("c1", null).index)
        assertEquals(seedFromId("c1"), ShareCardRecipe.seed("c1"), 0.0)
        val p = ShareCardRecipe.palette("c1", null)
        assertEquals(OklchColor.parse("oklch(${num("card", "paper", "lightness").toBigDecimal().stripTrailingZeros().toPlainString()}% ${num("card", "paper", "chroma")} ${p.hue})"), p.interior)
        val rule = at("rule", "colour").jsonObject
        val ruleCss = "oklch(${rule.num("lightness")}% ${rule.num("chroma")} ${p.hue} / ${rule.num("alpha")})"
        assertEquals(OklchColor.parse(ruleCss), p.separator)
        assertEquals("cardFill", text("backdrop", "fill"))
        assertEquals("cardBorder", text("card", "pen", "colour"))
    }

    private fun JsonObject.num(key: String): String = (getValue(key) as JsonPrimitive).content
}
