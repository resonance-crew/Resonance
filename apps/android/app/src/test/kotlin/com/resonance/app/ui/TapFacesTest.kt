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
        // Three drawn, then the disc.
        assertEquals(listOf("dora", "eli", "fay"), faces.shown.map { it.id })
        assertTrue(faces.showsMore)
        assertTrue(TapFaces.of(null).isEmpty)
    }

    @Test fun tappingOnPutsTheViewerFirstAndAFourthFacePushedOutMeansMore() {
        val before = TapFaces(false, listOf(dora, eli, fay), more = false)
        val on = before.withViewer(alice, on = true)
        assertEquals(listOf("alice", "dora", "eli"), on.shown.map { it.id })
        assertTrue(on.mine)
        // fay is still one who resonated: the blank disc says there are more.
        assertTrue(on.showsMore)
        // Taken back: their face goes, the others keep their order — fay among them again.
        val off = on.withViewer(alice, on = false)
        assertEquals(listOf("dora", "eli", "fay"), off.shown.map { it.id })
        assertFalse(off.mine)
    }

    @Test fun onThenOffGivesBackTheFacesAsTheServerHadThem() {
        val served = CardTap(mine = false, faces = listOf(dora, eli, fay), more = false, mayNote = true)
        // On: the page keeps the tap as the end row hands it (onTapChanged), and the next tap starts from that.
        val on = TapFaces.of(served).withViewer(alice, on = true)
        val kept = CardTap(mine = on.mine, faces = on.faces, more = on.more, mayNote = true)
        val off = TapFaces.of(kept).withViewer(alice, on = false)
        assertEquals(TapFaces(false, listOf(dora, eli, fay), more = false), off)
        // No stray disc, and a screen reader hears no 「還有其他人」.
        assertFalse(off.showsMore)
        assertEquals("你連結的人裡，與這張卡片共振的：小安、阿明、fay", facesLabel(off, "alice", author = false))
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

    @Test fun theFacesStepInByAThirdOfTheirSizeWithNothingUnderThem() {
        // §U2.2: 28, each stepping in by 0.34 × 28 — and no pad of the paper round a face any more (the owner's look,
        // 2026-11-19: it read as a white frame outside the border): the group is its faces' own width.
        assertEquals(28f * 0.66f, AvatarGroup.step(28.dp).value, 0.01f)
        assertEquals(0f, AvatarGroup.width(0, 28.dp).value, 0.01f)
        assertEquals(28f, AvatarGroup.width(1, 28.dp).value, 0.01f)
        // Three faces and the disc.
        assertEquals(28f * 0.66f * 3 + 28f, AvatarGroup.width(4, 28.dp).value, 0.01f)
        assertEquals(150, AvatarGroup.MOVE_MILLIS)
        // The author's line keeps its first face's rim where it stood on its pad: 8 and the pad's 3 after the wave.
        assertEquals(11f, AuthorFacesGap.value, 0f)
    }

    /** One declaration of a rule in the web's CSS module, in px. */
    private fun px(css: String, selector: String, property: String): Float {
        val block = Regex(Regex.escape(selector) + "\\s*\\{([^}]*)\\}").find(css)?.groupValues?.get(1)
            ?: error("no $selector")
        val value = Regex("(?:^|[;\\s])" + Regex.escape(property) + "\\s*:\\s*([0-9.]+)px").find(block)?.groupValues?.get(1)
            ?: error("no $property in $selector")
        return value.toFloat()
    }

    @Test fun thePopoversRowsStandAsTheWebsTwentyInFromTheSheetsPenLine() {
        // The relook of round 26 (android/tablet/taps-list): the face stood 12 from the popover's pen line, the web's 20 —
        // the inset of every menu sheet's rows. The popover's rows are the web's: TapPeople.module.css, data-size popover.
        val css = File("../../../src/components/molecules/CardDetail/TapPeople.module.css").readText()
        val popover = ".list[data-size='popover']"
        val rows = TapRowMeasure.Popover
        assertEquals(px(css, "$popover .row", "padding-inline"), rows.inset.value, 0f)
        assertEquals(20f, rows.inset.value, 0f)
        assertEquals(px(css, "$popover .row", "min-height"), rows.height.value, 0f)
        assertEquals(px(css, "$popover .rowInner", "gap"), rows.gap.value, 0f)
        assertEquals(px(css, "$popover .handle", "font-size"), rows.handle, 0f)
        // Its face: TapPeople.tsx's 28 on a popover, the faces' own size.
        val tsx = File("../../../src/components/molecules/CardDetail/TapPeople.tsx").readText()
        assertTrue(tsx.contains("size={size === 'popover' ? 28 : 36}"))
        assertEquals(28f, rows.face.value, 0f)
        // Over the first row and under the last, inside the sheet: TapFaces.module.css's 8.
        val sheet = File("../../../src/components/molecules/CardDetail/TapFaces.module.css").readText()
        assertEquals(px(sheet, ".popoverBody", "padding-block"), TapPopoverPad.value, 0f)
        // The phone's dialog keeps its bands' own 12 (its band layout, not a menu sheet's).
        assertEquals(12f, TapRowMeasure.Dialog.inset.value, 0f)
        assertEquals(36f, TapRowMeasure.Dialog.face.value, 0f)
    }
}
