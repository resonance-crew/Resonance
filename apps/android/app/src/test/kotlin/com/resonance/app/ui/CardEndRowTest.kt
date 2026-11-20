package com.resonance.app.ui

import com.resonance.design.generated.IconName
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.joinAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

/**
 * The end of someone else's story (round 26 §U1): three answers in one capsule — 共振 (a switch), 寄小紙條, 用卡片回應
 * (the old 共振) — all tonal at rest; the reply's short words, then two lines, where the full ones don't fit, and never a
 * segment hidden; the tap flipping at once and back on a refusal.
 */
class CardEndRowTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    // Words' widths (dp) at 14/600, about as the bar measures them.
    private val zhFull = listOf(28f, 56f, 70f) // 共振 · 寄小紙條 · 用卡片回應
    private val zhShort = listOf(28f, 56f, 42f) // … · 寫卡片

    @Test fun theThreeFitAPhoneOf390InChinese() {
        // §U1.3: 共振 ≈ 80 + 寄小紙條 ≈ 110 + 用卡片回應 ≈ 125 ≤ 350.
        assertEquals(EndRowForm.Full, EndRowLayout.choose(zhFull, zhShort, room = 350f, english = false, largeText = false))
        assertTrue(EndRowLayout.need(zhFull) <= 350f)
    }

    @Test fun aNarrowColumnEnglishOrLargeTextTakeTheShortWords() {
        assertEquals(EndRowForm.Short, EndRowLayout.choose(zhFull, zhShort, room = 340f, english = false, largeText = false))
        assertEquals(EndRowForm.Short, EndRowLayout.choose(zhFull, zhShort, room = 600f, english = true, largeText = false))
        assertEquals(EndRowForm.Short, EndRowLayout.choose(zhFull, zhShort, room = 600f, english = false, largeText = true))
    }

    @Test fun stillTooWideItTakesTwoLinesAndHidesNothing() {
        // Large text: the words twice as wide.
        val big = zhShort.map { it * 2.2f }
        assertEquals(EndRowForm.TwoLines, EndRowLayout.choose(zhFull.map { it * 2.2f }, big, room = 330f, english = false, largeText = true))
        // Two lines span the column, row 2 with them.
        assertEquals(330f, EndRowLayout.capsuleWidth(big, 330f, EndRowForm.TwoLines))
    }

    @Test fun rowTwoIsAsWideAsTheCapsule() {
        // A phone's capsule spans its column; a tablet's stands at its own width.
        assertEquals(350f, EndRowLayout.capsuleWidth(zhFull, 350f, EndRowForm.Full))
        val own = EndRowLayout.capsuleWidth(zhFull, 700f, EndRowForm.Full)
        assertTrue(own < 700f)
        assertEquals(EndRowLayout.need(zhFull, 24f), own)
    }

    @Test fun theTapIsASwitchWithTwoWavesInPhaseWhenOn() {
        // One set of words on and off (the owner, 2026-11-20: 已共振 moved the wave beside it); the icon and face change.
        assertEquals("共振", tapLabel)
        assertEquals(IconName.Wave, tapIcon(false))
        assertEquals(IconName.WavePair, tapIcon(true))
        Strings.language = Strings.Language.En
        assertEquals("Resonate", tapLabel)
    }

    @Test fun theReplyIsTheOldResonanceInItsNewWords() {
        // Replaces ResonateActionTest (round 26 §U1.1, §S2): 用卡片回應 with the cards glyph — never 連結, never the link.
        for (mine in listOf(null, ReplyAction.Mine.None)) {
            assertEquals("用卡片回應", ReplyAction.of(mine, short = false).label)
            assertEquals("寫卡片", ReplyAction.of(mine, short = true).label)
            assertEquals(IconName.Cards, ReplyAction.of(mine, short = false).icon)
        }
        val draft = ReplyAction.of(ReplyAction.Mine.Found(published = false), short = false)
        assertEquals("修改", draft.label)
        assertEquals(IconName.Pen, draft.icon)
        val done = ReplyAction.of(ReplyAction.Mine.Found(published = true), short = true)
        assertEquals("已回應", done.label)
        assertEquals(IconName.Check, done.icon)
        Strings.language = Strings.Language.En
        assertEquals("Card", ReplyAction.of(null, short = true).label)
        assertEquals("Replied", done.let { ReplyAction.of(ReplyAction.Mine.Found(true), short = true).label })
    }

    @Test fun theTapFlipsAtOnceAndBackOnARefusal() = runBlocking {
        var failed = 0
        val sent = mutableListOf<Boolean>()
        val switch = TapSwitch(false, launch = { launch(block = it) }, send = { on -> sent += on; throw IOException("offline") }, onFailed = { failed++ })
        val job = switch.flip()
        // Drawn on before the server answers.
        assertTrue(switch.on)
        job.join()
        assertFalse(switch.on)
        assertEquals(1, failed)
        assertEquals(listOf(true), sent)
    }

    @Test fun flipsMadeWhileOneIsOnItsWayEndWhereTheLastLeftIt() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val sent = mutableListOf<Boolean>()
        val switch = TapSwitch(false, launch = { launch(block = it) }, send = { on -> sent += on; gate.await(); on })
        val jobs = mutableListOf(switch.flip()) // on
        yield()
        jobs += switch.flip() // off, while on is on its way
        jobs += switch.flip() // on again
        jobs += switch.flip() // off
        yield()
        assertFalse(switch.on)
        gate.complete(Unit)
        jobs.joinAll()
        // on went, then off: the server ends where the segment does; the flips in between sent nothing.
        assertEquals(listOf(true, false), sent)
        assertFalse(switch.on)
    }

    @Test fun aPageReadAgainSaysWhatTheServerHas() {
        val switch = TapSwitch(false, launch = { error("nothing sent") }, send = { it })
        switch.read(true)
        assertTrue(switch.on)
    }

    @Test fun aTapStillGoesOnceTheRowHasLeftThePage() = runBlocking {
        // The account's scope (Session's) and the end row's own (rememberCoroutineScope), which goes with the row.
        val account = CoroutineScope(coroutineContext + SupervisorJob(coroutineContext[Job]))
        val screen = CoroutineScope(coroutineContext + Job())
        val answered = CompletableDeferred<Unit>()
        val puts = mutableListOf<Boolean>()
        var told: Boolean? = null
        var failed = 0
        val switch = TapSwitch(
            false,
            launch = { account.launch(block = it) },
            // The fake API: the PUT is made, and answers after the reader has gone back.
            send = { on -> answered.await(); puts += on; told = on; on },
            onFailed = { failed++ },
        )
        val job = switch.flip()
        yield()
        // Back, another page, or the story's end flung away: the row leaves composition before the server answers.
        screen.cancel()
        answered.complete(Unit)
        job.join()
        assertFalse(job.isCancelled)
        assertEquals(listOf(true), puts)
        // The page was told (onTapChanged), nothing said as failed, and the switch ends where the server is.
        assertEquals(true, told)
        assertEquals(0, failed)
        assertTrue(switch.on)
        account.cancel()
    }
}
