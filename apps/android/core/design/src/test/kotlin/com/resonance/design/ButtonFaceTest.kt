package com.resonance.design

import org.robolectric.RobolectricTestRunner
import org.junit.runner.RunWith
import com.resonance.design.generated.Tokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every button has a fill and none a pen line (OrganicButton.tsx's BTN_VARIANTS): the verb solid in
 * the deep terracotta with a cream label, everything beside it the tonal peach with the deep
 * label — the older names (Ghost, Outline, Text, TextAccent) wearing it too — the final destructive
 * confirm solid red, and the way into a destructive flow the red's own tint.
 */
// A composition of its own answers the palette's getters (composed): Compose's runtime wants Android's Trace.
@RunWith(RobolectricTestRunner::class)
class ButtonFaceTest {
    @Test fun noFaceIsSeeThrough() = composed {
        for (variant in ButtonVariant.entries) {
            assertTrue("$variant has a fill", ButtonFace.of(variant).fill.alpha == 1f)
        }
    }

    @Test fun theVerbIsTheDeepTerracottaWithACreamLabel() = composed {
        for (variant in listOf(ButtonVariant.Solid, ButtonVariant.Primary)) {
            val face = ButtonFace.of(variant)
            assertEquals(Tokens.ButtonFill, face.fill)
            assertEquals(Tokens.Cream, face.label)
            assertEquals(3.0, face.seed, 0.0)
        }
    }

    @Test fun cancelCloseRetryAndLoadMoreWearTheTonalPill() = composed {
        for (variant in listOf(ButtonVariant.Tonal, ButtonVariant.Text, ButtonVariant.TextAccent, ButtonVariant.Ghost, ButtonVariant.Outline)) {
            val face = ButtonFace.of(variant)
            assertEquals("$variant", Tokens.ButtonTonal, face.fill)
            assertEquals("$variant", Tokens.ButtonOnTonal, face.label)
            // A tinted face takes a wash of its own hue when pressed, not the filled faces' darkening.
            assertEquals("$variant", OrganicIndication.Wash, face.press)
        }
        // Each keeps the wobble of the variant it grew out of.
        assertEquals(401.0, ButtonFace.of(ButtonVariant.Text).seed, 0.0)
        assertEquals(601.0, ButtonFace.of(ButtonVariant.TextAccent).seed, 0.0)
        assertEquals(601.0, ButtonFace.of(ButtonVariant.Tonal).seed, 0.0)
    }

    @Test fun theFinalDestructiveConfirmIsSolidRedAndTheWayIntoItItsTint() = composed {
        val danger = ButtonFace.of(ButtonVariant.Danger)
        assertEquals(Tokens.DangerFill, danger.fill)
        assertEquals(Tokens.Cream, danger.label)
        val entry = ButtonFace.of(ButtonVariant.DangerTonal)
        assertEquals(Tokens.ButtonDangerTonal, entry.fill)
        assertEquals(Tokens.ButtonOnDangerTonal, entry.label)
    }

    @Test fun everyFaceButPaperCarriesTheButtonsGrain() = composed {
        for (variant in ButtonVariant.entries) {
            val face = ButtonFace.of(variant)
            if (variant == ButtonVariant.Paper) assertEquals("grain-card", face.grainTile)
            else assertEquals("$variant", "grain-button", face.grainTile)
        }
    }
}
