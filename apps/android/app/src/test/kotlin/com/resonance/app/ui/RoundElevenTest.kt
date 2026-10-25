package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import com.resonance.api.models.FeedCard
import com.resonance.api.models.RestoredCard
import com.resonance.api.models.TrashedCard
import com.resonance.design.BarLineInset
import com.resonance.design.ComposerFade
import com.resonance.design.ComposerRowsLead
import com.resonance.design.TabletBarRowDrop
import com.resonance.design.Toasts
import com.resonance.design.TopBarRow
import com.resonance.design.aloneDrop
import com.resonance.design.tabletRowTop
import com.resonance.kit.api.WritingApi
import com.resonance.kit.l10n.Strings
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Round 11's rules that aren't drawing alone: the foot's short fade (12, starting 6 over riding
 * rows), the writer's head and its title's gap from the reading head's numbers, the publish step's
 * one section gap, the save state's line under the title, a tablet's back bar row set lower, and
 * the trash shelf's restore toast saying who reads the card now — read off the restore's answer.
 */
class RoundElevenTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private fun card(published: Boolean = true, visibility: FeedCard.Visibility = FeedCard.Visibility.`public`, anonymous: Boolean = false) = FeedCard(
        id = "c", slug = null, title = "t", excerpt = "", tags = emptyList(),
        publishedAt = if (published) "2026-09-01T00:00:00Z" else null,
        author = null, anonymous = anonymous, visibility = visibility, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
    )

    // §3

    @Test fun theFootFadesInOver12StartingSixOverTheRows() {
        assertEquals(12.dp, ComposerFade)
        // The fade ends where a riding row's ink starts: 6 into it.
        assertEquals(6.dp, ComposerRowsLead)
        assertEquals(6.dp, ComposerFade - ComposerRowsLead)
    }

    // §4

    @Test fun theWritersTitleStandsWhereACardPagesTitleDoes() {
        // From the bar's foot, which lies BarLineInset under its pen line: 48 / 64 from that line, 56 / 72 to a card.
        assertEquals(48f, (writerHead(compact = true) + BarLineInset).value, 0.01f)
        assertEquals(64f, (writerHead(compact = false) + BarLineInset).value, 0.01f)
        assertEquals(72f, (writerHead(compact = false, cover = true) + BarLineInset).value, 0.01f)
        // The title → the story: 32 everywhere, well over a paragraph's gap (the review made a phone's 32 too).
        assertEquals(32.dp, writerTitleGap(compact = false))
        assertEquals(32.dp, writerTitleGap(compact = true))
    }

    @Test fun thePublishStepsSectionsAreOneGapApart() {
        assertEquals(48.dp, publishSectionGap(compact = false))
        assertEquals(40.dp, publishSectionGap(compact = true))
        assertEquals(12.dp, PublishLabelGap)
        // A tablet's card stands where a cover would only while nothing (the hint, the mirror) is over it.
        assertTrue(cardFirstUnderBar(hint = false, mirrorOnScreen = false))
        assertEquals(false, cardFirstUnderBar(hint = true, mirrorOnScreen = false))
        assertEquals(false, cardFirstUnderBar(hint = false, mirrorOnScreen = true))
    }

    // §5

    @Test fun aTitleAloneStandsHalfItsStatesLineLower() {
        // The state's 12 on 1.4 and the 1 between: the title alone goes 8.9 down, onto the row's middle (the web's 9).
        assertEquals(8.9f, aloneDrop(16.8.dp).value, 0.01f)
    }

    // §6

    @Test fun aTabletsBackBarSetsItsRowSixLowerAndClearOfItsFoot() {
        assertEquals(6.dp, TabletBarRowDrop)
        val row = TopBarRow.value.toInt()
        // ← and ✓'s 48 tap box: 12 → 18 from the row's top, its foot 66 — inside the 72 row, above the pen line.
        assertEquals(18, tabletRowTop(row, 48, TabletBarRowDrop.value.toInt()))
        assertTrue(tabletRowTop(row, 48, TabletBarRowDrop.value.toInt()) + 48 <= row)
    }

    // §7

    @Test fun whoReadsARestoredCardComesFromTheRestoresAnswer() {
        assertEquals(RestoredAs.Private, restoredAs(card(published = false)))
        // Never published: a 私人卡 whatever it was set to be.
        assertEquals(RestoredAs.Private, restoredAs(card(published = false, visibility = FeedCard.Visibility.`public`, anonymous = true)))
        assertEquals(RestoredAs.Private, restoredAs(card(visibility = FeedCard.Visibility.`private`)))
        assertEquals(RestoredAs.Private, restoredAs(card(visibility = FeedCard.Visibility.`private`, anonymous = true)))
        assertEquals(RestoredAs.Connections, restoredAs(card(visibility = FeedCard.Visibility.connections)))
        assertEquals(RestoredAs.Anonymous, restoredAs(card(anonymous = true)))
        assertEquals(RestoredAs.Public, restoredAs(card()))
        assertEquals("已還原為私人卡", restoredToast(card(published = false)))
        assertEquals("已還原為公開卡片", restoredToast(card()))
        assertEquals("已還原為匿名公開卡片", restoredToast(card(anonymous = true)))
        assertEquals("已還原，僅連結的人看得到", restoredToast(card(visibility = FeedCard.Visibility.connections)))
    }

    @Test fun theShelfsRestoreSaysWhoReadsItAndEveryOtherRestoreSaysRestored() = runBlocking {
        var answer = card(anonymous = true)
        var dropped = false
        val calls = object : TrashCalls {
            override suspend fun trash(cardId: String) = TrashedCard(answer, changed = true)
            override suspend fun restore(cardId: String) = RestoredCard(answer, changed = true, droppedResonance = dropped)
            override suspend fun deleteForever(cardId: String) {}
            override suspend fun emptyTrash() = WritingApi.EmptiedTrash(deleted = 0, remaining = 0)
            override suspend fun trashLeft() = 0
        }
        val toasts = Toasts()
        val trash = TrashCenter(calls, {}, toasts, scope)
        // The shelf's ⋯ 還原.
        trash.restoreSaying(TrashRef("c"), sayWho = true)
        assertEquals("已還原為匿名公開卡片", toasts.current?.message)
        answer = card(visibility = FeedCard.Visibility.`private`)
        trash.restoreSaying(TrashRef("c"), sayWho = true)
        assertEquals("已還原為私人卡", toasts.current?.message)
        // The banner's 還原, the toast's 復原: 已還原, as before.
        trash.restoreSaying(TrashRef("c"))
        assertEquals("已還原", toasts.current?.message)
        // A resonance that came back on its own keeps its notice.
        dropped = true
        toasts.dismiss()
        trash.restoreSaying(TrashRef("c"), sayWho = true)
        assertTrue(trash.restoredAlone)
    }
}
