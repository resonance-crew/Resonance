package com.resonance.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

/**
 * A form whose verb is working (the writer's publish step while 發布 goes through) holds every
 * touch, and fades nothing through a layer: a layer is cut at the form's box, and the card it shows
 * draws past it — a tablet's bordered card's pen line, a phone's band out to the screen's edges —
 * which was seen cut straight on a tablet each time 發布, 儲存修改 or 存成草稿 was pressed.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class HoldWhileTest {
    @get:Rule val compose = createComposeRule()

    private var held by mutableStateOf(false)

    @Test fun whileHeldATapReachesNothingUnderIt() {
        var taps = 0
        compose.setContent {
            Box(Modifier.holdWhile(held)) {
                BasicText("發布", Modifier.clickable { taps++ })
            }
        }
        held = true
        compose.onNodeWithText("發布").performClick()
        assertEquals(0, taps)
        held = false
        compose.onNodeWithText("發布").performClick()
        assertEquals(1, taps)
    }

    @Test fun whileHeldWhatRunsPastItsBoxIsStillDrawnWhole() {
        held = true
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, 1f)) {
                Box(Modifier.size(100.dp).background(Color.White)) {
                    // The form's box starts 20 in; the pen line it holds swings 10 out past it.
                    Box(Modifier.padding(20.dp).holdWhile(held)) {
                        Box(Modifier.size(60.dp).drawBehind { drawRect(Color.Red, Offset(-10f, 0f), Size(6f, size.height)) })
                    }
                }
            }
        }
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        // Drawn in full, as when nothing is working: neither cut at the box nor faded.
        assertEquals(Color.Red, pixels[12, 40])
    }
}
