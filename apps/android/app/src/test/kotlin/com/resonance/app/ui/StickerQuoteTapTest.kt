package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.app.Stickers
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.chat.ChatMessage
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import java.util.Date
import org.junit.Assert.assertEquals
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
 * Round 24: a sticker answering a quote rises over the quote's foot by its [quoteOverlap] — and a tap or a hold in that
 * band is the quote's (it jumps to what was quoted), not the sticker's replay or menu. Everything below the band is the
 * sticker's as before, and a sticker answering nothing takes its whole room. Laid out for real (mdpi: a dp is a pixel)
 * and touched.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
class StickerQuoteTapTest {
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

    private val catalog = StickerCatalog.parse(File("../../../public/stickers/catalog.json").readText())!!
    private val haha = catalog.find(ChatSticker("pip", "haha"))!!

    /** Its key pose kept in memory (no file is read), and its first sight spent: it rests, so nothing plays. */
    private fun atRest(sticker: StickerCatalog.Sticker, key: String) {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        val b = sticker.poseBox
        Canvas(bitmap).drawRect(b.left * 256, b.top * 256, b.right * 256, b.bottom * 256, Paint().apply { color = android.graphics.Color.RED })
        Stickers.keepPose(sticker, bitmap.asImageBitmap())
        StickerPlayback.firstSight(key)
    }

    private fun message(id: String) = ChatMessage(id, "bob", "〔貼圖：${haha.name("zh-TW")}〕", Date(0))

    /** A quote (ReplyQuoteView's place in the row) and the sticker answering it under it, as MessageCore lays them. */
    private fun answer(id: String, over: Dp?, onQuote: () -> Unit, onHold: () -> Unit) {
        atRest(haha, id)
        compose.setContent {
            Column {
                Spacer(Modifier.height(40.dp))
                if (over != null) Box(Modifier.width(240.dp).height(60.dp).testTag("quote").clickable { onQuote() })
                Box(over?.let { Modifier.overlapAbove(it) } ?: Modifier) {
                    StickerFace(haha, message(id), "", 128.dp, interactive = true, actions = emptyList(), over = over ?: 0.dp, onLongPress = onHold)
                }
            }
        }
    }

    private fun stickerTop(): Float =
        compose.onNodeWithContentDescription(L10n.Messages.stickerLabel(haha.name("zh-TW")), useUnmergedTree = true).getBoundsInRoot().top.value

    private fun tap(y: Float) = compose.onRoot().performTouchInput { click(Offset(64f, y)) }

    private fun hold(y: Float) = compose.onRoot().performTouchInput { longClick(Offset(64f, y)) }

    @Test fun aTapOrAHoldWhereTheStickerRisesOverTheQuoteIsTheQuotes() {
        val over = quoteOverlap(haha, quoted = true, 128.dp)!!
        var quoteTaps = 0
        var holds = 0
        answer("tap-band", over, onQuote = { quoteTaps++ }, onHold = { holds++ })
        val rise = over.value
        val top = stickerTop()
        val quoteFoot = compose.onNodeWithTag("quote").getBoundsInRoot().bottom.value
        // The rise itself as it was: the room's top that far up over the quote's foot (18 to its drawing, and its paper above).
        assertTrue("it rises over the quote ($rise)", rise > 18f)
        assertEquals(quoteFoot - rise, top, 0.5f)

        // In the band: the quote's — a tap jumps to what was quoted, a hold opens no menu.
        tap(top + rise / 2)
        assertEquals(1, quoteTaps)
        tap(top + rise - 2)
        assertEquals(2, quoteTaps)
        hold(top + rise / 2)
        assertEquals(0, holds)

        // Below it, the sticker's as before: a hold is the message's menu, and the quote isn't touched.
        val taps = quoteTaps
        hold(top + rise + 2)
        assertEquals(1, holds)
        hold(top + 80)
        assertEquals(2, holds)
        assertEquals(taps, quoteTaps)
    }

    @Test fun aStickerAnsweringNothingTakesItsWholeRoom() {
        var holds = 0
        answer("tap-whole", over = null, onQuote = {}, onHold = { holds++ })
        val top = stickerTop()
        assertEquals(40f, top, 0.5f)
        hold(top + 2)
        assertEquals(1, holds)
    }
}
