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
