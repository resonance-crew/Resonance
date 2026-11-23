package com.resonance.app

import com.resonance.kit.chat.ChatPush
import com.resonance.kit.chat.ChatUnsend
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A push that may be tapped in a moment warms App Check and the ID token before anything else —
 * a chat message too, which takes its own road (data-only) and once returned before the warm-up,
 * so a thread opened from it an hour after the app's last use waited ~10 s.
 */
class PushArrivalTest {
    @Test fun aChatMessageWarmsTheTokens() {
        val kind = PushArrival.of(mapOf("type" to ChatPush.TYPE, "conversationId" to "a_b"), notificationTitle = null)
        assertEquals(PushArrival.Chat, kind)
        assertTrue(kind.warmsTokens)
        // An older path's chat push that came with a notification payload is still a chat message.
        assertEquals(PushArrival.Chat, PushArrival.of(mapOf("type" to ChatPush.TYPE), notificationTitle = "Alice"))
    }

    @Test fun aShownPushWarmsTheTokens() {
        val kind = PushArrival.of(mapOf("route" to "/cards/c1"), notificationTitle = "A note")
        assertEquals(PushArrival.Shown, kind)
        assertTrue(kind.warmsTokens)
    }

    @Test fun anUnsendOrAPushWithNothingToShowDoesnt() {
        assertEquals(PushArrival.Unsend, PushArrival.of(mapOf("type" to ChatUnsend.TYPE), notificationTitle = null))
        assertFalse(PushArrival.Unsend.warmsTokens)
        assertEquals(PushArrival.Nothing, PushArrival.of(emptyMap(), notificationTitle = null))
        assertFalse(PushArrival.Nothing.warmsTokens)
    }
}
