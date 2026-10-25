package com.resonance.app.ui

import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.serialization.NavBackStackSerializer
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.app.DraftService
import com.resonance.app.DraftValues
import com.resonance.design.OklchColor
import com.resonance.design.OnDarkDisc
import com.resonance.kit.l10n.Strings
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Round 12's rules on Android that aren't drawing alone: the picture viewer's ✕ on a disc of the
 * viewer's own dark (§1–2: half strength at rest, 72 % pressed, 40 across in a finger's 48, its
 * centre 16 + 22 in from the top and end), and a 私人卡's ⋯ on its own page (§3): 公開發表 in 編輯's
 * place — the pen beside it is 編輯 already — opening the writer at its publish step with the card
 * offered to readers, 公開, or 匿名公開 for a card already anonymous; the card box's ⋯ keeps 編輯.
 */
class RoundTwelveTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val store = WriterStepsTest.FakeStore()

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    // §1–2 the viewer's ✕

    @Test fun theViewersCloseStandsOnADiscOfItsOwnDarkAtHalfDeeperPressed() {
        assertEquals(OklchColor.parse("oklch(12% 0.01 60)"), OnDarkDisc.Ink)
        assertEquals(0.5f, OnDarkDisc.alpha(pressed = false))
        assertEquals(0.72f, OnDarkDisc.alpha(pressed = true))
        assertEquals(40.dp, OnDarkDisc.Disc)
        assertEquals(48.dp, OnDarkDisc.Target)
        // The web's bare-button wash, its seed fixed.
        assertEquals(5.0, OnDarkDisc.SEED, 0.0)
    }

    @Test fun theCloseDiscsCentreIs16Plus22InFromTheTopAndEnd() {
        assertEquals(38.dp, ViewerCloseCentre)
        // The 48 target sits 14 in, so the disc's centre is where the web's 44 one is.
        assertEquals(14.dp, ViewerCloseInset)
        assertEquals(ViewerCloseCentre, ViewerCloseInset + OnDarkDisc.Target / 2)
    }

    // §3 the ⋯'s first row

    private fun card(published: Boolean, visibility: FeedCard.Visibility, anonymous: Boolean = false) = FeedCard(
        id = "c1", slug = if (published) "a-walk" else null, title = "雨中散步", excerpt = "…", tags = emptyList(),
        publishedAt = if (published) "2026-09-01T08:00:00Z" else null,
        author = null, anonymous = anonymous, visibility = visibility, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 1, referenceCardId = null, reason = null,
    )

    private fun detail(c: FeedCard) = CardDetail(
        card = c, story = "", visibility = CardDetail.Visibility.`public`, anonymous = c.anonymous, resonanceCount = 0,
        coreInsight = null, isOwner = true, referenceCard = null,
    )

    /** The rows the card page's ⋯ shows for [c]: the pen beside it exactly when it is a 私人卡. */
    private fun pageRows(c: FeedCard, answering: Boolean = false) =
        menuRows(seenByReaders(c.publishedAt != null, c.visibility.value), answering, penBeside = isPrivateCard(detail(c)))

    @Test fun aPrivateCardsOwnPageLeadsItsMenuWithPublishPublicly() {
        // Never published, or published and kept private: 公開發表 · (取消共振) · 刪除.
        for (c in listOf(card(published = false, FeedCard.Visibility.`private`), card(published = true, FeedCard.Visibility.`private`))) {
            assertEquals(listOf(MenuRow.PublishPublicly, MenuRow.Delete), pageRows(c))
            assertEquals(listOf(MenuRow.PublishPublicly, MenuRow.Unresonate, MenuRow.Delete), pageRows(c, answering = true))
        }
        // A draft given an audience before it was ever published is a 私人卡 too.
        assertEquals(MenuRow.PublishPublicly, pageRows(card(published = false, FeedCard.Visibility.`public`)).first())
    }

    @Test fun aCardReadersHaveKeepsEditAndTheCardBoxKeepsEdit() {
        // Readers have it: its page has no pen, its ⋯ is as it was.
        assertEquals(listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Delete), pageRows(card(published = true, FeedCard.Visibility.`public`)))
        assertEquals(listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Delete), pageRows(card(published = true, FeedCard.Visibility.connections)))
        // The card box's ⋯ has no pen beside it: 編輯 stays, 私人卡 or not.
        assertEquals(listOf(MenuRow.Edit, MenuRow.Delete), menuRows(seen = false, answering = false))
        // A pen is never beside a card readers have; were it asked, 編輯 and 轉為私人卡 stay.
        assertEquals(listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Delete), menuRows(seen = true, answering = false, penBeside = true))
    }

    @Test fun publishPubliclyOpensTheWriterOnTheCardAtItsStep() {
        val route = publishRoute("c1", showsCard = false)
        assertEquals(Route.Write(cardId = "c1", showsCard = false, publishing = true), route)
        // Its own page is underneath: the card isn't opened again on the way out.
        assertEquals(false, route.showsCard)
        // A writer page of its own, beside a plain 編輯 of the same card.
        assertNotEquals(Route.Write(cardId = "c1", showsCard = false).contentKey, route.contentKey)
        // Saved with the stack and back as itself.
        val serializer = NavBackStackSerializer(Route.serializer())
        assertEquals(listOf<Route>(route), Json.decodeFromString(serializer, Json.encodeToString(serializer, NavBackStack(route))).toList())
    }

    // §3 the writer it opens

    private val written = DraftValues(title = "雨中散步", story = "那天下午雨停了。", visibility = "private")

    private fun model(opened: DraftService.OpenedCard?, publishing: Boolean, initialStep: WriterStep = WriterStep.Write) = WriteModel(
        store, WriterStepsTest.FakeCalls(), null, WriterStepsTest.FakeEditor(), opened, initialStep, scope,
        reachedOut = {}, locale = { "zh-TW" }, publishing = publishing,
    )

    private fun draft(values: DraftValues) =
        DraftService.OpenedCard("d1", values, isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false)

    private fun keptPrivate(values: DraftValues) =
        DraftService.OpenedCard("c1", values, isPublished = true, slug = "a-walk", referenceCardId = null, hasPendingEdit = false, liveVisibility = "private", liveAnonymous = values.anonymous)

    @Test fun theOfferIsPublicAndAnonymousForACardAlreadyAnonymous() {
        assertEquals(Audience.Public, publishingAudience(anonymous = false))
        assertEquals(Audience.Anonymous, publishingAudience(anonymous = true))
    }

    @Test fun aDraftOpensAtThePublishStepWithPublicChosenAndSavesTheChoice() = runBlocking {
        val m = model(draft(written), publishing = true)
        assertEquals(WriterStep.Publish, m.step)
        assertEquals(Audience.Public, m.audience)
        assertEquals(Triple(StepVerb.Publish, "發布", "發布這張卡片"), Triple(m.stepVerb, m.verb, m.stepTitle))
        // A choice like any in the step: autosaved with the draft.
        m.saveNow()
        assertEquals("d1" to written.copy(visibility = "public"), store.updates.last())
        // Still the writer's to change.
        m.choose(Audience.Private)
        assertEquals(Triple(StepVerb.Save, "儲存", "儲存私人卡"), Triple(m.stepVerb, m.verb, m.stepTitle))
    }

    @Test fun aPublishedPrivateCardAlreadyAnonymousIsOfferedAnonymously() = runBlocking {
        val m = model(keptPrivate(written.copy(anonymous = true)), publishing = true)
        assertEquals(WriterStep.Publish, m.step)
        assertEquals(Audience.Anonymous, m.audience)
        assertEquals(Triple(StepVerb.PublishAnonymously, "匿名發布", "發布這張卡片"), Triple(m.stepVerb, m.verb, m.stepTitle))
        // Its words go to its pending edit, as every write to a published card does; never under its author's name.
        m.saveNow()
        assertEquals("c1" to written.copy(visibility = "public", anonymous = true), store.edits.last())
        // Named and kept private, it is offered 公開.
        assertEquals(Audience.Public, model(keptPrivate(written), publishing = true).audience)
    }

    @Test fun withoutTheOfferTheWriterOpensAsItWasLeft() {
        // 編輯 (the pen, the card box): writing first, the card as it is.
        val edit = model(draft(written), publishing = false)
        assertEquals(WriterStep.Write, edit.step)
        assertEquals(Audience.Private, edit.audience)
        // Restored after the offer was made: the step and the choice it was left with, never offered again.
        val restored = model(draft(written), publishing = false, initialStep = WriterStep.Publish)
        assertEquals(WriterStep.Publish, restored.step)
        assertEquals(Audience.Private, restored.audience)
        assertTrue(store.updates.isEmpty())
        // A new card is never opened at the step.
        assertEquals(WriterStep.Write, model(null, publishing = true).step)
    }
}
