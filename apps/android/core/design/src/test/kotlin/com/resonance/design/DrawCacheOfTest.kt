package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.CacheDrawScope
import androidx.compose.ui.draw.DrawResult
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/**
 * [drawWithCacheOf] draws exactly what `drawWithCache` draws with the same block (the same node does
 * the work), and keeps its cache across recompositions that hand it an equal block — building it
 * again only for a different one (A6).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DrawCacheOfTest {
    @get:Rule val compose = createComposeRule()

    /** A bubble's kind of drawing: an outline filled, its content clipped to it. Counts its builds. */
    private data class Surface(val seed: Double, val fill: Color, val builds: IntArray) : (CacheDrawScope) -> DrawResult {
        override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
            builds[0]++
            val outline = MessageBubbleShape(seed).createOutline(size, layoutDirection, this)
            val clip = Path().apply { addOutline(outline) }
            onDrawWithContent {
                drawOutline(outline, fill)
                clipPath(clip) { this@onDrawWithContent.drawContent() }
            }
        }
        override fun equals(other: Any?) = other is Surface && other.seed == seed && other.fill == fill
        override fun hashCode() = seed.hashCode() * 31 + fill.hashCode()
    }

    private fun capture(): IntArray {
        val map = compose.onRoot().captureToImage().toPixelMap()
        return IntArray(map.width * map.height).also { out -> map.buffer.copyInto(out) }
    }

    @Test fun drawsWhatDrawWithCacheDraws() {
        val block = Surface(7.0, Light.BubbleTheirs, IntArray(1))
        var ours by mutableStateOf(true)
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(2f, 1f)) {
                Box(Modifier.size(120.dp, 64.dp).background(Color.White)) {
                    Box(Modifier.padding(8.dp).then(if (ours) Modifier.drawWithCacheOf(block) else Modifier.drawWithCache { block(this) })) {
                        // Content running past the outline: the clip is what shapes it.
                        Box(Modifier.size(120.dp, 64.dp).background(Tokens.Terracotta.copy(alpha = 0.5f)))
                    }
                }
            }
        }
        val drawn = capture()
        ours = false
        compose.waitForIdle()
        assertArrayEquals(capture(), drawn)
        assertEquals(2, block.builds[0])
    }

    @Test fun anEqualBlockKeepsTheCacheAndAnotherBuildsItAgain() {
        val builds = IntArray(1)
        var seed by mutableStateOf(7.0)
        var tick by mutableIntStateOf(0)
        compose.setContent {
            // Read so a change of tick recomposes this, handing the modifier a new but equal block.
            tick.let { }
            Box(Modifier.size(80.dp, 40.dp).drawWithCacheOf(Surface(seed, Tokens.BubbleMine, builds)))
        }
        capture()
        assertEquals(1, builds[0])
        repeat(3) {
            tick++
            compose.waitForIdle()
            capture()
        }
        assertEquals(1, builds[0])
        seed = 8.0
        compose.waitForIdle()
        capture()
        assertEquals(2, builds[0])
    }
}
