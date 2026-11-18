package com.resonance.app

import android.content.SharedPreferences
import com.resonance.kit.chat.NoteDrafts

/**
 * Where unsent notes wait on the device ([NoteDrafts]): `note-drafts.xml`, one entry per account.
 * Outside the device's backup and its move to a new phone (they take `settings.xml` alone), so a
 * note's words never travel with it, and they go with the account's other local data on sign-out.
 */
class NoteDraftPrefs(private val prefs: SharedPreferences) : NoteDrafts.Storage {
    override fun read(account: String): String? = prefs.getString(key(account), null)

    override fun write(account: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key(account)) else putString(key(account), value) }.apply()
    }

    private fun key(account: String) = "notes:$account"

    companion object {
        /** The preferences file's name. */
        const val FILE = "note-drafts"
    }
}

/**
 * Where unsent reading reports wait on the device ([com.resonance.app.ui.ReadingReports], round 26 §U7):
 * `reading-reports.xml`, one entry per account — outside the device's backup, as the notes' drafts are, and gone
 * with the account's other local data on sign-out.
 */
class ReadingReportPrefs(private val prefs: SharedPreferences) : com.resonance.app.ui.ReadingReports.Storage {
    override fun read(account: String): String? = prefs.getString("reports:$account", null)

    override fun write(account: String, value: String?) {
        prefs.edit().apply { if (value == null) remove("reports:$account") else putString("reports:$account", value) }.apply()
    }
}
