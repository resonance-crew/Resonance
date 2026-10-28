package com.resonance.app.ui

import kotlin.math.abs
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

/**
 * The trash banner's one shape (round 19, TrashedCardBanner.tsx): each segment's face is cut on the
 * very points its seam is stroked on, and on a phone the foot's seam runs across the width at the
 * foot's top while the split between the two stays in the foot.
 */
class TrashBannerShapeTest {
    @Test fun sideBySideTheFacesEdgesAreTheirSeams() {
        val shape = TrashBannerShape.of(640.0, 76.0, restoreX = 420.0, footY = 0.0, deleteX = 520.0, stacked = false)
        val (first, second) = shape.seams
        assertEquals(first, shape.segments.take(first.size))
        assertEquals(second, shape.danger.take(second.size))
        // 還原's own region: between the two seams.
        assertEquals(first + second.reversed(), shape.restore)
        // Each seam waves gently about its x (amp 1.8), over the shape's whole height and past it.
        assertTrue(first.all { abs(it.x - 420f) <= 1.8f })
        assertTrue(first.first().y < 0f && first.last().y > 76f)
    }

    @Test fun stackedTheSegmentsAreTheFootUnderASeamAcross() {
        val shape = TrashBannerShape.of(360.0, 120.0, restoreX = 0.0, footY = 70.0, deleteX = 180.0, stacked = true)
        val (under, split) = shape.seams
        // Across the width, left to right, about the foot's top (amp 2.6).
        assertTrue(under.first().x < 0f && under.last().x > 360f)
        assertTrue(under.all { abs(it.y - 70f) <= 2.6f })
        // The split is the foot's alone: it starts no higher than a pad above the foot (clipped to it when drawn).
        assertTrue(split.all { abs(it.x - 180f) <= 1.8f })
        assertTrue(split.drop(1).dropLast(1).all { it.y in 70f..120f })
        assertEquals(under, shape.segments.take(under.size))
        assertEquals(split, shape.danger.take(split.size))
    }
}
