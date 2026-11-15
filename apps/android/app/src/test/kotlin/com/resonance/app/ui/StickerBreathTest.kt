package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import com.resonance.app.Stickers
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.awaitCancellation
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
import java.io.File

/**
 * Round 25 §D: the sticker picker breathes under battery saver (the owner's phone was in it, and nothing moved). Battery
 * saver changes neither whether the cells play nor how many may (8 on a phone, 12 wider); only the system's "Remove
 * animations" (animator scale 0) holds them still — read on every tick, so turning it on with the panel open stills it.
 * And the panel, composed with animations on and battery saver on, has a cell playing after its stagger (the cell's
 * [StickerMoving] flag, the web's `data-moving`).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = Application::class, qualifiers = "w400dp-h800dp-mdpi")
class StickerBreathTest {
    private val compose = createComposeRule()
    private val app: Context get() = RuntimeEnvironment.getApplication()

    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                AppFonts.init(app)
                Grain.init(app)
                Stickers.init(app, OkHttpClient())
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

    private fun batterySaver(on: Boolean) {
        shadowOf(app.getSystemService(Context.POWER_SERVICE) as PowerManager).setIsPowerSaveMode(on)
    }

    private fun animatorScale(scale: Float) {
        Settings.Global.putFloat(app.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
    }

    @Test fun batterySaverNeitherStillsThePickerNorHalvesItsLimit() {
        animatorScale(1f)
        batterySaver(true)
        assertTrue((app.getSystemService(Context.POWER_SERVICE) as PowerManager).isPowerSaveMode)
        assertFalse(app.pickerHoldsStill())
        assertEquals(8, pickerPlaying(phone = true))
        assertEquals(12, pickerPlaying(phone = false))
        // A breath at the phone's limit lets eight play at once, a ninth waits.
        var t = 0L
        val breath = PickerBreath(pickerPlaying(phone = true), now = { t })
        val cells = (1..12).map { "c$it" }
        repeat(20) {
            breath.step(cells, scrolling = false)
            t += PickerBreath.STAGGER_MILLIS
        }
        assertEquals(8, cells.count(breath::plays))
    }

    @Test fun onlyRemovedAnimationsHoldThePickerStill() {
        batterySaver(false)
        animatorScale(1f)
        assertFalse(app.pickerHoldsStill())
        animatorScale(0.5f)
        assertFalse(app.pickerHoldsStill())
        animatorScale(0f)
        assertTrue(app.pickerHoldsStill())
        batterySaver(true)
        assertTrue(app.pickerHoldsStill())
    }

    private val moving = SemanticsMatcher.expectValue(StickerMoving, true)

    private fun posesKept() {
        val pose = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888).asImageBitmap()
        catalog.packs.flatMap { it.stickers }.forEach { Stickers.keepPose(it, pose) }
    }

    @Test fun thePanelOpenWithAnimationsOnHasACellPlayingAfterItsStaggerEvenUnderBatterySaver() {
        animatorScale(1f)
        batterySaver(true)
        posesKept()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            StickerPanel(
                catalog, emptyList(), "http://127.0.0.1:9", onTap = {},
                modifier = Modifier.width(400.dp).height(360.dp),
                // The file never arrives: the turn stays while the test looks (the pose shows meanwhile).
                decode = { _, _, _ -> awaitCancellation() },
            )
        }
        compose.mainClock.advanceTimeBy(PickerBreath.STAGGER_MILLIS * 4)
        compose.waitForIdle()
        assertTrue(compose.onAllNodes(moving, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
    }

    @Test fun removingAnimationsWithThePanelOpenStillsItAtTheNextTick() {
        animatorScale(1f)
        posesKept()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            StickerPanel(
                catalog, emptyList(), "http://127.0.0.1:9", onTap = {},
                modifier = Modifier.width(400.dp).height(360.dp),
                decode = { _, _, _ -> awaitCancellation() },
            )
        }
        compose.mainClock.advanceTimeBy(PickerBreath.STAGGER_MILLIS * 4)
        compose.waitForIdle()
        assertTrue(compose.onAllNodes(moving, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        animatorScale(0f)
        compose.mainClock.advanceTimeBy(PickerBreath.STAGGER_MILLIS * 2)
        compose.waitForIdle()
        assertTrue(compose.onAllNodes(moving, useUnmergedTree = true).fetchSemanticsNodes().isEmpty())
    }
}
