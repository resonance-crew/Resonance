package com.resonance.kit.chat

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The stickers the app bundles are the site's catalog as it is (public/stickers/catalog.json): five
 * packs in the picker's order, each sticker named in both languages, its files where the site keeps
 * them; a sticker a later build added comes from the site's copy; the recents tab is per account.
 */
class StickerCatalogTest {
    private val catalog = StickerCatalog.parse(File(System.getProperty("repoRoot"), "public/stickers/catalog.json").readText())!!

    @Test fun theBundledCatalogHasTheFivePuppetsPacksInOrderWithEveryStickerNamedInBothLanguages() {
        assertEquals(listOf("tuck", "twine", "nod", "pip", "hush"), catalog.packs.map { it.id })
        assertTrue(catalog.all.size >= 29, "29 stickers in the first round")
        catalog.all.forEach { s ->
            assertTrue(s.names["zh-TW"]!!.isNotBlank() && s.names["en"]!!.isNotBlank(), "${s.pack}/${s.id} is named")
            // Its files are where the site keeps them, each next to the catalog.
            assertTrue(File(System.getProperty("repoRoot"), "public/stickers/${s.file}").isFile, s.file)
            assertTrue(File(System.getProperty("repoRoot"), "public/stickers/${s.thumb}").isFile, s.thumb)
        }
        catalog.packs.forEach { assertTrue(File(System.getProperty("repoRoot"), "public/stickers/${it.icon}").isFile, it.icon) }
    }

    @Test fun aStickerIsFoundByWhatAMessageNamesAndSaysItsNameInTheLanguageAsked() {
        val thanks = catalog.find(ChatSticker("twine", "thanks"))!!
        assertEquals("謝謝", thanks.name("zh-TW"))
        assertEquals("Thanks", thanks.name("en"))
        // A language the catalog doesn't have reads in Chinese.
        assertEquals("謝謝", thanks.name("ja"))
        assertEquals("/stickers/twine/thanks.webp?v=${thanks.v}", thanks.url)
        assertEquals("/stickers/twine/thanks.thumb.webp?v=${thanks.v}", thanks.thumbUrl)
        assertNull(catalog.find(ChatSticker("twine", "no-such")))
        assertEquals("牽牽", catalog.pack("twine")!!.name("zh-TW"))
    }

    @Test fun theSitesCopyBringsOnlyWhatTheBundleLacks() {
        val site = StickerCatalog.parse(
            """{"version":2,"packs":[
              {"id":"twine","name":{"zh-TW":"牽牽X"},"stickers":[{"id":"thanks","name":{"zh-TW":"別的"},"v":"9"},{"id":"wave","name":{"zh-TW":"揮手","en":"Wave"},"v":"3"}]},
              {"id":"moon","name":{"zh-TW":"月月","en":"Moon"},"stickers":[{"id":"hello","name":{"zh-TW":"你好"},"v":"1"}]}
            ]}""",
        )!!
        val merged = catalog.merged(site)
        assertEquals(2, merged.version)
        // What the bundle has stays as bundled (its file is on the device, under its own version).
        assertEquals(catalog.find(ChatSticker("twine", "thanks")), merged.find(ChatSticker("twine", "thanks")))
        assertEquals("揮手", merged.find(ChatSticker("twine", "wave"))!!.name("zh-TW"))
        assertNotNull(merged.find(ChatSticker("moon", "hello")))
        assertEquals("moon", merged.packs.last().id)
    }

    @Test fun idsTheContractRefusesAreLeftOutAndABrokenFileReadsAsNone() {
        val odd = StickerCatalog.parse("""{"version":1,"packs":[{"id":"Bad Pack","stickers":[{"id":"x"}]},{"id":"ok","stickers":[{"id":"UPPER"},{"id":"fine"}]}]}""")!!
        assertEquals(listOf("ok"), odd.packs.map { it.id })
        assertEquals(listOf("fine"), odd.packs.single().stickers.map { it.id })
        assertNull(StickerCatalog.parse("not json"))
    }

    @Test fun eachStickerSaysWhereItsDrawingSitsInItsSquareAndAnOlderCatalogReadsAsTheWholeSquare() {
        // 點點's 哈哈: the top 28 % of its square is empty paper in every frame (round 24).
        val haha = catalog.find(ChatSticker("pip", "haha"))!!
        assertEquals(StickerBox(0.037f, 0.278f, 0.965f, 0.972f), haha.box)
        assertEquals(StickerBox(0.035f, 0.332f, 0.934f, 0.973f), haha.poseBox)
        catalog.all.forEach { s ->
            assertTrue(s.box != StickerBox.Whole && s.poseBox != StickerBox.Whole, "${s.pack}/${s.id} has its boxes")
            assertTrue(s.box.top < s.box.bottom && s.box.left < s.box.right, "${s.pack}/${s.id}")
        }
        // A catalog from before round 24 (an older bundle, the site's then), or numbers that make no box: the whole square.
        val old = StickerCatalog.parse("""{"version":1,"packs":[{"id":"ok","stickers":[
            {"id":"a"},
            {"id":"b","box":[0.1,0.2,0.9],"poseBox":[0.5,0.2,0.4,0.9]},
            {"id":"c","box":[-0.1,0.2,0.9,0.9],"poseBox":[0.1,0.2,0.9,1.5]}
        ]}]}""")!!
        old.all.forEach {
            assertEquals(StickerBox.Whole, it.box, it.id)
            assertEquals(StickerBox.Whole, it.poseBox, it.id)
        }
    }

    @Test fun theThreadTakesRoomForTheDrawingAndTwoPercentAboveAndBelowItInsideTheSquare() {
        val haha = catalog.find(ChatSticker("pip", "haha"))!!.box
        assertEquals(0.258f, haha.trimTop, 1e-4f)
        assertEquals(0.992f, haha.trimBottom, 1e-4f)
        assertEquals(0.734f, haha.trimHeight, 1e-4f)
        // Never taller than the square, never above its top: a drawing that reaches its edges takes it whole.
        val edge = StickerBox(0f, 0.01f, 1f, 0.995f)
        assertEquals(0f, edge.trimTop)
        assertEquals(1f, edge.trimHeight)
        assertEquals(1f, edge.trimBottom)
        assertEquals(0f, StickerBox.Whole.trimTop)
        assertEquals(1f, StickerBox.Whole.trimHeight)
        // The web's `stickerTrim` and iOS's `StickerTrim`, to the number: max(0, top − 2 %) and min(1, height + 4 %).
        // 牽牽's 在嗎？ starts 1.9 % down: its room starts at the square's top and is still its drawing and both margins
        // tall (0.998, not the 0.997 a room ended at its drawing's foot + 2 % would be).
        val anyone = catalog.find(ChatSticker("twine", "anyone-there"))!!.box
        assertEquals(0f, anyone.trimTop)
        assertEquals(0.977f - 0.019f + 0.04f, anyone.trimHeight, 1e-4f)
        // 點點's 謝謝你！ reaches 1.9 % from the foot: its room ends a hair past it (where the square is clear), 0.882 tall.
        val thankYou = catalog.find(ChatSticker("pip", "thank-you"))!!.box
        assertEquals(0.119f, thankYou.trimTop, 1e-4f)
        assertEquals(0.882f, thankYou.trimHeight, 1e-4f)
        assertEquals(1.001f, thankYou.trimBottom, 1e-4f)
        catalog.all.forEach { s ->
            val b = s.box
            assertTrue(b.trimTop in 0f..b.top && b.trimHeight in 0f..1f, "${s.pack}/${s.id}")
            // Every frame inside the room, and the room no more than a hair past the square.
            assertTrue(b.bottom <= b.trimBottom && b.trimBottom <= 1.002f, "${s.pack}/${s.id}")
        }
    }

    @Test fun aStickerAnsweringAQuoteComesUpOverItByItsKeyPosesDrawing() {
        // The web's `stickerArtTop`: where the key pose starts in the room, of the side.
        val hi = catalog.find(ChatSticker("pip", "hi"))!!
        assertEquals(hi.poseBox.top - (hi.box.top - StickerBox.TRIM_MARGIN), hi.artTop, 1e-4f)
        // A key pose as high as its frames: the margin alone; a sticker without numbers: none.
        val haha = catalog.find(ChatSticker("pip", "haha"))!!
        assertEquals(StickerBox.TRIM_MARGIN, haha.copy(poseBox = haha.box).artTop, 1e-4f)
        assertEquals(0f, haha.copy(box = StickerBox.Whole, poseBox = StickerBox.Whole).artTop)
        // Never negative, should a pose start above the room.
        assertEquals(0f, haha.copy(poseBox = StickerBox(0f, 0.1f, 1f, 0.9f)).artTop)
    }

    @Test fun aQuotedPoseStandsInTheMiddleAsLargeAsFitsWithFourPercentToSpareNeverSmallerThanItsSquare() {
        fun centre(b: StickerBox) = (b.quoteX + b.quoteScale * (b.left + b.right) / 2) to (b.quoteY + b.quoteScale * (b.top + b.bottom) / 2)
        val pose = catalog.find(ChatSticker("pip", "haha"))!!.poseBox
        val (x, y) = centre(pose)
        assertEquals(0.5f, x, 1e-4f)
        assertEquals(0.5f, y, 1e-4f)
        // Its longer side (its width, 0.899) fills 92 % of the quote.
        assertEquals(0.92f, pose.quoteScale * maxOf(pose.width, pose.height), 1e-4f)
        // Its drawing then lies within the quote, 4 % in at least from every edge.
        assertTrue(pose.quoteY + pose.quoteScale * pose.top >= 0.04f - 1e-4f)
        assertTrue(pose.quoteY + pose.quoteScale * pose.bottom <= 0.96f + 1e-4f)
        // A pose already larger than that is only centred, never shrunk; the whole square stays as it is.
        val big = StickerBox(0.01f, 0.1f, 0.99f, 0.9f)
        assertEquals(1f, big.quoteScale)
        assertEquals(0.5f, centre(big).first, 1e-4f)
        assertEquals(0.5f, centre(big).second, 1e-4f)
        assertEquals(1f, StickerBox.Whole.quoteScale)
        assertEquals(0f, StickerBox.Whole.quoteX)
        assertEquals(0f, StickerBox.Whole.quoteY)
    }

    private class Device : StickerRecents.Storage {
        val values = HashMap<String, String>()
        override fun read(account: String): String? = values[account]
        override fun write(account: String, value: String?) {
            if (value == null) values.remove(account) else values[account] = value
        }
    }

    @Test fun recentsAreTheLastEightSentNewestFirstOncePerAccountAndGoWithTheAccount() {
        val device = Device()
        val alice = StickerRecents(device).of("alice")
        assertEquals(emptyList(), alice.list())
        val all = catalog.all.map { it.ref }
        all.take(10).forEach { alice.used(it) }
        assertEquals(all.take(10).reversed().take(8), StickerRecents(device).of("alice").list())
        // Sent again: it leads, once.
        alice.used(all[5])
        assertEquals(all[5], alice.list().first())
        assertEquals(8, alice.list().size)
        assertEquals(1, alice.list().count { it == all[5] })
        assertEquals(emptyList(), StickerRecents(device).of("bob").list())
        StickerRecents(device).forget("alice")
        assertEquals(emptyList(), alice.list())
    }
}
