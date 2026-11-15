package com.resonance.app.ui

import android.content.Context
import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.api.models.SummaryTranslation
import com.resonance.api.models.SummaryTranslations
import com.resonance.api.models.TranslationResponse
import com.resonance.app.AppearanceStore
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.Strings
import com.resonance.design.StoryToc
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryParser
import com.resonance.kit.story.StoryTranslation
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * Round 25 §F on Android: which card pages get the translate line (published, public, not the viewer's own, in
 * another script than the interface, at most 30,000 characters); the line's states and words in both languages
 * (翻譯成中文 → 翻譯中⋯ → 已由 AI 翻譯 · 顯示原文 → 顯示翻譯; 沒有翻好，再試一次; 今天的翻譯次數用完了); the switch, off by
 * default and kept on the device; the auto rule (asked as the page opens, swapped only with the line in view, else
 * the toast; 顯示原文 keeps the card original); and the feed's titles and excerpts (§F7: only with the switch on, never
 * the viewer's own card, only the interface language's).
 */
@RunWith(RobolectricTestRunner::class)
class TranslationTest {
    private val language = Strings.language
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun stop() {
        Strings.language = language
        scope.cancel()
    }

    private val bob = Author("bob", "bob", "BO", "#c96442", null, null, false, null)

    private fun card(title: String, excerpt: String = "", author: Author? = bob, published: Boolean = true, visibility: FeedCard.Visibility = FeedCard.Visibility.`public`, summaries: SummaryTranslations? = null) = FeedCard(
        id = "c1", slug = "rain-walk", title = title, excerpt = excerpt, tags = emptyList(),
        publishedAt = if (published) "2026-11-01T00:00:00Z" else null, author = author, anonymous = false,
        visibility = visibility, imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 2,
        referenceCardId = null, reason = null, summaryTranslations = summaries,
    )

    private fun page(title: String, story: String, isOwner: Boolean = false, published: Boolean = true, public: Boolean = true) = CardDetail(
        card = card(title, published = published, visibility = if (public) FeedCard.Visibility.`public` else FeedCard.Visibility.`private`),
        story = story,
        visibility = if (public) CardDetail.Visibility.`public` else CardDetail.Visibility.`private`,
        anonymous = false, resonanceCount = 0, coreInsight = null, isOwner = isOwner, referenceCard = null,
    )

    private val zhStory = "那天下午雨停了，我們沿著河堤一路走到橋下，誰也沒有說話。"
    private val enStory = "The rain stopped that afternoon, and we walked along the river to the bridge without a word."

    // §F3

    @Test fun whichPagesGetTheLine() {
        // A Chinese story under an English interface goes into English; under 繁體中文, none.
        assertEquals("en", StoryTranslator.targetFor(page("雨中散步", zhStory), "en"))
        assertNull(StoryTranslator.targetFor(page("雨中散步", zhStory), "zh-TW"))
        // A Latin-script story under 繁體中文 goes into 繁體中文.
        assertEquals("zh-TW", StoryTranslator.targetFor(page("Rain on the bridge", enStory), "zh-TW"))
        assertNull(StoryTranslator.targetFor(page("Rain on the bridge", enStory), "en"))
        // Japanese and Korean go into either.
        assertEquals(listOf("en", "zh-TW"), StoryTranslation.targets("雨の日", "雨の日に、私たちは橋まで歩いた。ずっと黙っていた。"))
        // Never the viewer's own, a draft, a private card, nor a story past 30,000 characters.
        assertNull(StoryTranslator.targetFor(page("雨中散步", zhStory, isOwner = true), "en"))
        assertNull(StoryTranslator.targetFor(page("雨中散步", zhStory, published = false), "en"))
        assertNull(StoryTranslator.targetFor(page("雨中散步", zhStory, public = false), "en"))
        assertNull(StoryTranslator.targetFor(page("雨中散步", "雨".repeat(StoryTranslation.MAX_CHARS + 1)), "en"))
        assertEquals("en", StoryTranslator.targetFor(page("雨中散步", "雨".repeat(StoryTranslation.MAX_CHARS)), "en"))
        // A story in no script we can name gets none.
        assertNull(StoryTranslator.targetFor(page("Привет", "Привет, мир. Как дела?"), "zh-TW"))
    }

    // §F2

    private val answer = TranslationResponse("en", "A walk in the rain", "The rain stopped that afternoon.")

    private fun translator(
        parse: suspend (String) -> List<StoryBlock> = { StoryParser.parse(it) },
        fetch: suspend (String) -> TranslationResponse,
    ) = StoryTranslator("en", "雨中散步", zhStory, scope, fetch, parse)

    private val headed = TranslationResponse("en", "A walk in the rain", "## By the river\n\nThe rain stopped.\n\n## Under the bridge\n\nNo one spoke.")

    @Test fun theTranslatedStoryIsParsedBeforeItIsEverShown() {
        // The parse takes longer than a frame: the line stays at 翻譯中⋯ and nothing swaps or toasts until it is done,
        // so 看譯文's keepingPlace measures the whole translated article at the frame after the swap.
        val parsing = CompletableDeferred<Unit>()
        var toasts = 0
        val t = translator(parse = { parsing.await(); StoryParser.parse(it) }) { headed }
        t.auto(inView = { false }) { toasts++ }
        assertEquals(TranslateState.Working, t.state)
        assertEquals(0, toasts)
        assertNull(t.shownBlocks)
        parsing.complete(Unit)
        assertEquals(TranslateState.Original, t.state)
        assertEquals(1, toasts)
        // The original shows: its own blocks.
        assertNull(t.shownBlocks)
        t.showReady()
        val shown = t.shownBlocks
        assertTrue(shown != null && shown.isNotEmpty())
    }

    @Test fun theContentsRailListsTheHeadingsOfTheTextShown() {
        val originalBlocks = StoryParser.parse("## 河堤上\n\n雨停了。\n\n## 橋下\n\n誰也沒有說話。")
        val t = StoryTranslator("en", "雨中散步", "## 河堤上\n\n雨停了。\n\n## 橋下\n\n誰也沒有說話。", scope, { headed }, { StoryParser.parse(it) })
        fun rail() = StoryToc.headings(articleBlocks(t, "雨中散步", "## 河堤上\n\n雨停了。\n\n## 橋下\n\n誰也沒有說話。", originalBlocks)).map { it.text }
        assertEquals(listOf("河堤上", "橋下"), rail())
        t.tap()
        // Translated: the rail's headings, and the blocks its anchors are kept by, are the translation's.
        assertEquals(listOf("By the river", "Under the bridge"), rail())
        val shown = articleBlocks(t, "雨中散步", "## 河堤上\n\n雨停了。\n\n## 橋下\n\n誰也沒有說話。", originalBlocks)
        assertTrue(StoryToc.headings(shown).all { h -> shown.any { it === h.block } })
        // 顯示原文: the original's again; another story's translator never lends its blocks.
        t.tap()
        assertEquals(listOf("河堤上", "橋下"), rail())
        t.tap()
        assertEquals(originalBlocks, articleBlocks(t, "Another", "Another story", originalBlocks))
    }

    @Test fun aSlowAnswerAfterThePageIsGoneShowsNoToast() {
        val gate = CompletableDeferred<TranslationResponse>()
        var present = true
        var toasts = 0
        val t = translator { gate.await() }
        t.auto(inView = { false }, present = { present }) { toasts++ }
        // The reader leaves the card page before the answer comes.
        present = false
        gate.complete(answer)
        assertEquals(0, toasts)
        // The line says 顯示翻譯 when they come back; nothing swapped.
        assertEquals(TranslateState.Original, t.state)
        assertEquals("雨中散步", t.shownTitle)
    }

    @Test fun theLineGoesFromOfferThroughWorkingToTranslatedAndBack() {
        val gate = CompletableDeferred<TranslationResponse>()
        val asked = mutableListOf<String>()
        val t = translator { to -> asked += to; gate.await() }
        assertEquals(TranslateState.Offer, t.state)
        assertEquals("雨中散步", t.shownTitle)
        t.tap()
        assertEquals(TranslateState.Working, t.state)
        assertEquals(listOf("en"), asked)
        // The original shows while it works.
        assertEquals(zhStory, t.shownStory)
        gate.complete(answer)
        assertEquals(TranslateState.Translated, t.state)
        assertEquals("A walk in the rain", t.shownTitle)
        assertEquals(answer.story, t.shownStory)
        assertEquals(1, t.swaps)
        // 顯示原文, then 顯示翻譯 — no second ask.
        t.tap()
        assertEquals(TranslateState.Original, t.state)
        assertEquals("雨中散步", t.shownTitle)
        t.tap()
        assertEquals(TranslateState.Translated, t.state)
        assertEquals(3, t.swaps)
        assertEquals(1, asked.size)
    }

    @Test fun aFailureOffersAnotherTryAndASpentBudgetOffersNone() {
        var fail: Exception? = ApiFailure("internal", "HTTP 503", 503)
        val t = translator { fail?.let { throw it }; answer }
        t.tap()
        assertEquals(TranslateState.Failed, t.state)
        fail = null
        t.tap()
        assertEquals(TranslateState.Translated, t.state)

        val spent = translator { throw ApiFailure("rate_limited", "Too many", 429) }
        spent.tap()
        assertEquals(TranslateState.Spent, spent.state)
        spent.tap()
        assertEquals(TranslateState.Spent, spent.state)
    }

    @Test fun theLinesWordsInBothLanguages() {
        assertEquals(TranslateWords(null, "翻譯成中文"), translateWords(TranslateState.Offer))
        assertEquals(TranslateWords("翻譯中⋯", null), translateWords(TranslateState.Working))
        assertEquals(TranslateWords("已由 AI 翻譯", "顯示原文"), translateWords(TranslateState.Translated))
        assertEquals(TranslateWords(null, "顯示翻譯"), translateWords(TranslateState.Original))
        assertEquals(TranslateWords("沒有翻好", "再試一次"), translateWords(TranslateState.Failed))
        assertEquals(TranslateWords("今天的翻譯次數用完了", null), translateWords(TranslateState.Spent))
        assertEquals("，", translateJoint(TranslateState.Failed, zh = true))
        assertEquals(" · ", translateJoint(TranslateState.Translated, zh = true))
        Strings.language = Strings.Language.En
        assertEquals(TranslateWords(null, "Translate to English"), translateWords(TranslateState.Offer))
        assertEquals(TranslateWords("Translated by AI", "Show original"), translateWords(TranslateState.Translated))
        assertEquals(TranslateWords("Couldn’t translate", "try again"), translateWords(TranslateState.Failed))
        assertEquals(", ", translateJoint(TranslateState.Failed, zh = false))
    }

    // §F4

    @Test fun theSwitchIsOffByDefaultAndKeptOnTheDevice() {
        val prefs = RuntimeEnvironment.getApplication().getSharedPreferences("settings-test", Context.MODE_PRIVATE)
        prefs.edit().clear().commit()
        val store = AppearanceStore(prefs)
        assertFalse(store.state.value.autoTranslate)
        store.setAutoTranslate(true)
        assertTrue(store.state.value.autoTranslate)
        // A new start reads it back.
        assertTrue(AppearanceStore(prefs).state.value.autoTranslate)
        store.setAutoTranslate(false)
        assertFalse(AppearanceStore(prefs).state.value.autoTranslate)
    }

    @Test fun onTheSwitchSwapsWithTheLineInViewElseTheToastOffersIt() {
        // In view: it swaps by itself when it comes.
        val seen = translator { answer }
        var toasts = 0
        seen.auto(inView = { true }) { toasts++ }
        assertEquals(TranslateState.Translated, seen.state)
        assertEquals(0, toasts)

        // Scrolled past it: nothing moves, the toast says it is ready, and 看譯文 swaps.
        val past = translator { answer }
        past.auto(inView = { false }) { toasts++ }
        assertEquals(TranslateState.Original, past.state)
        assertEquals("雨中散步", past.shownTitle)
        assertEquals(1, toasts)
        past.showReady()
        assertEquals(TranslateState.Translated, past.state)

        // 顯示原文 keeps the card original for the visit: the switch never swaps it back.
        past.tap()
        assertTrue(past.keptOriginal)
        past.auto(inView = { true }) { toasts++ }
        assertEquals(TranslateState.Original, past.state)
        assertEquals(1, toasts)
    }

    // §F7

    private val summaries = SummaryTranslations(
        en = SummaryTranslation("A walk in the rain", "The rain stopped that afternoon."),
        zhTW = SummaryTranslation("雨中散步", "那天下午雨停了。"),
    )

    @Test fun theFeedShowsATranslatedTitleAndExcerptOnlyWithTheSwitchOnAndNeverTheViewersOwn() {
        val c = card("雨中散步", "那天下午雨停了，我們沿著河堤走。", summaries = summaries)
        // Off (the default): as written.
        assertNull(StoryTranslation.summary(c, "en", on = false, viewerId = "alice"))
        assertEquals("雨中散步", c.story().title)
        // On, someone else's card: the interface language's.
        val en = StoryTranslation.summary(c, "en", on = true, viewerId = "alice")
        assertEquals("A walk in the rain", en?.title)
        val content = c.story(en, "en")
        assertEquals("A walk in the rain", content.title)
        assertEquals("The rain stopped that afternoon.", content.excerpt)
        assertEquals("en", content.translatedLang)
        // The viewer's own: as written.
        assertNull(StoryTranslation.summary(c, "en", on = true, viewerId = "bob"))
        // None sent for that language (stale ones the server leaves out): as written, no mark.
        assertNull(StoryTranslation.summary(card("Rain", summaries = SummaryTranslations(en = summaries.en)), "zh-TW", on = true, viewerId = "alice"))
        assertNull(c.story().translatedLang)
    }
}
