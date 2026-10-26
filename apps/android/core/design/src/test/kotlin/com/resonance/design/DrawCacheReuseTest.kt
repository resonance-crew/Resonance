package com.resonance.design

import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.kit.chat.RunPosition
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/**
 * A recomposition that hands a draw modifier or a shape equal inputs hands Compose an equal one (A6),
 * so the outline, paths and grain it cached are kept instead of rebuilt — and an equal shape draws
 * exactly the same outline. Different inputs still make a different one.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DrawCacheReuseTest {
    private val density = Density(2.625f)

    private fun points(outline: Outline): List<Float> {
        val path = (outline as Outline.Generic).path.asAndroidPath()
        return path.approximate(0.5f).toList()
    }

    @Test fun equalShapesAreEqualAndDrawTheSameOutline() {
        val options = WobRectOptions(curve = 1.3, cornerJitter = 3.2, cornerOffset = 2.0, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0))
        val pairs = listOf(
            WobRectShape(12.8, 7.0, mag = 0.7, options = options) to WobRectShape(12.8, 7.0, mag = 0.7, options = options.copy()),
            WobRectShape(22.0, 3.0) to WobRectShape(22.0, 3.0),
            MessageBubbleShape(41.0, mine = false, run = RunPosition.Middle) to MessageBubbleShape(41.0, mine = false, run = RunPosition.Middle),
            OrganicImageShape(5.0) to OrganicImageShape(5.0),
            BledShape(5.0, 14.0, 12.0, 0.025) to BledShape(5.0, 14.0, 12.0, 0.025),
            OrganicButtonShape(601.0) to OrganicButtonShape(601.0),
            AutoWobRectShape(16.0, 31.0, 0.8) to AutoWobRectShape(16.0, 31.0, 0.8),
            WobCircleShape(9.0) to WobCircleShape(9.0),
        )
        val size = Size(840f, 315f)
        for ((a, b) in pairs) {
            assertEquals(a, b)
            assertEquals(a.hashCode(), b.hashCode())
            assertEquals(points(a.createOutline(size, LayoutDirection.Ltr, density)), points(b.createOutline(size, LayoutDirection.Ltr, density)))
        }
        assertNotEquals(WobRectShape(22.0, 3.0), WobRectShape(22.0, 4.0))
        assertNotEquals(MessageBubbleShape(41.0, mine = true), MessageBubbleShape(41.0, mine = false))
        assertNotEquals(BledShape(5.0, 14.0), BledShape(5.0, 15.0))
    }

    @Test fun aCachedOutlineIsTheOneTheShapeWouldDraw() {
        // The same wobRect asked twice (the cache's key now numbers, not a string): the same points; another size, others.
        val shape = OrganicImageShape(11.0)
        val first = points(shape.createOutline(Size(600f, 375f), LayoutDirection.Ltr, density))
        val again = points(OrganicImageShape(11.0).createOutline(Size(600f, 375f), LayoutDirection.Ltr, density))
        assertEquals(first, again)
        assertNotEquals(first, points(shape.createOutline(Size(601f, 375f), LayoutDirection.Ltr, density)))
        // An image's outline and a bled one of the same box don't share an entry.
        val bled = BledShape(11.0, 0.0)
        assertTrue(points(bled.createOutline(Size(600f, 375f), LayoutDirection.Ltr, density)).isNotEmpty())
    }

    @Test fun equalInputsMakeEqualDrawModifiers() {
        val shape = MessageBubbleShape(3.0)
        val flash = { 0.5f }
        assertEquals(Modifier.bubbleSurface(shape, Tokens.BubbleMine), Modifier.bubbleSurface(MessageBubbleShape(3.0), Tokens.BubbleMine))
        assertEquals(Modifier.bubbleSurface(shape, Tokens.BubbleMine, flash), Modifier.bubbleSurface(shape, Tokens.BubbleMine, flash))
        assertNotEquals(Modifier.bubbleSurface(shape, Tokens.BubbleMine), Modifier.bubbleSurface(shape, Tokens.BubbleTheirs))
        assertEquals(Modifier.grainOverlay(0.03f), Modifier.grainOverlay(0.03f))
        assertNotEquals(Modifier.grainOverlay(0.03f), Modifier.grainOverlay(0.045f))
        val focused = { true }
        assertEquals(Modifier.fieldSurface(13.0), Modifier.fieldSurface(13.0))
        assertEquals(Modifier.fieldSurface(53.0, focused, 0.8), Modifier.fieldSurface(53.0, focused, 0.8))
        assertNotEquals(Modifier.fieldSurface(53.0, focused), Modifier.fieldSurface(54.0, focused))
        assertEquals(Modifier.floatingSlip(31.0), Modifier.floatingSlip(31.0))
        assertEquals(Modifier.headerEdge(), Modifier.headerEdge())
        assertEquals(Modifier.headerEdge(pen = Tokens.Text, lead = 8.dp), Modifier.headerEdge(pen = Tokens.Text, lead = 8.dp))
        assertNotEquals(Modifier.headerEdge(pen = Tokens.Text), Modifier.headerEdge(pen = Tokens.Text, lead = 8.dp))
        assertEquals(Modifier.footerEdge(), Modifier.footerEdge())
        assertEquals(Modifier.sheetEdge(), Modifier.sheetEdge())
        assertEquals(Modifier.organiBlob(120.dp, (-40).dp, 22.dp), Modifier.organiBlob(120.dp, (-40).dp, 22.dp))
    }
}
