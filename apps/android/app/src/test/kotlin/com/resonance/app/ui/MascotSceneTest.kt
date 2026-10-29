package com.resonance.app.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import com.resonance.design.MascotMarks
import com.resonance.design.borderedCardOutline
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.float
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

/**
 * The paper puppets' island is handed the screen as the web's ReadingScene (round 19): the feed's
 * cards near the view (a band's top as its wavy rule, its title and author row), its foot, and a
 * card page's story parts; the list's scroll is kept as one number across frames.
 */
class MascotSceneTest {
    private fun rect(x: Float, y: Float, w: Float, h: Float) = Rect(x, y, x + w, y + h)
    private fun JsonObject.rect(name: String) = get(name)!!.jsonObject.let { r -> listOf("x", "y", "w", "h").map { r[it]!!.jsonPrimitive.float } }

    @Test fun theFeedsCardsNearTheViewWithTheirRuleTitleAndAuthorRowAndItsFoot() {
        val parts = MascotScene.Parts(
            rects = mapOf(
                "card:b" to rect(0f, 500f, 400f, 480f),
                "card:b:title" to rect(38f, 820f, 200f, 24f),
                "card:b:foot:avatar" to rect(38f, 920f, 30f, 30f),
                "card:b:foot:name" to rect(78f, 920f, 60f, 18f),
                "card:a" to rect(0f, 20f, 400f, 480f),
                // Three screens down: not laid out for the island.
                "card:far" to rect(0f, 3000f, 400f, 480f),
                "more" to rect(150f, 1020f, 100f, 48f),
            ),
            edges = mapOf("card:b" to MascotMarks.BandRule(107.0)),
        )
        val scene = MascotScene.of(parts, 400f, 860f, rail = false)
        val cards = scene["cards"]!!.jsonArray.map { it.jsonObject }
        // Top to bottom, the far one left out.
        assertEquals(listOf(listOf(0f, 20f, 400f, 480f), listOf(0f, 500f, 400f, 480f)), cards.map { it.rect("box") })
        // Each by its card's id, so its places keep their names as the lazy list lays out other cards.
        assertEquals(listOf("a", "b"), cards.map { it["key"]!!.jsonPrimitive.content })
        // The first card's top is its box's (no rule), the second's its band's wavy rule, x ascending, about its top,
        // drawn in the light pen.
        assertEquals(null, cards[0]["top"])
        assertEquals(1.2f, cards[1]["pen"]!!.jsonPrimitive.float, 0.001f)
        // A band's only line is its top rule: no outline.
        assertEquals(null, cards[1]["outline"])
        val top = cards[1]["top"]!!.jsonArray.map { p -> p.jsonArray.map { it.jsonPrimitive.float } }
        assertTrue(top.size > 30)
        assertEquals(0f, top.first()[0], 0.01f)
        assertEquals(400f, top.last()[0], 0.01f)
        assertTrue(top.zipWithNext().all { (a, b) -> b[0] >= a[0] })
        assertTrue(top.all { abs(it[1] - 500f) <= 1.5f })
        assertEquals(listOf(listOf(38f, 920f, 30f, 30f), listOf(78f, 920f, 60f, 18f)), (cards[1]["foot"] as JsonArray).map { f -> f.jsonObject.let { r -> listOf("x", "y", "w", "h").map { r[it]!!.jsonPrimitive.float } } })
        assertEquals(listOf(150f, 1020f, 100f, 48f), scene.rect("more"))
        assertEquals(JsonNull, scene["end"])
        assertEquals(400f, scene["width"]!!.jsonPrimitive.float)
    }

    @Test fun aCardPagesStoryItsTitlesFirstLineBlocksInOrderAndTheResponseBar() {
        val parts = MascotScene.Parts(
            rects = mapOf(
                "column" to rect(200f, 0f, 680f, 2400f),
                "title" to rect(200f, 120f, 680f, 90f),
                "block:0010" to rect(200f, 600f, 680f, 120f),
                "block:0002" to rect(200f, 300f, 680f, 200f),
                "story" to rect(200f, 300f, 680f, 420f),
                "tags" to rect(200f, 760f, 300f, 30f),
                "respond" to rect(200f, 830f, 420f, 48f),
            ),
            // The first line's ink ends 300 dp into the title.
            titleLine = rect(0f, 0f, 300f, 44f),
        )
        val scene = MascotScene.of(parts, 1280f, 800f, rail = true)
        assertEquals(listOf(200f, 120f, 300f, 44f), scene["title"]!!.jsonObject.rect("firstLine"))
        assertEquals(listOf(300f, 600f), scene["paragraphs"]!!.jsonArray.map { it.jsonObject["y"]!!.jsonPrimitive.float })
        assertEquals(listOf(200f, 830f, 420f, 48f), scene.rect("respond"))
        // Above the bar: the tags' foot (and 2 more).
        assertEquals(792f, scene["respondCeiling"]!!.jsonPrimitive.float)
        // The rail stands in the margin right of the column.
        assertEquals(880f, scene.rect("rail")[0])
        assertEquals(0, scene["cards"]!!.jsonArray.size)
    }

    @Test fun theScrollIsReadOffAnItemBothFramesShow() {
        val tracker = ScrollTracker()
        tracker.moved(listOf("article" to 0, "a" to 900), density = 2f)
        // Up by 100 px: item "a" shows in both.
        tracker.moved(listOf("article" to -100, "a" to 800), density = 2f)
        assertEquals(50f, tracker.y)
        // The article gone above, "a" and "b" left: still read off "a".
        tracker.moved(listOf("a" to 400, "b" to 1300), density = 2f)
        assertEquals(250f, tracker.y)
        // A jump with nothing in common moves it by nothing.
        tracker.moved(listOf("z" to 0), density = 2f)
        assertEquals(250f, tracker.y)
    }

    @Test fun aBorderedCardIsHandedItsDrawnOutlineItsExtentTopAndPen() {
        // A tablet's grid card, laid out at (40, 300), 360 × 520: its outline wobbles round that frame.
        val frame = rect(40f, 300f, 360f, 520f)
        val seed = 3 * 77.0 + 13
        val parts = MascotScene.Parts(rects = mapOf("card:x" to frame), edges = mapOf("card:x" to MascotMarks.CardOutline(seed)))
        val card = MascotScene.of(parts, 1280f, 800f, rail = false)["cards"]!!.jsonArray.single().jsonObject
        assertEquals("x", card["key"]!!.jsonPrimitive.content)
        assertEquals(1.8f, card["pen"]!!.jsonPrimitive.float, 0.001f)
        // The drawn outline, as its frame draws it (the same function), sampled along its length.
        val drawn = MascotScene.outlinePoints(borderedCardOutline(360.0, 520.0, seed), 40f, 300f)
        val box = card.rect("box")
        // Its extent is the outline's own (past the frame by the wobble), its top and height the frame's.
        assertEquals(drawn.minOf { it.x }, box[0], 0.06f)
        assertEquals(drawn.maxOf { it.x } - drawn.minOf { it.x }, box[2], 0.11f)
        assertTrue(box[0] != 40f || box[2] != 360f)
        assertEquals(listOf(300f, 520f), listOf(box[1], box[3]))
        // Its top: one point every 6 from just inside the outline's left to its right, each the topmost drawn
        // point near it — the corners' arcs too (lower there), the wobble along the edge (a little either side of 300).
        val top = card["top"]!!.jsonArray.map { p -> p.jsonArray.map { it.jsonPrimitive.float } }
        assertEquals(box[0] + 1, top.first()[0], 1f)
        assertTrue(top.last()[0] >= box[0] + box[2] - 7)
        assertTrue(top.zipWithNext().all { (a, b) -> b[0] - a[0] == 6f })
        assertTrue(top.first()[1] > 310f && top.last()[1] > 310f)
        val middle = top.filter { it[0] in 120f..320f }.map { it[1] }
        assertTrue(middle.all { abs(it - 300f) < 6f })
        assertTrue(middle.any { abs(it - 300f) > 0.3f })
        // And the whole line, as drawn (its sides are where one slid out past them is cut).
        val outline = card["outline"]!!.jsonArray.map { p -> p.jsonArray.map { it.jsonPrimitive.float } }
        assertEquals(drawn.size, outline.size)
        assertTrue(outline.zip(drawn).all { (o, d) -> abs(o[0] - d.x) <= 0.051f && abs(o[1] - d.y) <= 0.051f })
        assertTrue(drawn.zipWithNext().all { (a, b) -> hypot(b.x - a.x, b.y - a.y) <= 4.5f })
        for ((x, y) in top.map { it[0] to it[1] }) {
            val column = drawn.filter { abs(it.x - x) <= 3 && abs(it.y - 300f) < 24 }
            if (column.isNotEmpty()) assertEquals(column.minOf { it.y }, y, 0.06f)
        }
    }

    @Test fun theTopContourTakesTheTopmostPointNearEachStep() {
        val pts = listOf(Offset(0f, 10f), Offset(2f, 8f), Offset(6f, 12f), Offset(7f, 30f), Offset(12f, 9f), Offset(40f, 50f))
        val top = MascotScene.topContour(pts, 0f, 18f, 10f)
        assertEquals(listOf(Offset(0f, 8f), Offset(6f, 12f), Offset(12f, 9f), Offset(18f, 9f)), top)
    }

    @Test fun settingsStripIsAFloorUnderItsHeadroomWithTheSwitchAboveAsleepOrAwake() {
        val switchAt = Rect(290f, -6f, 340f, 22f)
        val off = MascotScene.strip(352f, 104f, switchAt, asleep = true)
        assertEquals(352f, off["width"]!!.jsonPrimitive.float)
        // The web view: the strip and its headroom above it.
        assertEquals(128f, off["height"]!!.jsonPrimitive.float)
        val settings = off["settings"]!!.jsonObject
        assertEquals(listOf(0f, 24f, 352f, 104f), settings.rect("floor"))
        assertEquals(listOf(290f, -6f, 50f, 28f), settings.rect("control"))
        assertTrue(settings["asleep"]!!.jsonPrimitive.boolean)
        // Turned on: the same strip, awake.
        val on = MascotScene.strip(352f, 104f, switchAt, asleep = false)["settings"]!!.jsonObject
        assertFalse(on["asleep"]!!.jsonPrimitive.boolean)
        assertEquals(settings.rect("floor"), on.rect("floor"))
        // Before the switch is placed: no control yet.
        assertEquals(JsonNull, MascotScene.strip(352f, 104f, null, asleep = false)["settings"]!!.jsonObject["control"])
    }

    @Test fun theIslandsMessagesAreRead() {
        assertEquals(
            MascotMessage.Hits(listOf(Rect(10f, 20f, 40f, 60f), Rect(0f, 0f, 1f, 1f))),
            MascotMessage.parse("""{"type":"hits","rects":[[10,20,30,40],[0,0,1,1]]}"""),
        )
        assertEquals(MascotMessage.Hits(emptyList()), MascotMessage.parse("""{"type":"hits","rects":[]}"""))
        assertEquals(MascotMessage.Scrolled(-812.5), MascotMessage.parse("""{"type":"scrolled","y":-812.5}"""))
        // One this build doesn't know, or nonsense: nothing.
        assertNull(MascotMessage.parse("""{"type":"later","x":1}"""))
        assertNull(MascotMessage.parse("not json"))
    }
}
