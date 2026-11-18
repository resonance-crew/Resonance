package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.CardTap
import com.resonance.api.models.Me
import com.resonance.design.AvatarGroup
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * The faces of who resonated (round 26 §U2 — the owner: 「直接放那個頭像就好」): the viewer's own face first while their tap
 * is on, then their connections; at most three, then a blank disc for "more" — never a number; one button opening the
 * list unless the only face is the viewer's; what a screen reader hears, nothing on screen.
 */
class TapFacesTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun person(id: String, handle: String = id, seed: String? = "7") = Author(id, handle, handle.take(2).uppercase(), "oklch(88% 0.08 55)", null, seed, false, null)

    private val alice = person("alice", "alice", seed = "42")
    private val dora = person("dora", "小安")
    private val eli = person("eli", "阿明")
    private val fay = person("fay")

    @Test fun theServersFacesAtMostThreeTheRestMore() {
        val tap = CardTap(mine = false, faces = listOf(dora, eli, fay, person("gus")), more = false, mayNote = true)
        val faces = TapFaces.of(tap)
        assertEquals(listOf("dora", "eli", "fay"), faces.faces.map { it.id })
        assertTrue(faces.more)
        assertTrue(TapFaces.of(null).isEmpty)
    }

    @Test fun tappingOnPutsTheViewerFirstAndAFourthFacePushedOutMeansMore() {
        val before = TapFaces(false, listOf(dora, eli, fay), more = false)
        val on = before.withViewer(alice, on = true)
        assertEquals(listOf("alice", "dora", "eli"), on.faces.map { it.id })
        assertTrue(on.mine)
        // fay is still one who resonated: the blank disc says there are more.
        assertTrue(on.more)
        // Taken back: their face goes, the others keep their order.
        val off = on.withViewer(alice, on = false)
        assertEquals(listOf("dora", "eli"), off.faces.map { it.id })
        assertFalse(off.mine)
    }

    @Test fun onlyTheViewersOwnFaceOpensNothing() {
        val self = TapFaces.NONE.withViewer(alice, on = true)
        assertEquals(listOf("alice"), self.faces.map { it.id })
        assertTrue(self.selfOnly("alice"))
        assertFalse(TapFaces(true, listOf(alice, dora), false).selfOnly("alice"))
        assertFalse(TapFaces(true, listOf(alice), more = true).selfOnly("alice"))
        assertEquals("你共振了", facesLabel(self, "alice", author = false))
    }

    @Test fun aScreenReaderHearsWhoNeverAnyNumber() {
        val faces = TapFaces(false, listOf(dora, eli), more = true)
        assertEquals("你連結的人裡，與這張卡片共振的：小安、阿明，還有其他人", facesLabel(faces, "alice", author = false))
        val mine = TapFaces(true, listOf(alice, dora), more = false)
        assertEquals("你共振了，你連結的人裡，與這張卡片共振的：小安", facesLabel(mine, "alice", author = false))
        // The author's line names everyone who tapped.
        assertEquals("與這張卡片共振的人：小安、阿明，還有其他人", facesLabel(faces, "bob", author = true))
        Strings.language = Strings.Language.En
        assertEquals("People you're connected with who resonated: 小安, 阿明, and others", facesLabel(faces, "alice", author = false))
        assertFalse(facesLabel(faces, "alice", author = false).any { it.isDigit() })
    }

    @Test fun theViewersFaceKeepsTheSeedTheServerDrewItWith() {
        val me = Me("alice", "alice", "AL", "oklch(88% 0.08 55)", null, null, "TW", null, null)
        assertEquals("42", viewerFace(me, known = alice).avatarSeed)
        // Not known yet: drawn from /me, the server's face replacing it at the next read.
        assertEquals("alice", viewerFace(me, known = null).id)
        assertEquals(null, viewerFace(me, known = dora).avatarSeed)
    }

    @Test fun theFacesStepInByAThirdOfTheirSizeOnPadsOfThePaper() {
        // §U2.2: 28, each stepping in by 0.34 × 28; the pads 3 past each face.
        assertEquals(28f * 0.66f, AvatarGroup.step(28.dp).value, 0.01f)
        assertEquals(0f, AvatarGroup.width(0, 28.dp).value, 0.01f)
        assertEquals(34f, AvatarGroup.width(1, 28.dp).value, 0.01f)
        // Three faces and the disc.
        assertEquals(28f * 0.66f * 3 + 34f, AvatarGroup.width(4, 28.dp).value, 0.01f)
        assertEquals(150, AvatarGroup.MOVE_MILLIS)
    }
}
