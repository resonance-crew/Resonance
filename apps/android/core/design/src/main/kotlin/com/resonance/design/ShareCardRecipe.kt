package com.resonance.design

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.WobRectOptions
import com.resonance.kit.story.StoryScript

/**
 * A story card made into a picture — the 9:16 share image (share.spec §4.5), its numbers written
 * once on the web (src/lib/share/shareCard.ts SHARE_CARD) and read here as native/fixtures/
 * share-card.json pins them (ShareCardRecipeTest). Lengths are points on the 360 × 640 canvas,
 * before [Canvas.SCALE]; the type is the story's own ([StoryType]'s tokens, by the story's script),
 * only its sizes and line budgets the card's; the colours are the card's family ([palette]).
 *
 * Never on the card: tags, read time, a region flag, counts, the URL path, a QR code, anything
 * shaped like a button, anything about the sharer. An anonymous card's byline is [Anonymous] —
 * never a photo, pen name, initials, region or verified mark.
 */
object ShareCardRecipe {
    object Canvas {
        const val WIDTH = 360f
        const val HEIGHT = 640f
        /** 1080 × 1920 px. */
        const val SCALE = 3f
        const val JPEG_QUALITY = 0.9f
    }

    /** Kept clear of Stories' own chrome: the card is centred between these. */
    object SafeZone {
        const val TOP = 84f
        const val BOTTOM = 527f
    }

    /** The card palette's fill with the band's grain (the tile `grain-overlay`). */
    object Backdrop {
        const val GRAIN = StoryGrain.Band
        const val GRAIN_TILE = "grain-overlay"
    }

    /** The desktop StoryCard: its outline, its paper and the one pen. */
    object Card {
        const val WIDTH = 300f
        const val MAX_HEIGHT = 443f
        const val PADDING = 22f
        const val PADDING_BOTTOM = 22f
        const val RADIUS = 22f
        /** wobRect(w, h, RADIUS, seedFromId(card id), min(w, h) × OUTLINE_MAGNITUDE, OUTLINE). */
        const val OUTLINE_MAGNITUDE = 0.025
        val OUTLINE: WobRectOptions get() = BorderedCardWob
        /** The paper: the family's interior (oklch(97.5% 0.012 hue)) with the card's paper grain. */
        const val PAPER_GRAIN = BorderedCardGrain
        const val PAPER_GRAIN_TILE = "grain-card"
        /** The pen in the family's border ink, at the one pen's width. */
        val PEN_WIDTH: Float get() = Tokens.Ink.value
    }

    /** A cover, when the card has one: 256 × 128, clipped in an OrganicImage shape seeded + 5. */
    object Cover {
        const val RATIO = 0.5f
        const val SEED_OFFSET = 5
        const val GRAIN = StoryGrain.Cover
        const val GAP_BELOW = 16f
    }

    /** The card's own title, untranslated, in the story's title type, tail ellipsis. */
    object Title {
        const val SIZE_WITH_COVER = 22f
        const val MAX_LINES_WITH_COVER = 2
        const val SIZE_WITHOUT_COVER = 26f
        const val MAX_LINES_WITHOUT_COVER = 3
        const val GAP_BELOW = 12f
    }

    /** The story's opening (SharePassages.opening), line breaks kept, in the story's body type, tail ellipsis. */
    object Words {
        const val SIZE = 14f
        const val MAX_LINES_WITH_COVER = 4
        const val MAX_LINES_WITHOUT_COVER = 8
        /** Omitted, with its gap, when the story has nothing to quote. */
        const val GAP_BELOW = 16f
    }

    /** StoryCardSeparator: wavyLine(width, seed + SEED_OFFSET, AMPLITUDE, STEPS) in the family's separator ink. */
    object Rule {
        const val HEIGHT = 6f
        val WIDTH: Float get() = Tokens.InkLight.value
        const val SEED_OFFSET = 91
        const val AMPLITUDE = 1.2
        const val STEPS = 6
        const val GAP_BELOW = 14f
    }

    /** The avatar, the pen name (and the verified mark) over the date. */
    object Byline {
        const val HEIGHT = 32f
        const val AVATAR = 30f
        const val AVATAR_OUTLINE = "oklch(36% 0.06 60 / 0.55)"
        val AVATAR_WIDTH: Float get() = Tokens.Ink.value
        const val GAP = 10f
        const val NAME_SIZE = 13f
        const val NAME_WEIGHT = 600
        const val NAME_LEADING = 1.3f
        const val VERIFIED_SIZE = 12f
        const val VERIFIED_GAP = 4f
        const val DATE_SIZE = 11.5f
        const val DATE_WEIGHT = 400
        /** The least room between the byline and the lockup. */
        const val MIN_SPACE = 8f
    }

    /** An anonymous card's byline: "·" on cream-dark, seed 97, and 匿名 / Anonymous (card.anonymousAuthor) in the muted ink. */
    object Anonymous {
        const val INITIALS = "·"
        const val SEED = 97.0
        val FILL: Color get() = Tokens.CreamDark
        val NAME_COLOUR: Color get() = Tokens.TextMuted
    }

    /** Right-aligned at the byline's end, where a feed card has its →: the wave and Resonance over resonance.channel. */
    object Lockup {
        val WAVE: IconName get() = IconName.Wave
        const val WAVE_SIZE = 16f
        val WAVE_WIDTH: Float get() = Tokens.Ink.value
        const val GAP = 4f
        const val WORDMARK = "Resonance"
        const val WORDMARK_SIZE = 13f
        const val WORDMARK_WEIGHT = 700
        const val WORDMARK_TRACKING = -0.02f
        const val DOMAIN = "resonance.channel"
        const val DOMAIN_SIZE = 10.5f
        const val DOMAIN_WEIGHT = 400
        const val DOMAIN_TRACKING = 0.01f
    }

    /** Instagram's movable layer: the card alone, with a transparent margin so the wobble isn't cut (624 px wide). */
    object Sticker {
        const val MARGIN = 6f
        const val SCALE = 2f
    }

    /** Instagram's background: the backdrop alone. */
    object StoriesBackground {
        const val WIDTH = 1080
        const val HEIGHT = 1920
    }

    /** A card's colour family on a share card: its cover's, else one fixed by its id. */
    fun palette(cardId: String, accentHue: Double?): CardPalette = CardPalette.of(CardPalette.preferred(accentHue, seedFromId(cardId).toInt()))

    /** A card's wobble seed on a share card. */
    fun seed(cardId: String): Double = seedFromId(cardId)

    /** The title's type for a story in [script], at [size]: the story's title face, weight, tracking and leading, lining figures. */
    fun titleStyle(script: StoryScript, size: Float, color: Color = Tokens.Text): TextStyle {
        val type = StoryType(script, compact = false)
        return AppFonts.style(type.headingFamily, size, type.headingWeight, type.titleLeading, color, type.headingTracking.em)
            .copy(fontFeatureSettings = StoryType.LINING_FIGURES)
    }

    /** The words' type for a story in [script]: the story's body face and tracking at its regular leading, justified for CJK. */
    fun wordsStyle(script: StoryScript, color: Color = Tokens.Text): TextStyle {
        val type = StoryType(script, compact = false)
        return AppFonts.style(type.bodyFamily, Words.SIZE, type.bodyWeight, type.bodyLeading, color, type.bodyTracking.em)
            .copy(textAlign = if (type.justified) TextAlign.Justify else TextAlign.Start)
    }
}
