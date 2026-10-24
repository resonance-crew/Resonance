package com.resonance.app.ui

import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException

/**
 * The publish step says why publishing (or saving changes) didn't go through in its own words
 * (write.publishPanel.*) — never the server's English ("A card needs a title before it is
 * published.") or the network's ("Unable to resolve host…"): a card gone can't be found; the
 * day's publishing used up waits for tomorrow; anything else didn't publish, or for an update
 * didn't save — try again.
 */
class PublishErrorTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun aRefusalOrTheServersTroubleIsThePanelsOwnFailureNeverItsWords() {
        val refusals = listOf(
            ApiFailure("invalid_request", "A card needs a title before it is published.", 400),
            ApiFailure("internal", "Something went wrong.", 500),
            ApiFailure("unexpected", "HTTP 502", 502),
        )
        for (e in refusals) assertEquals("沒發布成功，再試一次", publishError(e, StepVerb.Publish))
        assertEquals("沒發布成功，再試一次", publishError(IOException("Unable to resolve host"), StepVerb.Publish))
    }

    @Test fun theDaysPublishingUsedUpSaysToComeBackTomorrow() {
        // POST …/publish spends the `publish` budget (30 a day): trying again now would be refused again.
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("rate_limited", "Too many requests.", 429), StepVerb.Publish))
        // By the code alone (a proxy's status lost) or the status alone (an older server's code).
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("rate_limited", "Too many requests.", null), StepVerb.Publish))
        assertEquals("今天的次數用完了，明天再試", publishError(ApiFailure("unexpected", "HTTP 429", 429), StepVerb.Update))
    }

    @Test fun savingChangesThatFailSaysTheyDidntSave() {
        assertEquals("沒儲存成功，再試一次", publishError(ApiFailure("internal", "Something went wrong.", 500), StepVerb.Update))
        assertEquals("沒儲存成功，再試一次", publishError(IOException("timeout"), StepVerb.Update))
        // Every verb but a publish is a save: 儲存, 轉為草稿.
        assertEquals("沒儲存成功，再試一次", publishError(IOException("timeout"), StepVerb.Save))
        assertEquals("沒儲存成功，再試一次", publishError(IOException("timeout"), StepVerb.MakeDraft))
        assertEquals("沒發布成功，再試一次", publishError(IOException("timeout"), StepVerb.PublishAnonymously))
    }

    @Test fun aCardGoneSaysItCantBeFound() {
        assertEquals("找不到這張卡片", publishError(ApiFailure("not_found", "No such card.", 404), StepVerb.Publish))
        assertEquals("找不到這張卡片", publishError(ApiFailure("not_found", "No such card.", null), StepVerb.Update))
    }

    @Test fun inEnglishToo() {
        Strings.language = Strings.Language.En
        assertEquals("Couldn't publish — try again", publishError(ApiFailure("internal", "Something went wrong.", 500), StepVerb.Publish))
        assertEquals("That's the limit for today — try again tomorrow", publishError(ApiFailure("rate_limited", "Too many requests.", 429), StepVerb.Publish))
    }

    @Test fun droppingARevisionThatFailsSaysItDidntGoThrough() {
        // 捨棄修改 and the trash's moves say the safety copy's "didn't go through" for anything but the day's limit or a card gone.
        assertEquals("沒完成，再試一次", failureText(ApiFailure("internal", "Something went wrong.", 500), "沒完成，再試一次"))
        assertEquals("找不到這張卡片", failureText(ApiFailure("not_found", "No such card.", 404), "沒完成，再試一次"))
        assertEquals("沒完成，再試一次", failureText(null, "沒完成，再試一次"))
    }
}
