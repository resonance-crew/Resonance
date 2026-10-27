package com.resonance.design

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Round 17 addendum A4: what lies under an overlay is softened only where the phone draws the blur within its frames —
 * a phone with a GPU keeps it, one drawing in software (an emulator with its GPU off) stops for good.
 */
class BackdropBlurBudgetTest {
    @After fun blurBack() = BackdropBlurBudget.reset()

    @Test fun aPhoneThatDrawsTheBlurWithinItsFramesKeepsIt() {
        BackdropBlurBudget.note(listOf(16.7f, 16.6f, 33.3f, 16.7f, 16.8f, 16.6f))
        assertTrue(BackdropBlurBudget.affordable)
        assertEquals(0.6f, BackdropBlurBudget.softening(0.6f), 0f)
        // One slow frame among quick ones (the overlay composing) is not the blur's doing.
        BackdropBlurBudget.note(listOf(250f, 16.7f, 16.7f, 20f, 16.7f, 16.7f))
        assertTrue(BackdropBlurBudget.affordable)
    }

    @Test fun aPhoneDrawingInSoftwareStopsSofteningForGood() {
        // An emulator with its GPU off: 150–400 ms a frame while the overlay came up.
        BackdropBlurBudget.note(listOf(180f, 250f, 310f, 220f, 290f, 160f))
        assertFalse(BackdropBlurBudget.affordable)
        assertEquals(0f, BackdropBlurBudget.softening(1f), 0f)
        // Quick frames later (nothing blurred any more) don't bring it back.
        BackdropBlurBudget.note(listOf(16.7f, 16.7f, 16.7f))
        assertFalse(BackdropBlurBudget.affordable)
    }
}
