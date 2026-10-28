package com.resonance.app.ui

import androidx.compose.ui.geometry.Rect
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.float
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

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
            rules = mapOf("card:b" to 107.0),
        )
        val scene = MascotScene.of(parts, 400f, 860f, rail = false)
        val cards = scene["cards"]!!.jsonArray.map { it.jsonObject }
        // Top to bottom, the far one left out.
        assertEquals(listOf(listOf(0f, 20f, 400f, 480f), listOf(0f, 500f, 400f, 480f)), cards.map { it.rect("box") })
        // The first card's top is its box's (no rule), the second's its band's wavy rule, x ascending, about its top.
        assertEquals(null, cards[0]["top"])
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
}
