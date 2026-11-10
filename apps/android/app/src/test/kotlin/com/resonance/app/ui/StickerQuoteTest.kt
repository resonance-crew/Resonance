package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.resonance.app.Stickers
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.chat.StickerBox
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.Strings
import java.io.File
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
 * Round 24's stickers as quotes and in the thread (the owner: 「我如果選擇回覆一個貼圖之後，再選擇回覆另外一個貼圖，沒辦法
 * 切換」; 點點's empty paper above it): the composer's reply row follows the sticker answered, however it changes; a quoted
 * pose stands in the middle of its thumbnail; a sticker in the thread takes room for its drawing, not its square. Drawn
 * here for real (mdpi: a dp is a pixel) and read back.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
class StickerQuoteTest {
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
    private val thanks = catalog.find(ChatSticker("twine", "thanks"))!!

    /** A key pose no file holds: [color] over exactly its pose box (the drawing's), clear round it — kept as [sticker]'s. */
    private fun keepPose(sticker: StickerCatalog.Sticker, color: Int, side: Int = 256): ImageBitmap {
        val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
        val b = sticker.poseBox
        Canvas(bitmap).drawRect(b.left * side, b.top * side, b.right * side, b.bottom * side, Paint().apply { this.color = color })
        return bitmap.asImageBitmap().also { Stickers.keepPose(sticker, it) }
    }

    private fun PixelMap.isRed(x: Int, y: Int) = this[x, y].let { it.red > 0.8f && it.green < 0.3f && it.blue < 0.3f }

    @Test fun theReplyRowFollowsTheStickerAnsweredWhicheverWayItChanges() {
        keepPose(haha, android.graphics.Color.RED)
        keepPose(thanks, android.graphics.Color.BLUE)
        fun quote(id: String, sticker: StickerCatalog.Sticker?) =
            ReplyQuote(id, "bob", if (sticker != null) "〔貼圖：${sticker.name("zh-TW")}〕" else "那篇雨後散步", sticker = sticker?.ref)
        var replying by mutableStateOf(quote("m1", haha))
        compose.setContent {
            // The composer's own reply row (ComposerRows draws exactly this), on white.
            Box(Modifier.width(360.dp).background(Color.White)) {
                ComposerReplyRow(
                    replying, "回覆 bob", "", short = false, onCancel = {}, onTap = {},
                    wordsMedia = { null }, find = catalog::find,
                )
            }
        }
        // The pose's thumbnail, by the name it gives TalkBack (inside the row's tap target), read at its centre — faded
        // as quoted words are, so its colour leads rather than being pure.
        fun pose(name: String) = compose.onNodeWithContentDescription("貼圖：$name", useUnmergedTree = true)
        fun centre(name: String) = pose(name).captureToImage().toPixelMap().let { it[it.width / 2, it.height / 2] }
        fun reddish(c: Color) = c.red > c.green + 0.2f && c.red > c.blue + 0.2f
        fun bluish(c: Color) = c.blue > c.red + 0.2f && c.blue > c.green + 0.2f
        assertTrue("點點 first", reddish(centre(haha.name("zh-TW"))))
        // 回覆 on another sticker: the row quotes that one now (it used to keep the first one's pose).
        replying = quote("m2", thanks)
        compose.waitForIdle()
        pose(haha.name("zh-TW")).assertDoesNotExist()
        assertTrue("牽牽 now", bluish(centre(thanks.name("zh-TW"))))
        // Then words — no pose left behind — then a sticker again, then that same sticker answered again.
        replying = quote("m3", null)
        compose.waitForIdle()
        compose.onNodeWithText("那篇雨後散步", useUnmergedTree = true).assertExists()
        pose(thanks.name("zh-TW")).assertDoesNotExist()
        replying = quote("m1", haha)
        compose.waitForIdle()
        assertTrue("點點 again", reddish(centre(haha.name("zh-TW"))))
        replying = quote("m4", haha)
        compose.waitForIdle()
        assertTrue("點點 still", reddish(centre(haha.name("zh-TW"))))
    }

    @Test fun aQuotedPoseStandsInTheMiddleOfItsThumbnailNotBelowItsHalf() {
        keepPose(haha, android.graphics.Color.RED)
        compose.setContent {
            Box(Modifier.size(100.dp).background(Color.White)) { QuotedStickerPose(haha, "", Modifier.fillMaxSize().testTag("pose")) }
        }
        val map = compose.onNodeWithTag("pose").captureToImage().toPixelMap()
        val reds = (0 until map.height).flatMap { y -> (0 until map.width).filter { x -> map.isRed(x, y) }.map { x -> x to y } }
        val top = reds.minOf { it.second }
        val bottom = reds.maxOf { it.second } + 1
        val left = reds.minOf { it.first }
        val right = reds.maxOf { it.first } + 1
        // Centred: its drawing (the square's lower two thirds) as far from the top as from the foot.
        assertEquals(0f, ((top + bottom) / 2f) - 50f, 1.5f)
        assertEquals(0f, ((left + right) / 2f) - 50f, 1.5f)
        // As large as fits with 4 % to spare: its longer side, its width, 92 of the 100.
        assertEquals(92f, (right - left).toFloat(), 2f)
        assertTrue("4 % clear at the top, not a third", top in 15..19)
    }

    @Test fun aStickerInTheThreadTakesRoomForItsDrawingWithItsSquareLaidUpInIt() {
        val box = haha.box
        compose.setContent {
            Column {
                Spacer(Modifier.height(100.dp))
                Box(Modifier.testTag("room").stickerRoom(128.dp, box)) { Box(Modifier.fillMaxSize().testTag("square")) }
                Box(Modifier.size(10.dp).testTag("next"))
            }
        }
        val room = compose.onNodeWithTag("room").getBoundsInRoot()
        val square = compose.onNodeWithTag("square").getBoundsInRoot()
        val next = compose.onNodeWithTag("next").getBoundsInRoot()
        val (up, height) = stickerRoomPx(128, box)
        // 2 % above its drawing (0.278 − 0.02 of 128) to 2 % below it: 94 of the square's 128.
        assertEquals(33, up)
        assertEquals(94, height)
        assertEquals(100f, room.top.value, 0.5f)
        assertEquals(94f, (room.bottom - room.top).value, 0.5f)
        assertEquals(128f, (room.right - room.left).value, 0.5f)
        // The square whole, laid up so its empty paper takes no room; what follows starts at the room's foot.
        assertEquals(128f, (square.bottom - square.top).value, 0.5f)
        assertEquals(room.top.value - 33f, square.top.value, 0.5f)
        assertEquals(room.bottom.value, next.top.value, 0.5f)
        // A sticker whose drawing fills its square, or one the catalog has no numbers for, keeps its square.
        assertEquals(0 to 128, stickerRoomPx(128, StickerBox.Whole))
        // The room is the drawing and both margins tall wherever it lies (the web's and iOS's): 牽牽's 在嗎？, 1.9 % from
        // the top, starts at the top and keeps its 4 %; 點點's 謝謝你！, 1.9 % from the foot, ends a pixel past it.
        val anyone = catalog.find(ChatSticker("twine", "anyone-there"))!!.box
        assertEquals(0 to 998, stickerRoomPx(1000, anyone))
        val thankYou = catalog.find(ChatSticker("pip", "thank-you"))!!.box
        assertEquals(119 to 882, stickerRoomPx(1000, thankYou))
    }

    @Test fun thePlayingStickerIsItsRoomAndItsPoseIsDrawnInIt() {
        keepPose(haha, android.graphics.Color.RED)
        compose.setContent {
            Column(Modifier.background(Color.White)) {
                Spacer(Modifier.height(40.dp))
                PlayingSticker(haha, "", key = "thread-test-haha", size = 128.dp, autoplay = { false }, replays = 0, modifier = Modifier.testTag("sticker"))
            }
        }
        val bounds = compose.onNodeWithTag("sticker").getBoundsInRoot()
        assertEquals(94f, (bounds.bottom - bounds.top).value, 0.5f)
        // At rest on its pose: the drawing starts a few pixels under the room's top (its 2 %), not a third of the way down.
        val map = compose.onNodeWithTag("sticker").captureToImage().toPixelMap()
        val first = (0 until map.height).first { y -> (0 until map.width).any { x -> map.isRed(x, y) } }
        assertTrue("drawing starts at $first", first in 2..12)
    }
}
