package com.resonance.kit.story

import com.resonance.api.models.FeedCard
import com.resonance.api.models.SummaryTranslation

/**
 * Which stories are translated into which interface language (round 25 §F) — the twin of src/lib/text/translation.ts,
 * over this app's own script rule ([StoryScripts.storyType]): a Chinese story into English, a Latin-script one into
 * 繁體中文, a Japanese or Korean one into either; nothing for a story in no script we can name. The script rule cannot
 * tell English from French, so a Latin-script story is simply "not Chinese" (the line never names the source).
 */
object StoryTranslation {
    /** The interface languages a story may go into. */
    const val EN = "en"
    const val ZH_TW = "zh-TW"

    /** The longest story the card page offers to translate (characters as JavaScript counts them: UTF-16 units). */
    const val MAX_CHARS = 30_000

    /** The interface languages [title] + [story] may be translated into, by their script ([StoryScripts.storyType]). */
    fun targets(title: String, story: String): List<String> = when (StoryScripts.storyType(title, story).lang) {
        "zh-TW" -> listOf(EN)
        "en" -> listOf(ZH_TW)
        "ja", "ko" -> listOf(EN, ZH_TW)
        else -> emptyList()
    }

    /** The interface's language as a translation's target: zh-TW for 繁體中文, en otherwise. */
    fun targetOf(interfaceTag: String): String = if (interfaceTag.startsWith("zh")) ZH_TW else EN

    /**
     * Whether a card page shows the translate line (§F3): a published, public card (named or anonymous), not the
     * viewer's own, whose story's script differs from the interface ([interfaceTag]), at most [MAX_CHARS] long.
     * Answers the target, or null for no line.
     */
    fun lineTarget(
        published: Boolean,
        public: Boolean,
        isOwner: Boolean,
        title: String,
        story: String,
        interfaceTag: String,
    ): String? {
        if (!published || !public || isOwner) return null
        if (story.length > MAX_CHARS) return null
        val to = targetOf(interfaceTag)
        return to.takeIf { it in targets(title, story) }
    }

    /**
     * A feed card's title and excerpt as an AI made them for the interface's language (§F7) — only with the switch
     * [on], for a card that isn't the viewer's own ([viewerId]), when the server sent one for that language (it sends
     * them only while they match what the card says now). Null: the card as written.
     */
    fun summary(card: FeedCard, interfaceTag: String, on: Boolean, viewerId: String?): SummaryTranslation? {
        if (!on) return null
        val author = card.author?.id
        if (viewerId != null && author != null && author == viewerId) return null
        val all = card.summaryTranslations ?: return null
        return when (targetOf(interfaceTag)) {
            ZH_TW -> all.zhTW
            else -> all.en
        }?.takeIf { it.title.isNotBlank() }
    }
}
