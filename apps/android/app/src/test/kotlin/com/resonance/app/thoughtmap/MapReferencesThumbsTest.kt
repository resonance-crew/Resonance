package com.resonance.app.thoughtmap

import com.resonance.app.thoughtmap.ThoughtMapService.Companion.mapCardOf
import com.resonance.app.thoughtmap.ThoughtMapService.Companion.referenceIds
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * A6: the originals I answered come from my own cards already read (published and drafts), not from
 * a third read of 60 of them in no order — which missed every original answered past a person's
 * first 60 cards by id. B2: a node's picture is the small cover when the card has one.
 */
class MapReferencesThumbsTest {
    @Test
    fun theOriginalsAreTheReferencesOfMyCardsRead() {
        val published = List(70) { i -> mapOf<String, Any?>("authorId" to "me", "referenceCardId" to if (i == 69) "orig-late" else null) }
        val drafts = listOf(
            mapOf<String, Any?>("referenceCardId" to "orig-draft"),
            mapOf<String, Any?>("referenceCardId" to "orig-late"),
            mapOf<String, Any?>("referenceCardId" to ""),
        )
        assertEquals(listOf("orig-late", "orig-draft"), referenceIds(published + drafts))
    }

    @Test
    fun aNodeDrawsTheSmallCoverAndFallsBackToTheCover() {
        val media = mapOf("type" to "image", "url" to "https://img.example/a.webp", "thumbUrl" to "https://img.example/a-w960.webp")
        val card = mapCardOf("c1", mapOf("media" to media))!!
        assertEquals("https://img.example/a-w960.webp", card.mediaUrl)
        assertEquals("https://img.example/a.webp", card.mediaFallbackUrl)
        val older = mapCardOf("c2", mapOf("media" to media - "thumbUrl"))!!
        assertEquals("https://img.example/a.webp", older.mediaUrl)
    }

    @Test
    fun aThumbLeftFromAnEarlierCoverIsNotDrawn() {
        // A draft's save merges `media`: the cover changed, its old small copy stayed.
        val changed = mapOf(
            "type" to "image",
            "url" to "https://img.example/image/2026-11/B.webp",
            "thumbUrl" to "https://img.example/image/2026-11/A-w960.webp",
        )
        assertEquals("https://img.example/image/2026-11/B.webp", mapCardOf("c3", mapOf("media" to changed))!!.mediaUrl)
        val own = changed + ("thumbUrl" to "https://img.example/image/2026-11/B-w960.webp")
        assertEquals("https://img.example/image/2026-11/B-w960.webp", mapCardOf("c4", mapOf("media" to own))!!.mediaUrl)
        // Any extension is replaced, only the last one.
        val jpeg = mapOf("type" to "image", "url" to "https://img.example/x.y/B.v1.jpg", "thumbUrl" to "https://img.example/x.y/B.v1-w960.webp")
        assertEquals("https://img.example/x.y/B.v1-w960.webp", mapCardOf("c5", mapOf("media" to jpeg))!!.mediaUrl)
    }
}
