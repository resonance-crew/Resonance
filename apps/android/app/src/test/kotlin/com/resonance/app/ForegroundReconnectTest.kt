package com.resonance.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Back on screen after a while away, Firestore's streams start afresh — the thread, the Messages
 * list, the badges and the bell would otherwise show what they showed when the person left until
 * the SDK's own retry came round (up to a minute and a half): once per return, never on a quick look
 * at another app, never signed out, never on a cold start (its connection is new).
 */
class ForegroundReconnectTest {
    private var reconnects = 0
    private val rule = ForegroundReconnect(reconnect = { reconnects++ })
    private val away = ForegroundReconnect.AWAY_MILLIS

    @Test fun aReturnAfterAWhileAwayReconnects() {
        rule.left(at = 1_000)
        assertTrue(rule.cameBack(at = 1_000 + away, signedIn = true))
        assertEquals(1, reconnects)

        // A night with the screen off is one return like any other.
        rule.left(at = 10_000_000)
        assertTrue(rule.cameBack(at = 10_000_000 + 8 * 60 * 60 * 1000, signedIn = true))
        assertEquals(2, reconnects)
    }

    @Test fun aQuickLookAtAnotherAppKeepsTheConnection() {
        rule.left(at = 1_000)
        assertFalse(rule.cameBack(at = 1_000 + away - 1, signedIn = true))
        assertEquals(0, reconnects)
    }

    @Test fun aColdStartHasANewConnectionAlready() {
        // Started without ever having left the screen: the first onStart of the process.
        assertFalse(rule.cameBack(at = 5 * away, signedIn = true))
        assertEquals(0, reconnects)
    }

    @Test fun oneReturnReconnectsOnce() {
        rule.left(at = 0)
        assertTrue(rule.cameBack(at = away, signedIn = true))
        // Another start without leaving again (the activity started twice over) asks for nothing more.
        assertFalse(rule.cameBack(at = 3 * away, signedIn = true))
        assertEquals(1, reconnects)
    }

    @Test fun signedOutThereIsNothingToReconnect() {
        rule.left(at = 0)
        assertFalse(rule.cameBack(at = 2 * away, signedIn = false))
        assertEquals(0, reconnects)
        // That return is spent: signing in afterwards starts a connection of its own.
        assertFalse(rule.cameBack(at = 3 * away, signedIn = true))
        assertEquals(0, reconnects)
    }

    @Test fun theLatestLeaveCounts() {
        // Off the screen, back for a moment (a quick switch: no reconnect), off again: the time away runs from the last leave.
        rule.left(at = 0)
        assertFalse(rule.cameBack(at = 5_000, signedIn = true))
        rule.left(at = 6_000)
        assertFalse(rule.cameBack(at = 6_000 + away - 1, signedIn = true))
        rule.left(at = 30_000)
        assertTrue(rule.cameBack(at = 30_000 + away, signedIn = true))
        assertEquals(1, reconnects)
    }
}
