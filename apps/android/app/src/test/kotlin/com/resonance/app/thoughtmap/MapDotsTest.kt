package com.resonance.app.thoughtmap

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The thought map's dotted paper is the web's at every zoom (native/fixtures/map-dots.json, which
 * src/components/molecules/ThoughtMap/mapDots.test.ts writes from mapDots.ts and iOS reads too).
 */
class MapDotsTest {
    private val fixture: JsonObject = Json.parseToJsonElement(File("../../../native/fixtures/map-dots.json").readText()).jsonObject

    @Test
    fun theConstantsAreTheWebs() {
        assertEquals(fixture.getValue("grid").jsonPrimitive.double, MapDots.GRID, 0.0)
        assertEquals(fixture.getValue("levels").jsonPrimitive.int, MapDots.LEVELS)
        assertEquals(fixture.getValue("radius").jsonPrimitive.double, MapDots.RADIUS, 0.0)
        assertEquals(fixture.getValue("edge").jsonPrimitive.double, MapDots.EDGE, 0.0)
    }

    @Test
    fun everyZoomDrawsTheWebsPaper() {
        val cases = fixture.getValue("cases").jsonArray.map { it.jsonObject }
        assertTrue(cases.isNotEmpty())
        for (c in cases) {
            val s = c.getValue("s").jsonPrimitive.double
            val dots = MapDots.at(s)
            val levels = c.getValue("levels").jsonArray.map { it.jsonPrimitive.double }
            assertEquals("tile at $s", c.getValue("tile").jsonPrimitive.double, dots.tile, 1e-9)
            assertEquals("levels at $s", levels.size, dots.levels.size)
            levels.zip(dots.levels).forEach { (a, b) -> assertEquals("levels at $s", a, b, 1e-9) }
            assertEquals("radius at $s", c.getValue("radius").jsonPrimitive.double, dots.radius, 1e-9)
            assertEquals("alpha at $s", c.getValue("alpha").jsonPrimitive.double, dots.alpha, 1e-9)
        }
    }

    @Test
    fun aTileIsInTheWebsLattice() {
        for (t in fixture.getValue("dotLevel").jsonArray.map { it.jsonObject }) {
            val i = t.getValue("i").jsonPrimitive.int
            val j = t.getValue("j").jsonPrimitive.int
            assertEquals("tile $i, $j", t.getValue("level").jsonPrimitive.int, MapDots.level(i, j))
        }
    }
}
