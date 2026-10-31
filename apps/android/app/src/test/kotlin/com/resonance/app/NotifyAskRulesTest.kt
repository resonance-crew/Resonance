package com.resonance.app

import com.resonance.app.NotifyAskRules.Answer
import com.resonance.app.NotifyAskRules.DECLINE_PAUSE_MS
import com.resonance.app.NotifyAskRules.YesStep
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Asking for notifications in context (docs/specs/notification-asks.md): when each ask and invite shows, and what a yes does first. */
class NotifyAskRulesTest {
    private val now = 1_800_000_000_000L

    @Test fun theSystemsQuestion() {
        assertEquals(SystemQuestion.Allowed, NotifyAskRules.systemQuestion(canNotify = true, canAskPermission = false, refusedForGood = true))
        // Android 13+, not granted, never refused for good: ours may lead to it — a dialog put and closed with Back too.
        assertEquals(SystemQuestion.Undetermined, NotifyAskRules.systemQuestion(canNotify = false, canAskPermission = true, refusedForGood = false))
        // Refused for good: only the system settings turn them on.
        assertEquals(SystemQuestion.Denied, NotifyAskRules.systemQuestion(canNotify = false, canAskPermission = true, refusedForGood = true))
        // Below 13, switched off in the system settings: nothing to ask.
        assertEquals(SystemQuestion.Denied, NotifyAskRules.systemQuestion(canNotify = false, canAskPermission = false, refusedForGood = false))
    }

    /** A request's answer read with the system's rationale around it: Back is no answer, a second no is for good. */
    @Test fun whatARequestsAnswerSays() {
        assertEquals(Answer.Granted, NotifyAskRules.afterRequest(granted = true, rationaleBefore = false, rationaleAfter = false, refusedBefore = true))
        // A first no: the system would still ask (with a reason).
        assertEquals(Answer.RefusedOnce, NotifyAskRules.afterRequest(granted = false, rationaleBefore = false, rationaleAfter = true, refusedBefore = false))
        // Back on a first dialog: nothing changed.
        assertEquals(Answer.Dismissed, NotifyAskRules.afterRequest(granted = false, rationaleBefore = false, rationaleAfter = false, refusedBefore = false))
        // Back on a second dialog: the rationale stays on — still a first no, not a second.
        assertEquals(Answer.RefusedOnce, NotifyAskRules.afterRequest(granted = false, rationaleBefore = true, rationaleAfter = true, refusedBefore = true))
        // The second no turns the rationale off: for good.
        assertEquals(Answer.RefusedForGood, NotifyAskRules.afterRequest(granted = false, rationaleBefore = true, rationaleAfter = false, refusedBefore = true))
        // A no answered without a dialog after one before (the system's own "no more"): for good.
        assertEquals(Answer.RefusedForGood, NotifyAskRules.afterRequest(granted = false, rationaleBefore = false, rationaleAfter = false, refusedBefore = true))
    }

    @Test fun theReplyAskShowsOnlyWhileTheSystemWasNeverAsked() {
        assertTrue(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, declines = 0, lastDeclinedAt = null, now = now))
        // Allowed already, or refused: Settings says where to turn them on.
        assertFalse(NotifyAskRules.showsAsk(SystemQuestion.Allowed, 0, null, now))
        assertFalse(NotifyAskRules.showsAsk(SystemQuestion.Denied, 0, null, now))
    }

    @Test fun notNowPausesTheAskThreeDaysAndThreeEndIt() {
        // Said a moment ago, or a little under three days ago: not yet.
        assertFalse(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, declines = 1, lastDeclinedAt = now - 1_000, now = now))
        assertFalse(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, 1, now - DECLINE_PAUSE_MS + 1, now))
        // Three days on, at the next reaching-out moment: again.
        assertTrue(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, 1, now - DECLINE_PAUSE_MS, now))
        assertTrue(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, 2, now - DECLINE_PAUSE_MS * 10, now))
        // The third 先不要 is the last word, however long ago.
        assertFalse(NotifyAskRules.showsAsk(SystemQuestion.Undetermined, 3, now - DECLINE_PAUSE_MS * 100, now))
        assertEquals(3L * 24 * 60 * 60 * 1000, DECLINE_PAUSE_MS)
    }

    @Test fun anInviteShowsForItsReasonWhileItsSwitchIsOff() {
        assertTrue(NotifyAskRules.showsInvite(eligible = true, switchOn = false, system = SystemQuestion.Undetermined, answered = false))
        assertTrue(NotifyAskRules.showsInvite(true, false, SystemQuestion.Allowed, false))
        // Not yet five card pages, or no connection.
        assertFalse(NotifyAskRules.showsInvite(eligible = false, switchOn = false, system = SystemQuestion.Allowed, answered = false))
        // The switch unread, or on already.
        assertFalse(NotifyAskRules.showsInvite(true, null, SystemQuestion.Allowed, false))
        assertFalse(NotifyAskRules.showsInvite(true, true, SystemQuestion.Allowed, false))
        // Refused in the system: nothing to offer.
        assertFalse(NotifyAskRules.showsInvite(true, false, SystemQuestion.Denied, false))
        // 不用了, or turned on from it: never again on this install.
        assertFalse(NotifyAskRules.showsInvite(true, false, SystemQuestion.Allowed, answered = true))
        // Their pushes' channel turned off on its own: nothing would show.
        assertFalse(NotifyAskRules.showsInvite(true, false, SystemQuestion.Allowed, false, channelOff = true))
        assertEquals(5, NotifyAskRules.CARD_OPENS_FOR_PICKS)
    }

    @Test fun yesAsksTheSystemFirstOnlyWhenItWasNeverAsked() {
        assertEquals(YesStep.AskSystem, NotifyAskRules.yesStep(SystemQuestion.Undetermined))
        assertEquals(YesStep.Save, NotifyAskRules.yesStep(SystemQuestion.Allowed))
    }
}
