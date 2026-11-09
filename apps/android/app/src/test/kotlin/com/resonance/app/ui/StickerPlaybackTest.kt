package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 2.4.1's sticker playback rules (the crash fix): a drawable's end callback is registered once and never
 * unregistered — Android's `AnimatedImageDrawable` walks that list from a posted lambda without asking whether
 * it is still there — so [StickerRun] decides which ends end anything; and a key's stop is forgotten once it
 * stops, so a sticker drawn again later doesn't take an old stop as news.
 */
class StickerPlaybackTest {
    @Test fun aPlayEndsWhenTheDrawableHasRunOutNotWhenAReplaysStopArrivesAfterItsStart() {
        val run = StickerRun()
        // Nothing started yet: an end means nothing.
        assertFalse(run.ends(running = false))
        run.started()
        // A replay is stop(); start(): the end the stop() posted arrives while the drawable runs again.
        assertFalse(run.ends(running = true))
        // The two plays ran out: the drawable has stopped.
        assertTrue(run.ends(running = false))
    }

    @Test fun anEndAfterWeStoppedThePlayOrAfterTheStickerLeftIsIgnored() {
        val run = StickerRun()
        run.started()
        // Told to stop (the three-at-once limit) or its plays handled: the stop() we made posts an end, which is old news.
        run.stopped()
        assertFalse(run.ends(running = false))
        // Played again, then the sticker leaves the screen while playing: its stop() posts an end after it is gone.
        run.started()
        run.release()
        assertFalse(run.ends(running = false))
        // Released is for good, whatever comes after.
        run.started()
        assertFalse(run.ends(running = false))
    }

    @Test fun atMostThreeKeysPlayAndAStoppedKeyForgetsItWasToldToStop() {
        val keys = (1..4).map { "test-${System.nanoTime()}-$it" }
        try {
            keys.take(3).forEach(StickerPlayback::start)
            assertNull(StickerPlayback.stops[keys[0]])
            // A fourth: the one playing longest is told to stop.
            StickerPlayback.start(keys[3])
            assertEquals(1, StickerPlayback.stops[keys[0]])
            // It stops (its view leaves its play): the stop is forgotten, and its place is free.
            StickerPlayback.stop(keys[0])
            assertNull(StickerPlayback.stops[keys[0]])
            // Seen again and playing again, it is the newest: the next longest playing makes way.
            StickerPlayback.start(keys[0])
            assertEquals(1, StickerPlayback.stops[keys[1]])
            // A replay of one already playing stops no one.
            StickerPlayback.start(keys[3])
            assertNull(StickerPlayback.stops[keys[2]])
        } finally {
            keys.forEach(StickerPlayback::stop)
        }
    }
}
