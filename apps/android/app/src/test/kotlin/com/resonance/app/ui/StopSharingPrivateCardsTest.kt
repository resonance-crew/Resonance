package com.resonance.app.ui

import com.resonance.api.models.Author
import com.resonance.api.models.FeedCard
import com.resonance.app.DraftService
import com.resonance.app.DraftValues
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.Delivery
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import java.io.IOException
import java.util.Date
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * After a 私人卡 shared in a thread: its sender can stop sharing it (停止分享) from the held message's
 * list — their own, delivered, not unsent, still the other person's pass (`privateShare`), any time —
 * the row after 收回; the recipient's thread then draws that card as one they can't read, not as read
 * before, while their own cards and anyone's public ones stay; and the publish step warns, only warns,
 * when 匿名公開 is chosen for a card once shared privately.
 */
class StopSharingPrivateCardsTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
    }

    @After fun restore() {
        Strings.language = language
        scope.cancel()
    }

    private val me = "me"
    private val bob = "bob"

    private fun message(
        sender: String,
        cardRef: String? = "k",
        privateShare: Boolean = true,
        delivery: Delivery = Delivery.Delivered,
        unsentAt: Date? = null,
        sentAt: Date = Date(0),
    ) = ChatMessage("m1", sender, "", sentAt, cardRef = cardRef, delivery = delivery, unsentAt = unsentAt, privateShare = privateShare)

    private fun card(
        author: String,
        published: String? = null,
        visibility: FeedCard.Visibility = FeedCard.Visibility.`private`,
    ) = FeedCard(
        id = "k", slug = null, title = "雨中散步", excerpt = "…", tags = emptyList(), publishedAt = published,
        author = Author(id = author, handle = author, initials = "B", accentColor = "", avatarUrl = null, avatarSeed = null, verified = false, region = null),
        anonymous = false, visibility = visibility, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 3, referenceCardId = null, reason = null, editedAt = null,
        trashedAt = null, purgeAt = null, restoresTo = null,
    )

    // The marker, as the listener hands it over

    @Test fun theMarkerIsReadBesideTheCardItShares() {
        val sent = Date(0)
        fun from(fields: Map<String, Any?>) = ChatMessage.from("m1", mapOf("senderId" to bob, "text" to "") + fields, sent, "https://resonance.channel")
        assertTrue(from(mapOf("cardRef" to "k", "privateShare" to true)).privateShare)
        assertFalse(from(mapOf("cardRef" to "k")).privateShare)
        // A stray marker without a card is no pass to anything; nor is anything but true.
        assertFalse(from(mapOf("privateShare" to true)).privateShare)
        assertFalse(from(mapOf("cardRef" to "", "privateShare" to true)).privateShare)
        assertFalse(from(mapOf("cardRef" to "k", "privateShare" to "true")).privateShare)
        // An unsent message keeps nothing but who and when.
        assertFalse(from(mapOf("cardRef" to "k", "privateShare" to true, "unsentAt" to Date(5))).privateShare)
        // The marker going while the thread is open is a change the history notices (data-class equality).
        assertNotEquals(from(mapOf("cardRef" to "k", "privateShare" to true)), from(mapOf("cardRef" to "k")))
    }

    // 停止分享 in the held message's list

    @Test fun stopSharingIsOfferedOnYourOwnDeliveredStillSharedCardAnyTime() {
        assertTrue(canStopSharing(message(me), me))
        // No 24 h window, unlike 收回.
        assertTrue(canStopSharing(message(me, sentAt = Date(System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000)), me))
        // Theirs, no longer shared, without a card, unsent, still on its way, or nobody signed in: none.
        assertFalse(canStopSharing(message(bob), me))
        assertFalse(canStopSharing(message(me, privateShare = false), me))
        assertFalse(canStopSharing(message(me, cardRef = null), me))
        assertFalse(canStopSharing(message(me, unsentAt = Date()), me))
        assertFalse(canStopSharing(message(me, delivery = Delivery.Sending), me))
        assertFalse(canStopSharing(message(me, delivery = Delivery.Failed), me))
        assertFalse(canStopSharing(message(me), null))
    }

    @Test fun theRowComesAfterUnsendAndBeforeReport() {
        assertEquals(
            listOf(MessageActionKind.Reply, MessageActionKind.Unsend, MessageActionKind.StopSharing),
            messageActionKinds(canReply = true, hasText = false, onLink = false, canUnsend = true, canReport = false, failed = false, canStopSharing = true),
        )
        // Past unsend's 24 h it stands alone.
        assertEquals(
            listOf(MessageActionKind.Reply, MessageActionKind.StopSharing),
            messageActionKinds(canReply = true, hasText = false, onLink = false, canUnsend = false, canReport = false, failed = false, canStopSharing = true),
        )
        assertEquals(
            listOf(MessageActionKind.Reply),
            messageActionKinds(canReply = true, hasText = false, onLink = false, canUnsend = false, canReport = false, failed = false),
        )
        Strings.language = Strings.Language.ZhTW
        assertEquals("停止分享", L10n.Messages.stopSharing)
        assertEquals("已停止分享這張私人卡", L10n.Messages.stoppedSharing)
        assertEquals("沒有停止分享，請再試一次", L10n.Messages.stopSharingError)
    }

    // The recipient's thread once sharing ends

    @Test fun aPrivateCardNoLongerSharedReadsAsOneYouCantSee() {
        val kept = card(bob, published = "2026-09-01T08:00:00Z")
        val draft = card(bob)
        // Bob's message to me lost its pass: his 私人卡 — kept, or never published — is no longer mine to read.
        assertTrue(sharingEnded(message(bob, privateShare = false), kept, me))
        assertTrue(sharingEnded(message(bob, privateShare = false), draft, me))
        // Still shared: read as before.
        assertFalse(sharingEnded(message(bob), kept, me))
        // My own bubbles and cards are unaffected.
        assertFalse(sharingEnded(message(me, privateShare = false), card(me), me))
        assertFalse(sharingEnded(message(bob, privateShare = false), card(me), me))
        // Someone else's card than the sender's (not a share of their own), or a card readers have: unaffected.
        assertFalse(sharingEnded(message(bob, privateShare = false), card("carol"), me))
        assertFalse(sharingEnded(message(bob, privateShare = false), card(bob, published = "2026-09-01T08:00:00Z", visibility = FeedCard.Visibility.`public`), me))
        // A link to a card (no cardRef), or a card not read: nothing to take back.
        assertFalse(sharingEnded(message(bob, cardRef = null, privateShare = false), draft, me))
        assertFalse(sharingEnded(message(bob, privateShare = false), null, me))
    }

    // The publish step's warning

    @Test fun theWarningShowsOnlyForAnonymousPublicOnACardOnceSharedPrivately() {
        assertTrue(sharedWarningShows(Audience.Anonymous, sharedPrivately = true))
        assertFalse(sharedWarningShows(Audience.Public, sharedPrivately = true))
        assertFalse(sharedWarningShows(Audience.Private, sharedPrivately = true))
        assertFalse(sharedWarningShows(null, sharedPrivately = true))
        assertFalse(sharedWarningShows(Audience.Anonymous, sharedPrivately = false))
        Strings.language = Strings.Language.ZhTW
        assertEquals("這張卡片曾私下分享給別人，他們會知道是你寫的", L10n.Write.Visibility.sharedWarning)
    }

    private val calls = WriterStepsTest.FakeCalls()

    private fun model(opened: DraftService.OpenedCard?) = WriteModel(
        WriterStepsTest.FakeStore(), calls, null, WriterStepsTest.FakeEditor(), opened, WriterStep.Publish, scope,
        reachedOut = {}, locale = { "zh-TW" },
    )

    private val kept = DraftService.OpenedCard(
        "d1", DraftValues(title = "雨中散步", story = "那天下午雨停了。", visibility = "private"),
        isPublished = false, slug = null, referenceCardId = null, hasPendingEdit = false,
    )

    @Test fun theStepAsksOnceAndWarnsWhileAnonymousPublicIsChosenNeverHoldingTheVerb() {
        calls.shared = true
        val m = model(kept)
        assertFalse(m.sharedWarning)
        m.askSharedPrivately()
        m.askSharedPrivately()
        assertEquals(listOf("d1"), calls.sharedAsked)
        assertTrue(m.sharedPrivately)
        assertFalse(m.sharedWarning)
        m.choose(Audience.Anonymous)
        assertTrue(m.sharedWarning)
        // Warn only: the verb still publishes it anonymously.
        assertEquals(StepVerb.PublishAnonymously, m.stepVerb)
        m.choose(Audience.Public)
        assertFalse(m.sharedWarning)
    }

    @Test fun aFailedQuestionIsNoWarningAndIsAskedAgainNextTime() {
        calls.sharedFails = IOException("offline")
        val m = model(kept)
        m.askSharedPrivately()
        m.choose(Audience.Anonymous)
        assertFalse(m.sharedWarning)
        calls.sharedFails = null
        calls.shared = true
        m.askSharedPrivately()
        assertEquals(listOf("d1", "d1"), calls.sharedAsked)
        assertTrue(m.sharedWarning)
    }

    @Test fun aCardBegunHereIsNeverAsked() {
        calls.shared = true
        val m = model(null)
        m.askSharedPrivately()
        assertTrue(calls.sharedAsked.isEmpty())
        m.choose(Audience.Anonymous)
        assertFalse(m.sharedWarning)
    }
}
