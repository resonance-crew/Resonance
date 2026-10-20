package com.resonance.app

import com.google.firebase.Timestamp
import com.resonance.app.DraftService.Companion.openedCard
import java.time.Duration
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A card of yours as the writer opens it (write/[id]/page.tsx): a draft's own fields, or a published
 * card's pending edit; a card in the trash with when it went in, so the writer says so with 還原 —
 * never its pending edit, which waits for the restore — and one past its days in the trash, or
 * someone else's, not at all. The live card's audience comes along for the step's resonance line.
 */
class OpenedCardTest {
    private val now = Instant.parse("2026-10-20T08:00:00Z")
    private fun ts(at: Instant) = Timestamp(at.epochSecond, at.nano)

    private val card = mapOf(
        "authorId" to "alice",
        "thoughtCore" to "雨中散步",
        "story" to "那天下午雨停了。",
        "tags" to listOf("雨"),
        "visibility" to "public",
        "anonymous" to false,
        "slug" to "rain-walk",
        "referenceCardId" to "orig",
        "media" to mapOf("type" to "image", "url" to "https://img.example/a.webp", "label" to "a"),
        "accentHue" to 140,
    )

    @Test fun aDraftOpensWithItsOwnFields() {
        val opened = openedCard("alice", "d1", card + ("publishedAt" to null), buffered = null, now = now)!!
        assertFalse(opened.isPublished)
        assertFalse(opened.isTrashed)
        assertEquals("雨中散步", opened.values.title)
        assertEquals(listOf("雨"), opened.values.tags)
        assertEquals("https://img.example/a.webp", opened.values.imageUrl)
        assertEquals(140.0, opened.values.accentHue)
        assertEquals("orig", opened.referenceCardId)
        assertEquals("rain-walk", opened.routeKey)
    }

    @Test fun aLiveCardOpensOnItsPendingEditWithTheAudienceReadersHaveNow() {
        val published = card + ("publishedAt" to ts(now.minus(Duration.ofDays(3))))
        val edit = mapOf("thoughtCore" to "雨中散步（改）", "story" to "改過的。", "tags" to emptyList<String>(), "visibility" to "private", "anonymous" to false)
        val opened = openedCard("alice", "c1", published, buffered = edit, now = now)!!
        assertTrue(opened.isPublished)
        assertTrue(opened.hasPendingEdit)
        assertEquals("雨中散步（改）", opened.values.title)
        assertEquals("private", opened.values.visibility)
        assertEquals("public", opened.liveVisibility)
        assertFalse(opened.liveAnonymous)
    }

    @Test fun aCardInTheTrashSaysWhenItWentInAndLeavesItsPendingEditAlone() {
        val trashedAt = now.minus(Duration.ofDays(2))
        val trashed = card + mapOf("publishedAt" to ts(now.minus(Duration.ofDays(9))), "visibility" to "private", "trashedAt" to ts(trashedAt))
        val opened = openedCard("alice", "c1", trashed, buffered = mapOf("thoughtCore" to "edit"), now = now)!!
        assertTrue(opened.isTrashed)
        assertEquals(trashedAt, opened.trashedAt)
        assertEquals("雨中散步", opened.values.title)
        assertFalse(opened.hasPendingEdit)
    }

    @Test fun pastItsDaysInTheTrashItIsGoneToItsOwnerToo() {
        val trashed = card + mapOf("publishedAt" to null, "trashedAt" to ts(now.minus(Duration.ofDays(30))))
        assertNull(openedCard("alice", "d1", trashed, buffered = null, now = now))
        val lastDay = card + mapOf("publishedAt" to null, "trashedAt" to ts(now.minus(Duration.ofDays(29)).minusSeconds(3600)))
        assertTrue(openedCard("alice", "d1", lastDay, buffered = null, now = now)!!.isTrashed)
    }

    @Test fun someoneElsesCardIsNotOpened() {
        assertNull(openedCard("bob", "d1", card, buffered = null, now = now))
    }
}
