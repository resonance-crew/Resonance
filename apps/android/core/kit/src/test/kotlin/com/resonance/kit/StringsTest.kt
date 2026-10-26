package com.resonance.kit

import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.MessageFormat
import com.resonance.kit.l10n.Strings
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import java.io.File
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/** The app reads the web's catalogs (src/messages); these tests load the real files. */
class StringsTest {
    private val messages = File(System.getProperty("repoRoot"), "src/messages")

    @BeforeTest fun load() {
        Strings.load { File(messages, "${it.tag}.json").readText() }
    }

    @Test fun readsBothCatalogsThroughTheGeneratedAccessors() {
        Strings.language = Strings.Language.ZhTW
        assertEquals("共振場", L10n.App.Nav.home)
        assertEquals("bob 寄來一張小紙條", L10n.App.Notifications.note(handle = "bob"))
    }

    @Test fun picksPluralBranches() {
        Strings.language = Strings.Language.En
        assertEquals("No public cards", L10n.Profile.cardCount(count = 0))
        assertEquals("1 public card", L10n.Profile.cardCount(count = 1))
        assertEquals("12 public cards", L10n.Profile.cardCount(count = 12))
        Strings.language = Strings.Language.ZhTW
        assertEquals("3 則符合", L10n.Messages.searchCount(count = 3))
    }

    @Test fun aCatalogIsReadOnlyWhenItsLanguageIsAskedForAndOnce() {
        val reads = mutableListOf<Strings.Language>()
        Strings.load { lang -> reads += lang; File(messages, "${lang.tag}.json").readText() }
        assertEquals(emptyList(), reads)
        Strings.language = Strings.Language.ZhTW
        assertEquals("共振場", L10n.App.Nav.home)
        assertEquals("bob 寄來一張小紙條", L10n.App.Notifications.note(handle = "bob"))
        assertEquals(listOf(Strings.Language.ZhTW), reads)
        // A key the language lacks reads English, once, for every miss after.
        assertEquals("no.such.key", Strings.string("no.such.key"))
        assertEquals("no.such.key", Strings.string("no.such.key"))
        assertEquals(listOf(Strings.Language.ZhTW, Strings.Language.En), reads)
        Strings.language = Strings.Language.En
        assertEquals("1 public card", L10n.Profile.cardCount(count = 1))
        assertEquals(listOf(Strings.Language.ZhTW, Strings.Language.En), reads)
    }

    @Test fun aLanguageWithoutACatalogFallsBackToEnglish() {
        val english = Strings.flatten(Json.parseToJsonElement(File(messages, "en.json").readText()).jsonObject)
        Strings.load { lang -> if (lang == Strings.Language.En) File(messages, "en.json").readText() else null }
        Strings.language = Strings.Language.ZhTW
        assertEquals(english["app.nav.home"], L10n.App.Nav.home)
    }

    @Test fun mapsSystemLanguages() {
        assertEquals(Strings.Language.ZhTW, Strings.Language.preferred(listOf("zh-Hant-TW")))
        assertEquals(Strings.Language.En, Strings.Language.preferred(listOf("ja-JP", "en-US")))
        assertEquals(Strings.Language.En, Strings.Language.preferred(listOf("fr-FR")))
    }

    @Test fun everyEntryFormatsWithoutLeftoverBraces() {
        for (language in Strings.Language.entries) {
            val tree = Json.parseToJsonElement(File(messages, "${language.tag}.json").readText()).jsonObject
            for ((key, pattern) in Strings.flatten(tree)) {
                val args = Regex("""\{\s*([A-Za-z_]\w*)""").findAll(pattern).associate { it.groupValues[1] to (2 as Any) }
                val out = MessageFormat.format(pattern, args, language)
                assertFalse('{' in out || '}' in out, "$language $key: $out")
            }
        }
    }
}
