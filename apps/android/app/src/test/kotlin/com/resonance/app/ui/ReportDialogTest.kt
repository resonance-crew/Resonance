package com.resonance.app.ui

import com.resonance.app.SafetyService
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * A tap beside the report dialog is named by the way out its foot shows: 取消 while the report is
 * being written (its foot is 取消 | 送出), 關閉 once it has turned into the thank-you note.
 */
class ReportDialogTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theBackdropSaysCancelWhileTheReportIsWrittenAndCloseOnceItIsSent() {
        assertEquals("取消", reportCloseLabel(sent = false))
        assertEquals("關閉", reportCloseLabel(sent = true))
    }

    @Test fun oneMessageReportedIsTitledForThatMessageAndTheConversationForTheWholeThread() {
        // 檢舉這則訊息 (round 16 review F1): the message's own title, not the conversation's.
        val message = SafetyService.Target.Message("m1", "bob-uid", "alice_bob")
        assertEquals("檢舉這則訊息", reportTitle(message, "bob", customTitle = L10n.Safety.reportThisMessage))
        // The bar's 檢舉 still names the conversation.
        assertEquals(L10n.Safety.Report.titleMessage("bob"), reportTitle(SafetyService.Target.Message("alice_bob", "bob-uid", "alice_bob"), "bob"))
        assertEquals(L10n.Safety.Report.titleUser("bob"), reportTitle(SafetyService.Target.User("bob-uid"), "bob"))
    }
}
