package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.onRoot
import androidx.compose.foundation.layout.width
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
import org.junit.Rule
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
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
 * is on, then everyone else who did (Wave 2 #3b; was their connections); at most three and nothing after them — no blank disc for "more" since round 29 §S5
 * (the owner: 「不要把當有第四、第五個的時候顯示成灰色」), never a number; one button opening the list unless the only face is
 * the viewer's; what a screen reader hears (「還有其他人」 when there are more), nothing on screen.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TapFacesTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    private val language = Strings.language

    @Before fun catalogs() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
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
        // Three drawn; that there are more is said, never drawn.
        assertEquals(listOf("dora", "eli", "fay"), faces.shown.map { it.id })
        assertTrue(faces.showsMore)
        assertTrue(TapFaces.of(null).isEmpty)
    }

    @Test fun tappingOnPutsTheViewerFirstAndAFourthFacePushedOutMeansMore() {
        val before = TapFaces(false, listOf(dora, eli, fay), more = false)
        val on = before.withViewer(alice, on = true)
        assertEquals(listOf("alice", "dora", "eli"), on.shown.map { it.id })
        assertTrue(on.mine)
        // fay is still one who resonated: a screen reader hears there are more.
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
        assertEquals("與這張卡片共振的人：小安、阿明、fay", facesLabel(off, "alice", author = false))
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
        assertEquals("與這張卡片共振的人：小安、阿明，還有其他人", facesLabel(faces, "alice", author = false))
        val mine = TapFaces(true, listOf(alice, dora), more = false)
        assertEquals("你共振了，與這張卡片共振的人：小安", facesLabel(mine, "alice", author = false))
        // The author's line names everyone who tapped.
        assertEquals("與這張卡片共振的人：小安、阿明，還有其他人", facesLabel(faces, "bob", author = true))
        Strings.language = Strings.Language.En
        assertEquals("Resonated with this card: 小安, 阿明, and others", facesLabel(faces, "alice", author = false))
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
        // Three faces, and nothing after them.
        assertEquals(28f * 0.66f * 2 + 28f, AvatarGroup.width(3, 28.dp).value, 0.01f)
        assertEquals(150, AvatarGroup.MOVE_MILLIS)
        // The author's line keeps its first face's rim where it stood on its pad: 8 and the pad's 3 after the wave.
        assertEquals(11f, AuthorFacesGap.value, 0f)
    }

    @Test fun theListsRowsAreADialogsOnEveryDevice() {
        // The reader's list is the phone's dialog everywhere now (the owner's look, 2026-11-19), the author's already
        // was: one measure of rows, 60 tall with a face of 36 — no popover's rows any more. Round 33 §Q2: the band from
        // the paper's edge to its edge, the face and the words the family's 24 in (the title's edge), not 28 + 12.
        assertEquals(60f, TapRowMeasure.dialog(LayoutClass.Compact).height.value, 0f)
        assertEquals(24f, TapRowMeasure.dialog(LayoutClass.Compact).inset.value, 0f)
        assertEquals(TapListInset, TapRowMeasure.dialog(LayoutClass.Compact).inset)
        assertEquals(36f, TapRowMeasure.dialog(LayoutClass.Compact).face.value, 0f)
    }

    @Test fun fourWhoResonatedAreThreeFacesAndNoBlankDisc() {
        // Round 29 §S5: three faces and more → the group is three faces wide, a reader's and the author's alike.
        val faces = TapFaces(false, listOf(dora, eli, fay, person("gus")), more = true)
        compose.setContent {
            Column {
                Box(Modifier.testTag("reader")) { TapFacesButton(faces, viewerId = "alice", author = false, onOpen = {}) }
            }
        }
        compose.waitForIdle()
        val group = compose.onNodeWithTag("reader").getBoundsInRoot()
        assertEquals(AvatarGroup.width(3, TapFaceSize).value, (group.right - group.left).value, 0.6f)
        // What is said still says there are more.
        assertTrue(facesLabel(faces, "alice", author = false).endsWith("還有其他人"))
    }

    @Test fun theReadersOwnFaceRisesOutOf共振FromUnderTheLinesFoot() {
        // Round 34 (9): from centred in the 48 line to its top on the line's foot (共振's top edge), which clips it.
        assertEquals(38f, OwnFaceRise.value, 0f)
        val source = java.io.File("src/main/kotlin/com/resonance/app/ui/TapFaces.kt").readText()
        assertTrue(source.contains("rise = if (author) null else viewerId, riseBy = OwnFaceRise"))
        assertTrue(source.contains("if (author) Modifier else Modifier.clipToBounds()"))
    }

    // Round 34 (11), as the owner corrected it: only the faces over 共振 have no press effect; the people rows keep
    // round 33's edge-to-edge press and held ink.

    @Test fun theFacesDrawNoPressInkThePeopleRowsKeepTheirBand() {
        val source = File("src/main/kotlin/com/resonance/app/ui/TapFaces.kt").readText()
        val row = source.substringAfter("private fun TapRow(").substringBefore("\n}\n")
        // Round 35 (3): drawn past the paper's box, for the paper to cut on its pen line.
        assertTrue("a people row's band, edge to edge", row.contains(".listBand(topKey, bottomKey, source, { false }, cut = false, bleed = TapListBandBleed)"))
        assertTrue("opens its person", row.contains("plainClickable(role = Role.Button, onClick = onClick)"))
        val button = source.substringAfter("internal fun TapFacesButton(").substringBefore("\n}\n")
        assertFalse(button.contains("indication = ") || button.contains("listBand(") || button.contains("collectIsPressedAsState"))
        assertTrue(button.contains(".plainClickable(role = Role.Button, onClick = onOpen)"))
        // The passages' rows keep theirs.
        assertTrue(File("src/main/kotlin/com/resonance/app/ui/TapPassages.kt").readText().contains(".listBand(keys[i], below[i], source"))
    }

    // Round 34 (12) (found on the Mac): every face of the group over 共振 opens the list — the overlaps too, nothing
    // clipped out of the target (item 9's clip draws only), nothing over it.

    private fun opensAtEveryFace(n: Int) {
        val people = listOf(dora, eli, fay).take(n)
        var opened = 0
        compose.setContent {
            Column {
                EndRowTwo(Modifier.width(320.dp), facesCentre = 60.dp) {
                    TapFacesButton(TapFaces(false, people, more = false), viewerId = "alice", author = false, onOpen = { opened++ })
                }
            }
        }
        compose.waitForIdle()
        val b = compose.onNodeWithTag("tap-faces", useUnmergedTree = true).getBoundsInRoot()
        val step = AvatarGroup.step(TapFaceSize)
        val mid = (b.top + b.bottom) / 2
        // The faces centred in the button (48 wide at least), the button centred on 共振's centre (60 in).
        val groupWidth = AvatarGroup.width(people.size, TapFaceSize)
        val left = b.left + ((b.right - b.left) - groupWidth) / 2
        assertEquals("the faces centred on 共振", 60f, (left + groupWidth / 2).value, 0.6f)
        assertTrue("48 wide at least", (b.right - b.left).value >= 48f - 0.5f)
        val points = buildList {
            for (i in people.indices) add(left + step * i + TapFaceSize / 2)
            // Where two overlap, and at the group's two ends.
            for (i in 1 until people.size) add(left + step * i + 2.dp)
            add(left + 2.dp)
            add(left + groupWidth - 2.dp)
            // 10 outside the faces' edges, inside the 48: one face (28) leaves 10 of touch room on each side.
            if (people.size == 1) {
                add(left - 9.5.dp)
                add(left + groupWidth + 9.5.dp)
            }
        }
        with(compose.density) {
            for (x in points) compose.onRoot().performTouchInput { click(androidx.compose.ui.geometry.Offset(x.toPx(), mid.toPx())) }
        }
        compose.waitForIdle()
        assertEquals("$n faces: every point opens it", points.size, opened)
        assertTrue("a finger's 48 tall at least", (b.bottom - b.top).value >= 48f - 0.5f)
    }

    @Test fun oneFaceOpensTheListAtItsCentre() = opensAtEveryFace(1)

    @Test fun twoFacesOpenTheListAtEachFaceAndTheOverlap() = opensAtEveryFace(2)

    @Test fun threeFacesOpenTheListAtEachFaceAndTheOverlaps() = opensAtEveryFace(3)

    /** The faces button for [author] (the author's line on their own story, or a reader's over 共振), as drawn at rest and held down. */
    private fun restAndHeld(author: Boolean): Pair<androidx.compose.ui.graphics.ImageBitmap, androidx.compose.ui.graphics.ImageBitmap> {
        compose.setContent {
            Box(Modifier.testTag("line").width(200.dp)) {
                TapFacesButton(TapFaces(false, listOf(dora, eli), more = false), viewerId = "alice", author = author, onOpen = {})
            }
        }
        compose.waitForIdle()
        val rest = compose.onNodeWithTag("line").captureToImage()
        compose.onNodeWithTag(if (author) "author-taps" else "tap-faces", useUnmergedTree = true).performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
        val held = compose.onNodeWithTag("line").captureToImage()
        compose.onNodeWithTag(if (author) "author-taps" else "tap-faces", useUnmergedTree = true).performTouchInput { up() }
        return rest to held
    }

    private fun assertSame(rest: androidx.compose.ui.graphics.ImageBitmap, held: androidx.compose.ui.graphics.ImageBitmap, what: String) {
        val a = rest.toPixelMap()
        val b = held.toPixelMap()
        assertEquals(a.width, b.width)
        var differ = 0
        for (y in 0 until a.height) for (x in 0 until a.width) if (a[x, y] != b[x, y]) differ++
        assertEquals("$what: pixels changed by a press", 0, differ)
    }

    // Round 34 (11), the owner pinned it down: the author's faces line on their own story has no press, hover or ripple
    // either — as the reader's faces over 共振. Drawn at rest and held, pixel for pixel the same.

    @Test fun theAuthorsFacesLineShowsNoPress() {
        val (rest, held) = restAndHeld(author = true)
        assertSame(rest, held, "the author's line")
        // Its call site adds nothing that reacts (no clickable or indication of its own).
        val page = File("src/main/kotlin/com/resonance/app/ui/CardScreen.kt").readText()
        assertTrue(page.contains("Modifier.onGloballyPositioned { endRowCoords = it }.padding(bottom = 40.dp)"))
    }

    @Test fun theReadersFacesOverResonanceShowNoPress() {
        val (rest, held) = restAndHeld(author = false)
        assertSame(rest, held, "the reader's faces")
    }
}
