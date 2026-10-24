package com.resonance.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.sp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens

/**
 * A card page's meta line under its author, muted at [size] (13 on a phone, 14 wider): 「6 分鐘 ·
 * 2026年10月10日」 — and, on its owner's 私人卡 ([lock]: the word, 私人卡), 「· 🔒 私人卡」 after it
 * (round 9 §1), the lock glyph inline with the words and wrapping with them, read out as the words alone.
 */
@Composable
fun StoryMetaLine(text: String, size: Float, modifier: Modifier = Modifier, lock: String? = null) {
    val style = AppFonts.body(size, lineHeight = 1.4f, color = Tokens.TextMuted)
    if (lock == null) return BasicText(text, modifier, style = style)
    val words = buildAnnotatedString {
        append(text)
        append(" · ")
        appendInlineContent(LOCK_GLYPH)
        append(lock)
    }
    val glyph = (size * 1.1f).sp
    BasicText(
        words,
        modifier.clearAndSetSemantics { contentDescription = "$text · $lock" },
        style = style,
        inlineContent = mapOf(
            LOCK_GLYPH to InlineTextContent(Placeholder(glyph * 1.25f, glyph, PlaceholderVerticalAlign.TextCenter)) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                    OrganicIcon(IconName.Lock, size = with(LocalDensity.current) { glyph.toDp() }, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
                }
            },
        ),
    )
}

private const val LOCK_GLYPH = "lock"
