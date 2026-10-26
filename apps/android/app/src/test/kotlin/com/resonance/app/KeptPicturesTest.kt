package com.resonance.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The pictures sent from here are kept to draw by count and by memory (A12): past either, the least
 * recently drawn goes first (it is drawn from the server's copy then), never the one just sent.
 */
class KeptPicturesTest {
    private val mb = 1024L * 1024

    @Test fun pastItsMemoryTheLeastRecentlyDrawnGoesFirst() {
        val kept = KeptPictures<Long>(maxCount = 40, maxBytes = 20 * mb) { it }
        kept["a"] = 8 * mb
        kept["b"] = 8 * mb
        assertNotNull(kept["a"]) // drawn again: now the most recent
        kept["c"] = 8 * mb
        assertNull(kept["b"])
        assertEquals(listOf(true, false, true), listOf("a", "b", "c").map { kept[it] != null })
        assertEquals(16 * mb, kept.bytes)
    }

    @Test fun pastItsCountTheOldestGoes() {
        val kept = KeptPictures<Long>(maxCount = 3, maxBytes = Long.MAX_VALUE) { it }
        for (id in listOf("a", "b", "c", "d")) kept[id] = 1
        assertEquals(3, kept.size)
        assertNull(kept["a"])
    }

    @Test fun theOneJustSentStaysWhateverItsSize() {
        val kept = KeptPictures<Long>(maxCount = 40, maxBytes = 10 * mb) { it }
        kept["a"] = 4 * mb
        kept["huge"] = 30 * mb
        assertNotNull(kept["huge"])
        assertNull(kept["a"])
        assertEquals(30 * mb, kept.bytes)
        // Kept again under the same id: counted once.
        kept["huge"] = 2 * mb
        assertEquals(2 * mb, kept.bytes)
        kept.clear()
        assertEquals(0L, kept.bytes)
        assertEquals(0, kept.size)
    }
}
