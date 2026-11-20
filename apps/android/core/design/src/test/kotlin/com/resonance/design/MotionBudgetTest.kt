package com.resonance.design

import android.content.Context
import android.content.Intent
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * A10: the motion budget follows the settings while the app runs — Battery Saver turned on, then
 * "Remove animations" — instead of what a composable read once when it was first composed.
 */
@RunWith(RobolectricTestRunner::class)
class MotionBudgetTest {
    @Test
    fun followsBatterySaverAndRemovedAnimationsLive() {
        val app = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(app.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        val state = MotionBudgets.state(app)
        assertEquals(MotionBudget(reducedMotion = false, powerSave = false), state.value)
        assertFalse(state.value.calm)

        shadowOf(app.getSystemService(PowerManager::class.java)).setIsPowerSaveMode(true)
        app.sendBroadcast(Intent(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED))
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(state.value.powerSave)
        assertFalse(state.value.reducedMotion)
        assertTrue(state.value.calm)

        Settings.Global.putFloat(app.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
        shadowOf(Looper.getMainLooper()).idle()
        assertTrue(state.value.reducedMotion)
    }
}
