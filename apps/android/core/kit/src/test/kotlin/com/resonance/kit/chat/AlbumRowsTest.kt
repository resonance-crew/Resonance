package com.resonance.kit.chat

import java.time.ZoneOffset
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Pictures sent together are one grid (round 22 §3): one sender's consecutive pictures of one album, in
 * their order; a member that failed or was unsent, or another message between, leaves it smaller; and
 * the grid's shapes for two to ten pictures.
 */
class AlbumRowsTest {
    private val utc = ZoneOffset.UTC
    private fun picture(id: String, sender: String, album: String, index: Int, count: Int, at: Long, delivery: Delivery = Delivery.Delivered, unsent: Boolean = false, text: String = "") =
        ChatMessage(
            id, sender, text, Date(at), image = ChatImage("img-$id", 800, 600), album = ChatAlbum(album, index, count),
            delivery = delivery, unsentAt = if (unsent) Date(at + 1) else null,
        )

    private val albumA = "AAAAAAAAAAAAAAAAAAAA"
    private val albumB = "BBBBBBBBBBBBBBBBBBBB"

    @Test fun oneSendersConsecutivePicturesOfOneAlbumAreOneRowInTheirOrder() {
        val rows = ThreadRows.build(
            listOf(
                ChatMessage("t0", "bob", "look", Date(0)),
                picture("p1", "alice", albumA, 1, 3, 1_000),
                picture("p0", "alice", albumA, 0, 3, 1_100, text = "the river"),
                picture("p2", "alice", albumA, 2, 3, 1_200),
            ),
            utc,
        )
        assertEquals(2, rows.size)
        val grid = rows[1]
        // The first picture carries the words and leads the row.
        assertEquals("p0", grid.message.id)
        assertEquals(listOf("p0", "p1", "p2"), grid.album.map { it.id })
        assertTrue(grid.holds("p2"))
        assertEquals(listOf("t0"), rows[0].members.map { it.id })
    }

    /** A picture its sender unsent, as the server leaves it: its sender and its times, nothing else — no picture, no album. */
    private fun unsentAsStored(id: String, sender: String, at: Long) = ChatMessage(id, sender, "", Date(at), unsentAt = Date(at + 50))

    @Test fun aFailedOrUnsentMemberLeavesItSmallerAndAnotherAlbumOrMessageBetweenEndsIt() {
        val rows = ThreadRows.build(
            listOf(
                picture("a0", "alice", albumA, 0, 5, 1_000),
                picture("a1", "alice", albumA, 1, 5, 1_100, delivery = Delivery.Failed),
                unsentAsStored("a2", "alice", 1_200),
                picture("a3", "alice", albumA, 3, 5, 1_300),
                picture("a4", "alice", albumA, 4, 5, 1_350),
                picture("b0", "alice", albumB, 0, 2, 1_400),
                ChatMessage("x", "bob", "nice", Date(1_500)),
                picture("b1", "alice", albumB, 1, 2, 1_600),
            ),
            utc,
        )
        // a0, a3, a4 one grid — the album goes on past the unsent a2 — then a1 (failed: its retry) and a2's ghost; b0 alone; bob; b1 alone.
        assertEquals(listOf("a0", "a1", "a2", "b0", "x", "b1"), rows.map { it.message.id })
        assertEquals(listOf("a0", "a3", "a4"), rows[0].album.map { it.id })
        assertTrue(rows[2].message.isUnsent)
        assertTrue(rows.drop(1).all { it.album.isEmpty() })
        val sending = ThreadRows.build(
            listOf(picture("c0", "alice", albumA, 0, 2, 1_000, delivery = Delivery.Sending), picture("c1", "alice", albumA, 1, 2, 1_100, delivery = Delivery.Sending)),
            utc,
        )
        // Pictures still on their way from here are drawn together from the device.
        assertEquals(listOf("c0", "c1"), sending.single().album.map { it.id })
    }

    @Test fun anUnsentMessageOfTheOtherPersonOrAfterTheAlbumKeepsItsPlace() {
        val rows = ThreadRows.build(
            listOf(
                picture("a0", "alice", albumA, 0, 2, 1_000),
                unsentAsStored("u1", "bob", 1_050),
                picture("a1", "alice", albumA, 1, 2, 1_100),
                unsentAsStored("u2", "alice", 1_200),
                ChatMessage("t", "alice", "and this", Date(1_300)),
            ),
            utc,
        )
        // bob's unsent message between ends alice's album (his words came between); alice's after it is just a ghost in its place.
        assertEquals(listOf("a0", "u1", "a1", "u2", "t"), rows.map { it.message.id })
        assertTrue(rows.all { it.album.isEmpty() })
    }

    @Test fun twoSideBySideThreeOneBigAndTwoFourTwoByTwoThenRowsOfThree() {
        val (two, h2) = AlbumLayout.cells(2, 302f, 2f)
        assertEquals(150f, two[0].width)
        assertEquals(two[0].y, two[1].y)
        assertEquals(two[0].height, h2)
        val (three, h3) = AlbumLayout.cells(3, 302f, 2f)
        assertEquals(h3, three[0].height)
        assertTrue(three[0].width > three[1].width)
        assertEquals(three[1].x, three[2].x)
        assertEquals(h3, three[2].y + three[2].height, 0.01f)
        val (four, h4) = AlbumLayout.cells(4, 302f, 2f)
        assertEquals(150f, four[3].x - 2f)
        assertEquals(302f, h4)
        val (seven, h7) = AlbumLayout.cells(7, 302f, 2f)
        assertEquals(7, seven.size)
        // A last row of one takes the whole width; the rows are as tall as the full ones.
        assertEquals(302f, seven[6].width)
        assertEquals(seven[0].height, seven[6].height)
        assertEquals(3 * 99.333336f + 4f, h7, 0.01f)
        val (ten, _) = AlbumLayout.cells(10, 302f, 2f)
        assertEquals(10, ten.size)
        // Every cell stays inside the grid.
        (2..10).forEach { n ->
            val (cells, h) = AlbumLayout.cells(n, 302f, 2f)
            cells.forEach { c -> assertTrue(c.x >= 0 && c.x + c.width <= 302.01f && c.y + c.height <= h + 0.01f, "$n: $c") }
        }
    }
}
