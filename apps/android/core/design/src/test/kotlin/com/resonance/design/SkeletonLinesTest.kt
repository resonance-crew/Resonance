package com.resonance.design

import android.content.res.Configuration
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryScript
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Skeletons stand where the words will (the owner, on a phone at 1.5× text: 「私訊頁面的 skeleton 和實際位置不一樣」,
 * then 「Fix all six」): at every system text size — through the app's own cap ([CappedTextScale]) and a story's
 * reading scale ([ReadingTextScale]) as the screens wear them — and in either interface language, a skeleton's
 * lines are exactly as tall as the lines they stand for: a Compose text's ([SkeletonLines], Han lines taller than
 * their leading), a CSS line box's ([CssSkeletonLines], [CssSkeletonParagraph]), a tag's; and a feed card's
 * skeleton is as tall as the card, the card page's head as tall as its title, byline and first lines.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w346dp-h4000dp-500dpi")
class SkeletonLinesTest {
    @get:Rule val compose = createComposeRule()

    private val language = Strings.language
    private var system by mutableStateOf(1f)
    private var showing by mutableStateOf<(@Composable () -> Unit)?>(null)

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../../src/messages/${it.tag}.json").readText() }
    }

    @After fun restore() {
        Strings.language = language
    }

    private var started = false

    /**
     * In [lang] from here on (the next content shown reads it while composing, as the screens read it): what [showing]
     * holds, at the system text size [system], under the app's cap as the screens are — composed once.
     */
    private fun start(lang: Strings.Language) {
        Strings.language = lang
        showing = null
        if (started) return
        started = true
        compose.setContent {
            val base = LocalConfiguration.current
            val config = Configuration(base).apply { fontScale = system }
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalConfiguration provides config, LocalDensity provides Density(density, system)) {
                CappedTextScale {
                    Box(Modifier.width(346.dp).wrapContentHeight(unbounded = true).testTag("box")) { showing?.invoke() }
                }
            }
        }
    }

    private fun height(at: Float, content: @Composable () -> Unit): Float {
        system = at
        showing = content
        compose.waitForIdle()
        return compose.onNodeWithTag("box").getBoundsInRoot().let { (it.bottom - it.top).value }
    }

    private fun assertSame(what: String, skeleton: @Composable () -> Unit, words: @Composable () -> Unit) {
        for (at in Scales) {
            val drawn = height(at, skeleton)
            val real = height(at, words)
            assertEquals("$what at ${at}× system text", real, drawn, 0.5f)
        }
    }

    @Test fun aSkeletonLineIsAsTallAsALineOfItsWordsInEitherLanguage() {
        for ((lang, words) in listOf(Strings.Language.ZhTW to "最近的一則訊息", Strings.Language.En to "See you tomorrow")) {
            start(lang)
            val styles: List<Pair<String, @Composable () -> TextStyle>> = listOf(
                "body 14/600/1.3" to { AppFonts.body(14f, 600, lineHeight = 1.3f) },
                "body 12/1.4" to { AppFonts.body(12f, lineHeight = 1.4f) },
                "heading 24" to { AppFonts.heading(24f) },
                "body 15" to { AppFonts.body(15f) },
            )
            for ((name, style) in styles) {
                assertSame("$lang $name one line", { SkeletonLines(style(), 12.dp, Modifier.fillMaxWidth(0.6f)) }, { BasicText(words, style = style()) })
                assertSame("$lang $name two lines", { SkeletonLines(style(), 12.dp, Modifier, Modifier.fillMaxWidth(0.6f)) }, { BasicText("$words\n$words", style = style()) })
            }
        }
    }

    @Test fun cssSkeletonLinesAreTheLineBoxesOfCssText() {
        start(Strings.Language.ZhTW)
        assertSame(
            "a card's title",
            { CssSkeletonLines(18f, 1.3f, 18.dp, Modifier.fillMaxWidth(0.9f), Modifier.fillMaxWidth(0.55f)) },
            { CssText("在滿是標籤的世界裡\n謝謝妳", AppFonts.Family.Heading, 18f, 700, lineHeight = 1.3f, modifier = Modifier.fillMaxWidth()) },
        )
        assertSame(
            "a typical excerpt",
            { CssSkeletonParagraph(excerptSample(), AppFonts.Family.Body, 14f, 400, 1.65f, 13.dp) },
            {
                CssText(
                    excerptSample(),
                    AppFonts.Family.Body, 14f, 400, lineHeight = 1.65f, modifier = Modifier.fillMaxWidth(),
                )
            },
        )
    }

    @Test fun aTagsSkeletonIsAsTallAsATag() {
        start(Strings.Language.ZhTW)
        assertSame("a tag", { SkeletonTag(56.dp) }, { TagPill("友情") })
    }

    @Test fun aFeedCardsSkeletonIsAsTallAsTheCard() {
        for (lang in listOf(Strings.Language.ZhTW, Strings.Language.En)) {
            start(lang)
            // Two title lines (each fits a line at any of the sizes) and a typical excerpt, two tags, in the interface's script.
            val zh = lang == Strings.Language.ZhTW
            val card = StoryCardContent(
                "c1", if (zh) "在滿是標籤的世界裡\n謝謝妳讓我開始思考" else "In a world of labels\nthank you for asking", excerptSample(lang),
                if (zh) "不告訴你我是誰" else "Mira", if (zh) "不" else "M", null, 5.0, if (zh) "4 分鐘" else "4 min read",
                if (zh) listOf("友情", "成長") else listOf("friends", "growing up"), "https://example.invalid/c.jpg", "cover", 55.0,
            )
            assertSame("$lang feed card", { Column { StoryCardSkeleton(0) } }, { Column { StoryCard(card, 0) } })
        }
    }

    @Test fun theCardPagesHeadAndFirstLinesStandWhereThePagesDo() {
        start(Strings.Language.ZhTW)
        val type = StoryType(StoryScript.Cjk, true)
        assertSame(
            "the title's two lines",
            { ReadingTextScale { CssSkeletonLines(type.titleSize, type.titleLeading, type.titleSize.dp, Modifier.fillMaxWidth(0.9f), Modifier.fillMaxWidth(0.55f)) } },
            { ReadingTextScale { StoryTitle("在滿是標籤的世界裡\n謝謝妳", type, "zh-TW") } },
        )
        assertSame(
            "the story's first four lines",
            { ReadingTextScale { CssSkeletonLines(type.bodySize, type.bodyLeading, type.bodySize.dp, Modifier, Modifier, Modifier, Modifier.fillMaxWidth(0.65f)) } },
            { ReadingTextScale { RichCssText(listOf(InlineRun("緣分真的是件\n很奇妙的事\n我和她\n其實")), ProseStyle.body(type, "zh-TW"), {}, Modifier.fillMaxWidth()) } },
        )
    }

    private companion object {
        /** The system's text sizes a Pixel offers, smaller to larger (the app caps its own at 1.25). */
        val Scales = listOf(0.85f, 1f, 1.15f, 1.3f, 1.5f, 2f)
    }
}
