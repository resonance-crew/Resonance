package com.resonance.app.ui

import com.resonance.app.thoughtmap.MapCard
import com.resonance.app.thoughtmap.MapOpening
import com.resonance.app.thoughtmap.mapOpening
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Round 10's rules that aren't drawing: where a card tapped on the thought map opens (every card of
 * mine in the writer, a 私人卡 as a shared one; someone else's on its page).
 */
class RoundTenTest {
    private fun node(author: String = "alice", published: Boolean = true, visibility: String = "public", slug: String? = "rain") =
        MapCard("m1", author, slug = slug, title = "t", story = "", tags = emptyList(), visibility = visibility, publishedAt = if (published) 1L else null, mediaUrl = null, accentHue = null)

    // §1

    @Test fun belowTheSplitEveryCardOfMineOpensTheWriter() {
        for (card in listOf(node(), node(visibility = "connections"), node(visibility = "private"), node(published = false))) {
            assertEquals(card.toString(), MapOpening.Writer("m1"), mapOpening(card, "alice", split = false))
        }
    }

    @Test fun atTheSplitEveryCardOfMineOpensInThePane() {
        assertEquals(MapOpening.Pane("m1"), mapOpening(node(visibility = "private"), "alice", split = true))
        assertEquals(MapOpening.Pane("m1"), mapOpening(node(), "alice", split = true))
    }

    @Test fun someoneElsesCardOpensItsPageBySlugElseId() {
        assertEquals(MapOpening.Page("rain"), mapOpening(node(author = "bob"), "alice", split = false))
        assertEquals(MapOpening.Page("rain"), mapOpening(node(author = "bob"), "alice", split = true))
        // Someone else's anonymous original comes without its author; signed out, nothing is mine.
        assertEquals(MapOpening.Page("m1"), mapOpening(node(author = "", slug = null), "alice", split = false))
        assertEquals(MapOpening.Page("rain"), mapOpening(node(), null, split = false))
    }
}
