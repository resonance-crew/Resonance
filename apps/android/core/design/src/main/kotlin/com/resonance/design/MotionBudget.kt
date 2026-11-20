package com.resonance.design

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext

/**
 * How much the screens may move now (A10): the system's "Remove animations" ([reducedMotion], the
 * web's prefers-reduced-motion) and Battery Saver ([powerSave]). Loaders and shimmers follow only
 * the first (the owner decides about the second); the puppets' island holds still under either;
 * stickers keep playing (round 25).
 */
data class MotionBudget(val reducedMotion: Boolean, val powerSave: Boolean) {
    /** Whatever may rest rests: animations removed, or the battery saved. */
    val calm: Boolean get() = reducedMotion || powerSave

    companion object {
        fun of(context: Context): MotionBudget = MotionBudget(
            reducedMotion = context.prefersReducedMotion(),
            powerSave = context.getSystemService(PowerManager::class.java)?.isPowerSaveMode == true,
        )
    }
}

/**
 * The [MotionBudget] now, kept up to date while the app runs: one observer of the animator scale and
 * one receiver of Battery Saver's changes for the whole process (set up by the first screen asking),
 * so a setting changed with the app open takes effect at once — `remember { prefersReducedMotion() }`
 * read it once per composable.
 */
@Composable
fun rememberMotionBudget(): MotionBudget = MotionBudgets.state(LocalContext.current).value

internal object MotionBudgets {
    private var state: MutableState<MotionBudget>? = null
    /** The application [state] listens in (one per process; a test's each new one starts afresh). */
    private var owner: Context? = null

    /** The process's one budget (main thread only, as composition is). */
    fun state(context: Context): MutableState<MotionBudget> {
        val app = context.applicationContext
        state?.takeIf { owner === app }?.let { return it }
        owner = app
        val s = mutableStateOf(MotionBudget.of(app))
        state = s
        val update = { s.value = MotionBudget.of(app) }
        runCatching {
            app.contentResolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false,
                object : ContentObserver(Handler(Looper.getMainLooper())) {
                    override fun onChange(selfChange: Boolean) = update()
                },
            )
        }
        runCatching {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) = update()
            }
            val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            // A system broadcast: delivered to a receiver that isn't exported too.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) app.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            else @Suppress("UnspecifiedRegisterReceiverFlag") app.registerReceiver(receiver, filter)
        }
        return s
    }
}
