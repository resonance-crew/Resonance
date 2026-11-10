package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.kit.reading.FeedLoader
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LayoutClass
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The notification invites by the device's kind (round 24, the owner): a phone's a band of its list — the thread's grey
 * edge to edge, the story bands' rule, its words where the list's content is, never a card of its own (「這樣就不會在
 * 手機的版面上顯得又多一張卡片的感覺」); a tablet's a card of that grey with no pen line at all (「沒有 border 的卡片」), in the
 * content's own margins. Drawn here for real (grain and all), and read back pixel by pixel.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "w800dp-h1000dp-xxhdpi")
class InviteBandTest {
    private val compose = createComposeRule()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                AppFonts.init(app)
                Grain.init(app)
                Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
                val language = Strings.language
                Strings.language = Strings.Language.ZhTW
                try {
                    base.evaluate()
                } finally {
                    Strings.language = language
                }
            }
        }
    }.around(compose)

    // Where each look is laid.

    @Test fun aPhonesConversationsInviteIsABandFromTheBarsPenLineUpToTheListsTop() {
        val phone = ConversationsFrame.of(LayoutClass.Compact)
        val barFoot = 100.dp
        val look = conversationsInviteLook(phone, Modifier, barFoot) as InviteLook.Band
        // No rule of its own on top: the bar's pen line is its edge, the paper up under the bar to the list's top.
        assertTrue(look.underBar)
        assertEquals(barFoot + phone.headGap!!, look.above)
        // Its words 20 under the bar's foot, as the feed's picks invite's are; its own rule along its foot, the first row 4 under it.
        assertEquals(20.dp, phone.headGap!! + look.top)
        assertTrue(look.bottomRule)
        assertEquals(4.dp, conversationsInviteGap(phone))
    }

    @Test fun aTabletsAndThePanesConversationsInviteIsABorderlessCardWhereTheFirstRowWouldBe() {
        for (cls in listOf(LayoutClass.Medium, LayoutClass.Expanded)) {
            val wide = ConversationsFrame.of(cls)
            // 22 over its title, 20 under its buttons; the first row 12 under it.
            assertEquals(InviteLook.Card(top = 22.dp, bottom = 20.dp, seed = CONNECTIONS_INVITE_SEED), conversationsInviteLook(wide, Modifier, 100.dp))
            assertEquals(12.dp, conversationsInviteGap(wide))
        }
    }

    @Test fun aPhonesPicksInviteEndsOnTheFirstCardsOwnRule() {
        // Under the bar the list starts at the top of the bar's wavy band: its words keep that band's height more.
        val under = feedInviteLook(38.dp, underBar = true)
        assertTrue(under.underBar)
        assertEquals(HeaderEdgeHeight + InviteBandPad, under.top)
        assertFalse(under.bottomRule)
        // A refresh note above it: a rule of its own on top.
        val parted = feedInviteLook(38.dp, underBar = false)
        assertFalse(parted.underBar)
        assertEquals(InviteBandPad, parted.top)
        assertFalse(parted.bottomRule)
    }

    @Test fun aTabletsPicksInviteStandsOnTheCardsContentEdgesWithMoreAirAboveIt() {
        // 26 over its title (the conversations' 22), 22 under its buttons.
        assertEquals(26.dp, FeedInviteCard.top)
        assertEquals(22.dp, FeedInviteCard.bottom)
        // Its sides where the cards' content is; 24 under the bar's foot (the list starts at the top of the bar's band), 24 over the first card.
        val room = feedInviteCardRoom(120.dp, underBar = true)
        assertEquals(120.dp, room.calculateLeftPadding(LayoutDirection.Ltr))
        assertEquals(120.dp, room.calculateRightPadding(LayoutDirection.Ltr))
        assertEquals(HeaderEdgeHeight + 24.dp, room.calculateTopPadding())
        assertEquals(24.dp, room.calculateBottomPadding())
        assertEquals(24.dp, feedInviteCardRoom(120.dp, underBar = false).calculateTopPadding())
    }

    // The feed's pull gap follows the band on the page, not the reasons it is owed.

    @Test fun anInvitePutAwayByTheSystemsNoIsNoLongerShownThoughItsReasonsHold() {
        val reasons = mutableStateOf(true)
        val invite = InviteShown(NotifyInvite.Picks, reasons)
        assertTrue(invite.shown)
        invite.putAway()
        assertFalse(invite.shown)
        reasons.value = false
        assertFalse(invite.shown)
        assertTrue(InviteShown(NotifyInvite.Picks, mutableStateOf(true)).shown)
        assertFalse(InviteShown(NotifyInvite.Picks, mutableStateOf(false)).shown)
    }

    @Test fun thePullGapWearsTheBandsGreyOnlyWhileAPhonesBandIsFirst() {
        val loaded = FeedLoader.Phase.Loaded
        assertEquals(FeedPullPaper.Invite, feedPullPaper(false, loaded, hasCards = true, noteAbove = false, invite = true, phone = true))
        // Put away (or never owed): the first card is first again, its paper.
        assertEquals(FeedPullPaper.FirstCard, feedPullPaper(false, loaded, hasCards = true, noteAbove = false, invite = false, phone = true))
        // A tablet's invite is a card on the page's cream; a refresh note parts the band from the bar; the grid has none.
        assertNull(feedPullPaper(false, loaded, hasCards = true, noteAbove = false, invite = true, phone = false))
        assertNull(feedPullPaper(false, loaded, hasCards = true, noteAbove = true, invite = true, phone = true))
        assertNull(feedPullPaper(true, loaded, hasCards = true, noteAbove = false, invite = true, phone = true))
        assertNull(feedPullPaper(false, loaded, hasCards = false, noteAbove = false, invite = true, phone = true))
        assertEquals(FeedPullPaper.Skeleton, feedPullPaper(false, FeedLoader.Phase.Loading, hasCards = false, noteAbove = false, invite = true, phone = true))
    }

    // As drawn.

    @Test fun aBandUnderTheBarIsTheGreyEdgeToEdgeUpToTheListsTopWithNoRuleOfItsOwnThereAndOneAlongItsFoot() {
        val above = 30.dp
        val drawn = draw(390.dp, Modifier.padding(top = above + 10.dp, bottom = 10.dp)) {
            InviteLook.Band(Modifier.padding(horizontal = 20.dp), underBar = true, top = 16.dp, above = above)
        }
        val band = drawn.box
        val reach = px(above)
        // Up under the bar: the grey reaches [above] past its box, edge to edge; the page's cream above that.
        assertPaper(drawn, band.left + 2, band.top - reach / 2, "under the bar at the start")
        assertPaper(drawn, band.right - 3, band.top - reach / 2, "under the bar at the end")
        assertPaper(drawn, band.left + 2, band.top - reach + px(2.dp), "at the list's top")
        assertCream(drawn, band.left + 2, band.top - reach - px(4.dp), "over the list's top")
        // In its own box, edge to edge.
        assertPaper(drawn, band.left + 2, band.top + px(8.dp), "its start")
        assertPaper(drawn, band.right - 3, band.top + px(8.dp), "its end")
        // The bar's pen line is its top: no rule of its own there; its own rule along its foot.
        assertTrue("a rule along its top", ruled(drawn, band.top) < 0.02f)
        assertTrue("no rule along its foot", ruled(drawn, band.bottom) > 0.9f)
        // Its words where the list's content is.
        val title = compose.onNodeWithText(L10n.NotifyAsk.connectionCardsTitle).fetchSemanticsNode().boundsInRoot
        assertEquals(band.left + px(20.dp), title.left.toInt().toFloat(), 2f)
        // The story bands' grain over the grey — in its box, and up under the bar alike.
        assertGrained(drawn, band.left + 2, band.top + 2, px(14.dp), px(12.dp), StoryGrainDepth, "in its box")
        assertGrained(drawn, band.left + 2, band.top - reach + 2, px(14.dp), px(12.dp), StoryGrainDepth, "under the bar")
    }

    @Test fun aPhonesConversationsBandFillsTheListsOwnTopUnderTheBar() {
        // The conversations' list starts at the screen's top, its first row [listTop] down (TabScreen: the bar's foot and
        // the frame's 4): the band, its first item, paints that padding grey — the list never clips it — so what the
        // list draws from its top edge down is the grey, all an overscroll stretch (the list has no pull) ever stretches.
        val phone = ConversationsFrame.of(LayoutClass.Compact)
        val barFoot = 90.dp
        val listTop = barFoot + phone.headGap!!
        var paper = Color.Unspecified
        var cream = Color.Unspecified
        compose.setContent {
            paper = Tokens.BubbleTheirs
            cream = Tokens.Cream
            Box(Modifier.size(390.dp, 520.dp).background(Tokens.Cream)) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = listTop)) {
                    notifyInviteRow(Modifier.testTag("invite"), conversationsInviteLook(phone, Modifier, barFoot))
                    item { Box(Modifier.fillMaxWidth().height(300.dp)) }
                }
            }
        }
        compose.waitForIdle()
        val box = compose.onNodeWithTag("invite").fetchSemanticsNode().boundsInRoot
        assertEquals(px(listTop).toFloat(), box.top, 2f)
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        val drawn = Drawn(pixels, box, value(paper), value(cream), 0f)
        for (y in listOf(1, px(listTop) / 2, px(listTop) - 2)) for (x in listOf(2, px(195.dp), px(388.dp))) {
            assertPaper(drawn, x, y, "the list's top padding at $x, $y")
        }
    }

    /** The invite as a list item, drawn with no session behind it. */
    private fun androidx.compose.foundation.lazy.LazyListScope.notifyInviteRow(modifier: Modifier, look: InviteLook) = item {
        NotifyInviteSheet(
            L10n.NotifyAsk.connectionCardsTitle, L10n.NotifyAsk.connectionCardsBody, busy = false, modifier, look = look,
            onNo = {}, onYes = {},
        )
    }

    @Test fun aBandWithANoteAboveItDrawsItsOwnRuleAlongItsTop() {
        val drawn = draw(390.dp, Modifier.padding(vertical = 20.dp)) {
            InviteLook.Band(Modifier.padding(horizontal = 20.dp), underBar = false, bottomRule = false)
        }
        assertTrue("no rule along its top", ruled(drawn, drawn.box.top) > 0.9f)
        // Over a card's own top rule, none of its own along its foot; and the paper stays in its box.
        assertTrue("a rule along its foot", ruled(drawn, drawn.box.bottom) < 0.02f)
        assertCream(drawn, drawn.box.left + 2, drawn.box.top - px(6.dp), "over its rule")
    }

    @Test fun aTabletsConversationsInviteIsACardOfTheGreyWithNoPenLineAtAll() = assertBorderlessCard(ConversationsInviteCard)

    @Test fun aTabletsPicksInviteOverTheBandedFeedIsACardOfTheGreyWithNoPenLineAtAll() = assertBorderlessCard(FeedInviteCard)

    @Test fun theGridsWideInviteIsACardOfTheGreyWithNoPenLineAtAll() = assertBorderlessCard(InviteLook.WideCard)

    /** [look] drawn as a tablet's: the grey inside a card's outline, never edge to edge, and no pen line round it. */
    private fun assertBorderlessCard(look: InviteLook) {
        val drawn = draw(620.dp, Modifier.padding(24.dp)) { look }
        val card = drawn.box
        // The grey inside, the page's cream at its corners: a card's rounded outline, never a band edge to edge.
        assertPaper(drawn, card.left + px(11.dp), (card.top + card.bottom) / 2, "inside, at its start")
        assertPaper(drawn, card.right - px(11.dp), card.top + px(11.dp), "inside, at its top end")
        assertCream(drawn, card.left + 1, card.top + 1, "at its corner")
        assertCream(drawn, card.right - 2, card.bottom - 2, "at its far corner")
        assertCream(drawn, card.left - px(12.dp), card.top + px(30.dp), "beside it")
        // No pen line anywhere along its outline: nothing round its edges darker than its paper's grain.
        val ring = px(12.dp)
        val dark = (card.top.toInt() - ring until card.bottom.toInt() + ring).sumOf { y ->
            (card.left.toInt() - ring until card.right.toInt() + ring).count { x ->
                val inside = x > card.left + ring && x < card.right - ring && y > card.top + ring && y < card.bottom - ring
                !inside && value(drawn.pixels[x, y]) < drawn.threshold
            }
        }
        assertEquals("$look: pen-dark pixels round its outline", 0, dark)
        // The cards' grain (the `grain-card` tile at 0.2) over the grey, between its edge and its words.
        assertGrained(drawn, card.left + px(12.dp), (card.top + card.bottom) / 2 - px(16.dp), px(8.dp), px(32.dp), CardGrainDepth, "$look")
    }

    @Test fun itsLineIsTheInkThatReadsOnTheGreyInEveryTheme() {
        var expected = Color.Unspecified
        draw(390.dp, Modifier) {
            expected = Tokens.LinkCardMuted
            InviteLook.Band(Modifier.padding(horizontal = 20.dp), underBar = false)
        }
        val results = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(L10n.NotifyAsk.connectionCardsBody).fetchSemanticsNode().config[SemanticsActions.GetTextLayoutResult].action!!.invoke(results)
        assertEquals(expected, results.single().layoutInput.style.color)
        // The muted ink deepened to clear 4.5:1 on the grey, in both schemes of every theme — where the text-muted falls short.
        for (theme in PaletteTheme.entries) for (dark in listOf(false, true)) {
            val colors = ResonanceColors.of(theme, dark)
            assertTrue("$theme dark=$dark", contrast(colors.LinkCardMuted, colors.BubbleTheirs) >= 4.5f)
        }
        assertTrue(contrast(ResonanceColors.of(PaletteTheme.Terracotta, false).TextMuted, ResonanceColors.of(PaletteTheme.Terracotta, false).BubbleTheirs) < 4.5f)
    }

    @Test fun theBandKeepsItsWordsAndBothAnswers() {
        var no = 0
        var yes = 0
        compose.setContent {
            Box(Modifier.width(390.dp)) {
                NotifyInviteSheet(
                    L10n.NotifyAsk.connectionCardsTitle, L10n.NotifyAsk.connectionCardsBody, busy = false,
                    look = conversationsInviteLook(ConversationsFrame.of(LayoutClass.Compact), Modifier, 100.dp),
                    onNo = { no++ }, onYes = { yes++ },
                )
            }
        }
        compose.onNodeWithText(L10n.NotifyAsk.connectionCardsTitle).assertIsDisplayed()
        compose.onNodeWithText(L10n.NotifyAsk.connectionCardsBody).assertIsDisplayed()
        compose.onNodeWithText(L10n.NotifyAsk.no).performClick()
        compose.onNodeWithText(L10n.NotifyAsk.yes).performClick()
        assertEquals(1, no)
        assertEquals(1, yes)
    }

    // Drawing and reading back.

    /** One invite drawn in [look] on the page's cream, [width] wide, [around] its room; its box and the pixels. */
    private class Drawn(val pixels: PixelMap, val box: Rect, val paper: Float, val cream: Float, val threshold: Float)

    private fun draw(width: Dp, around: Modifier, look: @androidx.compose.runtime.Composable () -> InviteLook): Drawn {
        var paper = Color.Unspecified
        var cream = Color.Unspecified
        var pen = Color.Unspecified
        compose.setContent {
            paper = Tokens.BubbleTheirs
            cream = Tokens.Cream
            pen = Tokens.FieldBorderHover
            Box(Modifier.width(width).background(Tokens.Cream).then(around)) {
                NotifyInviteSheet(
                    L10n.NotifyAsk.connectionCardsTitle, L10n.NotifyAsk.connectionCardsBody, busy = false,
                    Modifier.testTag("invite"), look = look(),
                    onNo = {}, onYes = {},
                )
            }
        }
        compose.waitForIdle()
        val box = compose.onNodeWithTag("invite").fetchSemanticsNode().boundsInRoot
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        val paperValue = value(paper)
        // Between the darkest the grain makes the paper (the card's tile at 0.2) and the rules' pen.
        val threshold = (paperValue * 0.8f + value(pen)) / 2
        assertTrue("the grain's darkest is still clear of the pen", paperValue * 0.8f - value(pen) > 0.1f)
        return Drawn(pixels, box, paperValue, value(cream), threshold)
    }

    /** How deep the grains' specks go at most: the story bands' tile at twice their 0.045, the cards' tile at 0.2. */
    private val StoryGrainDepth = 0.09f
    private val CardGrainDepth = 0.2f

    private fun px(dp: Dp): Int = (dp.value * RuntimeEnvironment.getApplication().resources.displayMetrics.density).toInt()

    /** A colour's sRGB value, its channels' mean: the grain darkens it in proportion. */
    private fun value(color: Color): Float = color.convert(ColorSpaces.Srgb).let { (it.red + it.green + it.blue) / 3f }

    private fun assertPaper(drawn: Drawn, x: Number, y: Number, what: String) {
        val v = value(drawn.pixels[x.toInt(), y.toInt()])
        assertTrue("$what: $v is not the grey ${drawn.paper}", v <= drawn.paper + 0.02f && v >= drawn.paper * 0.8f)
        assertTrue("$what: $v is the cream", v < drawn.cream - 0.02f)
    }

    /**
     * The grain is drawn over the grey in the [w] × [h] px region from ([x], [y]): its specks darken some pixels of the
     * paper by up to about [depth] of its value, and none lightens it — a flat fill (no grain: a tile never decoded, a
     * brush never laid) would leave every pixel the paper's own.
     */
    private fun assertGrained(drawn: Drawn, x: Number, y: Number, w: Int, h: Int, depth: Float, what: String) {
        val values = (y.toInt() until y.toInt() + h).flatMap { py -> (x.toInt() until x.toInt() + w).map { px -> value(drawn.pixels[px, py]) } }
        val darkest = values.min()
        val lightest = values.max()
        assertTrue("$what: lightest $lightest over the grey ${drawn.paper}", lightest <= drawn.paper + 0.01f)
        assertTrue("$what: darkest $darkest is no speck on the grey ${drawn.paper}", darkest < drawn.paper - drawn.paper * depth / 4)
        assertTrue("$what: darkest $darkest past the grain's depth", darkest >= drawn.paper * (1 - depth) - 0.01f)
    }

    private fun assertCream(drawn: Drawn, x: Number, y: Number, what: String) {
        val v = value(drawn.pixels[x.toInt(), y.toInt()])
        assertEquals("$what: $v is not the cream", drawn.cream, v, 0.02f)
    }

    /** How much of the width a pen line runs along within 4 dp of [edge]: the share of columns with a pen-dark pixel there. */
    private fun ruled(drawn: Drawn, edge: Float): Float {
        val reach = px(4.dp)
        val from = (edge.toInt() - reach).coerceAtLeast(0)
        val to = (edge.toInt() + reach).coerceAtMost(drawn.pixels.height - 1)
        val columns = (drawn.box.left.toInt() + 1 until drawn.box.right.toInt() - 1)
        return columns.count { x -> (from..to).any { y -> value(drawn.pixels[x, y]) < drawn.threshold } } / columns.count().toFloat()
    }

    private fun contrast(a: Color, b: Color): Float {
        val (hi, lo) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (hi + 0.05f) / (lo + 0.05f)
    }
}
