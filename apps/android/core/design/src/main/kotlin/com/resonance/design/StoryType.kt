package com.resonance.design

import android.annotation.SuppressLint
import android.graphics.text.LineBreakConfig
import android.graphics.text.LineBreaker
import android.os.Build
import android.text.StaticLayout
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.em
import com.resonance.design.generated.Tokens
import com.resonance.kit.story.ProseSpacing
import com.resonance.kit.story.StoryScript

/**
 * A story's type — every number a story is set with, read from the generated tokens in this one
 * place (tokens.css "A story's type", exported as `Tokens.Story*`; the web sets them through
 * src/styles/story.css's `--s-*` picks). Which set applies depends on the story's script
 * ([StoryScripts][com.resonance.kit.story.StoryScripts]) and on whether the window is a phone's
 * ([compact]: the apps' compact class, the web's ≤ 640): a CJK story is a Ming title and headings
 * (Noto Serif TC 600, +0.02em) over a Hei body (Noto Sans TC, +0.03em, justified); a Latin story is
 * Playfair 700 over DM Sans, with its own sizes, no tracking, ragged.
 *
 * Sizes are the web's px, which the apps count in sp (the title and body at [readingTextScale]
 * inside [ReadingTextScale]); gaps are dp at the normal text size — a gap in ems (paragraphs,
 * headings, lists) grows with the words it sits between, as the reader's own em does. Ratios are
 * the tokens' (× the element's own size): nothing here restates a number tokens.css holds.
 */
data class StoryType(val script: StoryScript, val compact: Boolean) {
    val cjk: Boolean get() = script == StoryScript.Cjk

    // The words

    /** The body's face: Noto Sans TC first for a CJK story (`--font-story-sans`), DM Sans for a Latin one. */
    val bodyFamily: AppFonts.Family get() = if (cjk) AppFonts.Family.BodyCJK else AppFonts.Family.Body
    val bodySize: Float get() = when {
        cjk && compact -> Tokens.StorySizeCompact
        cjk -> Tokens.StorySize
        compact -> Tokens.StorySizeLatinCompact
        else -> Tokens.StorySizeLatin
    }
    /** Line height, × the body's size. */
    val bodyLeading: Float get() = when {
        cjk && compact -> Tokens.StoryLeadingCompact
        cjk -> Tokens.StoryLeading
        compact -> Tokens.StoryLeadingLatinCompact
        else -> Tokens.StoryLeadingLatin
    }
    /** Letter spacing in em: CJK's +0.03, Latin none. */
    val bodyTracking: Float get() = if (cjk) Tokens.StoryTracking else 0f
    val bodyWeight: Int get() = 400
    /** `**bold**` in a story. */
    val boldWeight: Int get() = Tokens.StoryBold.toInt()
    /** CJK text is justified, as Chinese is printed (its last line natural); Latin stays ragged (WCAG 1.4.8). */
    val justified: Boolean get() = cjk

    // The title and the headings

    /** The title's and headings' face: Noto Serif TC first for a CJK story (`--font-story-serif`), Playfair for a Latin one. */
    val headingFamily: AppFonts.Family get() = if (cjk) AppFonts.Family.HeadingCJK else AppFonts.Family.Heading
    val headingWeight: Int get() = (if (cjk) Tokens.StoryHeadingWeight else Tokens.StoryHeadingWeightLatin).toInt()
    /** Letter spacing in em for the title and headings: CJK's +0.02, never negative; Latin none. */
    val headingTracking: Float get() = if (cjk) Tokens.StoryHeadingTracking else 0f
    val titleSize: Float get() = when {
        cjk && compact -> Tokens.StoryTitleCompact
        cjk -> Tokens.StoryTitle
        compact -> Tokens.StoryTitleLatinCompact
        else -> Tokens.StoryTitleLatin
    }
    val titleLeading: Float get() = if (cjk) Tokens.StoryTitleLeading else Tokens.StoryTitleLeadingLatin
    /** Every heading's line height (both scripts). */
    val headingLeading: Float get() = Tokens.StoryHeadingLeading

    /** A heading's size: `#` and `##` at the body × 1.3, `###` and below × 1.12 (the editors' `#` is drawn as the reader's h2). */
    fun headingSize(level: Int): Float = bodySize * (if (level <= 2) Tokens.StoryH2 else Tokens.StoryH3)
    /** The room above a heading, in its own em (none when it is the first thing in the story, a quote or a list item). */
    fun headingAbove(level: Int): Float = headingSize(level) * Tokens.StoryHeadingAbove
    /** The room below a heading, binding it to the text after it. */
    fun headingBelow(level: Int): Float = headingSize(level) * (if (level <= 2) Tokens.StoryH2Below else Tokens.StoryH3Below)

    // Between the blocks (dp at the normal text size)

    /** After a paragraph, a list, a quote, a code block. */
    val paragraphGap: Float get() = bodySize * Tokens.StoryParaGap
    /** A list's indent. */
    val listIndent: Float get() = bodySize * Tokens.StoryListIndent
    /** Above and below each list item. */
    val itemGap: Float get() = bodySize * Tokens.StoryItemGap
    /** Inline code's size (code's own spacing is none). */
    val codeSize: Float get() = bodySize * Tokens.StoryCode
    /** Above and below a picture, a link card, an embedded card. */
    val blockGap: Float get() = if (compact) Tokens.StoryBlockGapCompact else Tokens.StoryBlockGap
    /** Above and below the pen rule (`---`). */
    val ruleGap: Float get() = if (compact) Tokens.StoryRuleGapCompact else Tokens.StoryRuleGap

    // The page around the story (the card page's head and foot)

    /** Cover → title. */
    val coverGap: Float get() = if (compact) Tokens.StoryCoverGapCompact else Tokens.StoryCoverGap
    /** Title → the byline / meta row (round 9 §2: 20 on a phone, 24 wider). */
    val metaGap: Float get() = if (compact) Tokens.StoryMetaGapCompact else Tokens.StoryMetaGap
    /** The byline / meta row → the story. */
    val leadGap: Float get() = if (compact) Tokens.StoryLeadGapCompact else Tokens.StoryLeadGap
    /** The story → its tags. */
    val endGap: Float get() = if (compact) Tokens.StoryEndGapCompact else Tokens.StoryEndGap
    /** The meta line's size (UI: under the 1.25 cap, not the reading scale). */
    val metaSize: Float get() = if (compact) Tokens.StoryMetaSizeCompact else Tokens.StoryMetaSize
    val bylineAvatar: Float get() = Tokens.StoryBylineAvatar
    /** The story column → the author rail beside it (expanded windows). */
    val railGap: Float get() = Tokens.StoryRailGap

    // Styles

    /** The title: the heading face at the title's size, lining figures (「2400 公尺」 stands level). */
    fun titleStyle(color: Color = Tokens.Text): TextStyle =
        AppFonts.style(headingFamily, titleSize, headingWeight, titleLeading, color, headingTracking.em).copy(fontFeatureSettings = LINING_FIGURES)

    /** A heading in the story, lining figures too. */
    fun headingStyle(level: Int, color: Color = Tokens.Text): TextStyle =
        AppFonts.style(headingFamily, headingSize(level), headingWeight, headingLeading, color, headingTracking.em).copy(fontFeatureSettings = LINING_FIGURES)

    /** The story's words (a Compose `Text`'s: the reader's own line boxes take [bodyFamily] and the numbers above). */
    fun bodyStyle(weight: Int = bodyWeight, color: Color = Tokens.Text): TextStyle =
        AppFonts.style(bodyFamily, bodySize, weight, bodyLeading, color, bodyTracking.em)

    // Breaking a story's lines (a StaticLayout of its prose)

    /**
     * How a paragraph of the story is justified on this device: a CJK story between characters on
     * API 35 and up (LineBreaker's inter-character mode — inter-word would leave Chinese ragged),
     * ragged before that (line breaks are the same, only the right edge differs); a Latin story is
     * always ragged. Never for a heading: headings stay at their start.
     */
    @SuppressLint("InlinedApi")
    fun justificationMode(sdk: Int = Build.VERSION.SDK_INT): Int =
        if (justified && sdk >= 35) LineBreaker.JUSTIFICATION_MODE_INTER_CHARACTER else LineBreaker.JUSTIFICATION_MODE_NONE

    /** Strict CJK line breaking (story.css `line-break: strict`: no line starts with ー, ぁ or 々), on API 33 and up. */
    fun strictLineBreaks(sdk: Int = Build.VERSION.SDK_INT): Boolean = sdk >= 33

    /** [justificationMode] and [strictLineBreaks] on a story paragraph's layout. */
    fun applyBreaking(builder: StaticLayout.Builder, sdk: Int = Build.VERSION.SDK_INT): StaticLayout.Builder =
        applyBreaking(builder, justified, sdk)

    // The room between a story's blocks

    /** story.css's margins in this type (dp at the normal text size), for [ProseMetrics][com.resonance.kit.story.ProseMetrics]. */
    fun spacing(): ProseSpacing = ProseSpacing(
        paragraph = paragraphGap,
        h2Above = headingAbove(2),
        h2Below = headingBelow(2),
        h3Above = headingAbove(3),
        h3Below = headingBelow(3),
        block = blockGap,
        rule = ruleGap,
        blank = bodySize * BLANK_LINE,
        item = itemGap,
    )

    companion object {
        /** `font-variant-numeric: lining-nums`. */
        const val LINING_FIGURES = "lnum"

        /** A line the writer left blank (`--story-blank-line: 1.6em`, an em the token exporter doesn't carry). */
        const val BLANK_LINE = 1.6f

        /**
         * A story's breaking on a layout of its text: [justified] (a CJK story's words) between
         * characters on API 35 and up, ragged before; strict CJK line breaks on API 33 and up.
         */
        @SuppressLint("InlinedApi")
        fun applyBreaking(builder: StaticLayout.Builder, justified: Boolean, sdk: Int = Build.VERSION.SDK_INT): StaticLayout.Builder {
            builder.setJustificationMode(
                if (justified && sdk >= 35) LineBreaker.JUSTIFICATION_MODE_INTER_CHARACTER else LineBreaker.JUSTIFICATION_MODE_NONE,
            )
            if (sdk >= 33 && Build.VERSION.SDK_INT >= 33) {
                builder.setLineBreakConfig(LineBreakConfig.Builder().setLineBreakStyle(LineBreakConfig.LINE_BREAK_STYLE_STRICT).build())
            }
            return builder
        }

        /** A story's type in a window of this class (compact: a phone's numbers). */
        fun of(script: StoryScript, layout: LayoutClass): StoryType = StoryType(script, compact = layout == LayoutClass.Compact)
    }
}
