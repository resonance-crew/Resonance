package com.resonance.app

import android.app.Application
import android.content.Context
import com.resonance.kit.chat.NoteDraft
import com.resonance.kit.chat.NoteDrafts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * A note's unsent words live in their own preferences file: read back by a new store over it (the
 * app killed and opened again), gone with the account's sign-out, and never in the file the
 * device's backup and its move to a new phone take (settings.xml, BackupRulesTest).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class NoteDraftPrefsTest {
    private val app: Application get() = RuntimeEnvironment.getApplication()
    private fun store() = NoteDrafts(NoteDraftPrefs(app.getSharedPreferences(NoteDraftPrefs.FILE, Context.MODE_PRIVATE)))

    @Test fun wordsLeftInTheComposerComeBackFromTheDeviceAndGoWithTheAccount() {
        NoteDraft(store().of("alice"), "walk").keep("Your story stayed with me.")
        // A new process: a new store over the same file.
        assertEquals("Your story stayed with me.", NoteDraft(store().of("alice"), "walk").initial)

        store().forget("alice")
        assertNull(store().of("alice").text("walk"))
        assertNull(app.getSharedPreferences(NoteDraftPrefs.FILE, Context.MODE_PRIVATE).getString("notes:alice", null))
    }

    @Test fun theyAreNotInTheFileTheBackupTakes() {
        assertNotEquals("settings", NoteDraftPrefs.FILE)
        NoteDraft(store().of("alice"), "walk").keep("Private words.")
        assertEquals(emptyMap<String, Any?>(), app.getSharedPreferences("settings", Context.MODE_PRIVATE).all)
    }
}
