package com.resonance.app

/**
 * Asking for notifications in context (docs/specs/notification-asks.md): never at signup — at the
 * moment the reason is plain, our own words first, then the system's question. The decisions, apart
 * from Android so they can be tested; [PushCenter] keeps the install's memory, [Session] the account's.
 */

/** Where the system's notification question stands for this install. */
enum class SystemQuestion {
    /** Never asked (Android 13+, not granted): our ask may lead to it. */
    Undetermined,

    /** Notifications show. */
    Allowed,

    /** Refused, or switched off in the system settings (below 13 there is nothing to ask): only Settings turns them on. */
    Denied,
}

/** What the person just did that makes a reply worth hearing about (§2): its own title and line. */
enum class AskKind {
    /** A note or a message sent. */
    Reply,

    /** A card published. */
    Publish,
}

object NotifyAskRules {
    /** After a 先不要, the ask waits this long before the next reaching-out moment may show it again. */
    const val DECLINE_PAUSE_MS = 3L * 24 * 60 * 60 * 1000

    /** After this many 先不要s the ask never comes back on this install. */
    const val MAX_DECLINES = 3

    /** The card pages an account opens on this install before the evening card is offered (§3). */
    const val CARD_OPENS_FOR_PICKS = 5

    /**
     * Where the system's question stands: [canNotify] (the app's notifications show), [canAskPermission]
     * (Android 13+ and not granted — below 13, notifications off have nothing to ask), [refusedForGood]
     * (a request answered no once the dialog can't show again: [afterRequest]). A dialog put and closed
     * with Back answered nothing: the question stays open.
     */
    fun systemQuestion(canNotify: Boolean, canAskPermission: Boolean, refusedForGood: Boolean): SystemQuestion = when {
        canNotify -> SystemQuestion.Allowed
        !canAskPermission || refusedForGood -> SystemQuestion.Denied
        else -> SystemQuestion.Undetermined
    }

    /** What a request's answer says, beside what this install knew ([PushCenter]'s memory). */
    enum class Answer {
        /** Given. */
        Granted,

        /** Refused once: the system would still show its dialog (it wants a reason first). */
        RefusedOnce,

        /** Refused for good: the system answers no without a dialog from now on — only its settings turn them on. */
        RefusedForGood,

        /** Closed with Back, or a no that changed nothing: no answer. */
        Dismissed,
    }

    /**
     * Reads a permission request's result: [granted]; [rationaleBefore] / [rationaleAfter], the
     * system's shouldShowRequestPermissionRationale around it; [refusedBefore], a no recorded earlier.
     * A first no turns the rationale on; a second (or a no after one) turns it off for good; Back
     * changes neither — so a no with the rationale off after it is for good only when there was a no
     * before it.
     */
    fun afterRequest(granted: Boolean, rationaleBefore: Boolean, rationaleAfter: Boolean, refusedBefore: Boolean): Answer = when {
        granted -> Answer.Granted
        rationaleAfter -> Answer.RefusedOnce
        rationaleBefore || refusedBefore -> Answer.RefusedForGood
        else -> Answer.Dismissed
    }

    /**
     * Whether reaching someone shows our ask (§2): only while the system was never asked, never after
     * [MAX_DECLINES] 先不要s, and not within [DECLINE_PAUSE_MS] of the last one.
     */
    fun showsAsk(system: SystemQuestion, declines: Int, lastDeclinedAt: Long?, now: Long): Boolean =
        system == SystemQuestion.Undetermined &&
            declines < MAX_DECLINES &&
            (lastDeclinedAt == null || now - lastDeclinedAt >= DECLINE_PAUSE_MS)

    /**
     * Whether an invite card shows (§3, §4): its reason holds ([eligible]: five card pages opened, or a
     * connection), its switch is known to be off ([switchOn] null while unread), the system's question
     * isn't refused, this account hasn't answered it on this install, and its pushes' channel isn't off on
     * its own ([channelOff]: the "picks" channel, both invites' pushes come on it).
     */
    fun showsInvite(eligible: Boolean, switchOn: Boolean?, system: SystemQuestion, answered: Boolean, channelOff: Boolean = false): Boolean =
        eligible && switchOn == false && system != SystemQuestion.Denied && !answered && !channelOff

    /** What an invite's 好，通知我 does first. */
    enum class YesStep {
        /** The system's question (never asked): the switch is saved once it says yes. */
        AskSystem,

        /** Notifications already show: the switch is saved at once. */
        Save,
    }

    fun yesStep(system: SystemQuestion): YesStep =
        if (system == SystemQuestion.Undetermined) YesStep.AskSystem else YesStep.Save
}
