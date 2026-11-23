package com.resonance.design

import coil3.decode.DataSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Wave 2 #7: whether a picture that just arrived comes in blurred, faded or at once. */
class ImageRevealTest {
    private fun reveal(
        kind: ImageRevealKind = ImageRevealKind.Cover,
        source: DataSource = DataSource.NETWORK,
        reduced: Boolean = false,
        power: Boolean = false,
        sdk: Int = 34,
    ) = imageReveal(kind, source, reduced, power, sdk)

    @Test
    fun eachKindHasItsStrength() {
        assertEquals(ImageReveal(10f, 320), reveal(ImageRevealKind.Cover))
        assertEquals(ImageReveal(4f, 240), reveal(ImageRevealKind.Thumb))
        assertEquals(ImageReveal(3f, 200), reveal(ImageRevealKind.Avatar))
        // The viewer and the map only fade.
        assertEquals(ImageReveal(0f, 240), reveal(ImageRevealKind.Fade))
        assertEquals(ImageReveal.None, reveal(ImageRevealKind.Off))
    }

    @Test
    fun theMemoryCacheShowsAtOnceAndTheDiskStillReveals() {
        for (kind in ImageRevealKind.entries) assertEquals(ImageReveal.None, reveal(kind, DataSource.MEMORY_CACHE))
        assertTrue(reveal(source = DataSource.DISK).plays)
        assertTrue(reveal(source = DataSource.MEMORY).plays)
    }

    @Test
    fun removeAnimationsShowsAtOnce() {
        // The screenshots run with the animator scales at 0: this is what keeps them from catching a half-sharp picture.
        for (kind in ImageRevealKind.entries) assertFalse(reveal(kind, reduced = true).plays)
        assertFalse(reveal(reduced = true, power = true).plays)
    }

    @Test
    fun batterySaverAndOldAndroidsOnlyFade() {
        assertEquals(ImageReveal(0f, 320), reveal(power = true))
        assertEquals(ImageReveal(0f, 200), reveal(ImageRevealKind.Avatar, power = true))
        assertEquals(ImageReveal(0f, 320), reveal(sdk = 30))
        assertEquals(ImageReveal(10f, 320), reveal(sdk = 31))
    }

    @Test
    fun theCurveIsOpaqueEarlyAndSharpAtTheEnd() {
        val cover = ImageReveal(10f, 320)
        assertEquals(0f, revealAlpha(cover, 0f), 0f)
        assertEquals(1f, revealAlpha(cover, 0.4f), 1e-4f)
        assertEquals(10f, revealBlur(cover, 0f), 1e-4f)
        assertEquals(0f, revealBlur(cover, 1f), 1e-4f)
        assertTrue(revealBlur(cover, 0.5f) in 0f..5f)
        val fade = ImageReveal(0f, 240)
        assertEquals(0f, revealBlur(fade, 0f), 0f)
        assertEquals(1f, revealAlpha(fade, 1f), 1e-4f)
        assertTrue(revealAlpha(fade, 0.4f) < 1f)
    }
}
