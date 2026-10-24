package com.resonance.app.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The publish step's card on a phone is the list's full-bleed band. First under the writer's bar it
 * is drawn as the home feed's first card — the bar's pen line its top edge, no rule of its own a
 * hair below it; with anything above it (the mirror line, a live card's update hint) it keeps its
 * rule — a published card kept private has no hint, so its band leads too.
 */
class PublishBandTest {
    @Test fun aNewCardsBandWithNothingAboveItIsTheFirstCardUnderTheBar() {
        assertTrue(bandUnderBar(bar = true, compact = true, hint = false, mirrorOnScreen = false))
    }

    @Test fun theMirrorLineAboveTheBandKeepsItsRuleUntilItHasFoldedAway() {
        // Asked, answered, or still folding: the line stands between the bar and the band.
        assertFalse(bandUnderBar(bar = true, compact = true, hint = false, mirrorOnScreen = true))
    }

    @Test fun anUpdateHintAboveTheBandKeepsItsRule() {
        assertFalse(bandUnderBar(bar = true, compact = true, hint = true, mirrorOnScreen = false))
    }

    @Test fun onlyAPhonesBandUnderTheWritersOwnBar() {
        // At the split the step's own heading leads the pane; a wider window shows a bordered card.
        assertFalse(bandUnderBar(bar = false, compact = true, hint = false, mirrorOnScreen = false))
        assertFalse(bandUnderBar(bar = true, compact = false, hint = false, mirrorOnScreen = false))
    }
}
