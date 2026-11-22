package com.resonance.app.ui

import com.resonance.api.models.Author
import com.resonance.api.models.CardTap
import com.resonance.api.models.TapList
import com.resonance.api.models.TapNote
import com.resonance.api.models.TapPerson
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * What the author sees (round 26 §U3): one line of faces where a reader's row would be — nothing when no one tapped —
 * and the list behind it, 30 a page then 顯示更多; a person who left a note on this named card leads to that
 * conversation, one who only tapped to their profile (they can't be replied to); an anonymous card shows faces and
 * names only and opens no thread.
 */
class AuthorTapsTest {
    private fun person(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)
    private fun row(id: String, note: String? = null) = TapPerson(person(id), note?.let(::TapNote))

    @Test fun noOneTappedShowsNothing() {
        assertTrue(TapFaces.of(CardTap(mine = false, faces = emptyList(), more = false, mayNote = false)).isEmpty)
        assertTrue(TapFaces.of(null).isEmpty)
        // The author's own card: three newest; that there are more is said, never drawn (round 29 §S5).
        val faces = TapFaces.of(CardTap(false, listOf(person("gus"), person("hana"), person("bob")), more = true, mayNote = false))
        assertEquals(3, faces.faces.size)
        assertTrue(faces.more)
    }

    @Test fun aNoteLeadsToItsConversationATapToTheProfile() {
        val carol = row("carol", note = "謝謝你寫下這場雨")
        val gus = row("gus")
        assertEquals(Route.Thread("carol", uid = "carol"), tapRowRoute(carol, anonymous = false))
        assertEquals("謝謝你寫下這場雨", tapRowExcerpt(carol, anonymous = false))
        // Only tapped: nothing to reply to.
        assertEquals(Route.Author("gus"), tapRowRoute(gus, anonymous = false))
        assertNull(tapRowExcerpt(gus, anonymous = false))
    }

    @Test fun anAnonymousCardShowsFacesAndNamesOnly() {
        val carol = row("carol", note = "謝謝")
        assertEquals(Route.Author("carol"), tapRowRoute(carol, anonymous = true))
        assertNull(tapRowExcerpt(carol, anonymous = true))
    }

    @Test fun thirtyAPageThenShowMoreForTheNext() = runBlocking {
        val asked = mutableListOf<String?>()
        val first = (1..30).map { row("p$it") }
        val list = TapPeople { token ->
            asked += token
            if (token == null) TapList(first, nextPageToken = "t2") else TapList(listOf(row("p31"), row("p30")), nextPageToken = null)
        }
        list.first()
        assertEquals(30, list.people.size)
        assertTrue(showsMore(list))
        list.more()
        assertEquals(listOf(null, "t2"), asked)
        // The next page is added on; someone on both pages once.
        assertEquals(31, list.people.size)
        assertFalse(showsMore(list))
        // Nothing more to ask for.
        list.more()
        assertEquals(2, asked.size)
    }

    @Test fun aPageThatFailsKeepsWhatWasRead() = runBlocking {
        var fail = false
        val list = TapPeople { token -> if (fail) throw IOException("offline") else TapList(listOf(row("a")), nextPageToken = "t2") }
        list.first()
        fail = true
        list.more()
        assertEquals(listOf("a"), list.people.map { it.author.id })
        assertTrue(list.failed)
        assertTrue(list.loaded)
        // Its 顯示更多 stays to try again.
        assertTrue(showsMore(list))
    }
}
