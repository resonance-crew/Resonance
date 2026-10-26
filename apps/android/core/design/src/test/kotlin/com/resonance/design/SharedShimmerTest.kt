package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * A skeleton's blocks on one shared clock (A9) shimmer exactly as blocks with a clock each, when they
 * are composed together: the same band in the same place, frame after frame.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w1000dp-h600dp-mdpi")
class SharedShimmerTest {
    @get:Rule val compose = createComposeRule()

    @Composable
    private fun Blocks() {
        Column(Modifier.width(256.dp).padding(4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Skeleton(height = 14.dp)
            Skeleton(Modifier.width(60.dp), height = 10.dp)
            WithSkeletonHue(215.0) { Skeleton(height = 18.dp, circle = true) }
            Skeleton(Modifier.width(80.dp), height = 22.dp, radius = 11.dp)
        }
    }

    // Each column 256 px wide, so the two halves sit alike on the gradients' dither pattern.
    @Test fun sharedAndOwnClocksShimmerAlike() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f)) {
                Row(Modifier.background(Color.White)) {
                    SharedShimmer { Blocks() }
                    Blocks()
                }
            }
        }
        val frames = mutableListOf<List<Int>>()
        for (step in 0 until 6) {
            compose.mainClock.advanceTimeBy(277)
            val map = compose.onRoot().captureToImage().toPixelMap()
            val half = map.width / 2
            val left = (0 until map.height).flatMap { y -> (0 until half).map { x -> map[x, y].hashCode() } }
            val right = (0 until map.height).flatMap { y -> (0 until half).map { x -> map[x + half, y].hashCode() } }
            val diffs = left.indices.filter { left[it] != right[it] }
            if (diffs.isNotEmpty()) {
                val rows = diffs.map { it / half }.distinct()
                error("frame $step: ${diffs.size} of ${left.size} differ, size ${map.width}x${map.height}, rows ${rows.take(40)}, first x ${diffs.take(10).map { it % half }} " +
                    "l=${diffs.take(5).map { Integer.toHexString(left[it]) }} r=${diffs.take(5).map { Integer.toHexString(right[it]) }}")
            }
            frames += left
        }
        // It moves: the frames are not all alike.
        assertNotEquals(1, frames.distinct().size)
    }
}
