package com.resonance.design

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A story's title and words follow the system's text size up to twice the normal (the owner's
 * reading curve), while the interface around them keeps its 1.25 cap — wherever the story sits,
 * under the root's cap included, and back to the cap outside it.
 */
@RunWith(RobolectricTestRunner::class)
class ReadingTextScaleTest {
    @get:Rule val compose = createComposeRule()

    @Test fun theReadingCurveFollowsTheSettingUpToTwice() {
        for (system in listOf(0.85f, 1f, 1.15f, 1.3f, 1.5f, 1.8f, 2f)) assertEquals(system, readingTextScale(system), 0f)
        assertEquals(MAX_READING_SCALE, readingTextScale(3f), 0f)
        assertEquals(2f, MAX_READING_SCALE, 0f)
        // Never below the interface's own scale: the story's words are never smaller than the buttons beside them grew.
        var system = 0.5f
        while (system <= 4f) {
            assertTrue(readingTextScale(system) >= textScale(system))
            system += 0.05f
        }
    }

    private class Scales {
        var root = 0f
        var story = 0f
        var after = 0f
    }

    @Composable
    private fun AtSystemScale(fontScale: Float, content: @Composable () -> Unit) {
        val config = Configuration(LocalConfiguration.current).apply { this.fontScale = fontScale }
        CompositionLocalProvider(LocalConfiguration provides config, content = content)
    }

    private fun measure(fontScale: Float): Scales {
        val seen = Scales()
        compose.setContent {
            AtSystemScale(fontScale) {
                CappedTextScale {
                    seen.root = LocalDensity.current.fontScale
                    ReadingTextScale { seen.story = LocalDensity.current.fontScale }
                    // A dialog or a card the story embeds goes back under the cap.
                    ReadingTextScale { CappedTextScale { seen.after = LocalDensity.current.fontScale } }
                }
            }
        }
        compose.waitForIdle()
        return seen
    }

    @Test fun theStoryGrowsPastTheCapAndTheInterfaceDoesNot() {
        val large = measure(1.8f)
        assertEquals(1.25f, large.root, 1e-6f)
        assertEquals(1.8f, large.story, 1e-6f)
        assertEquals(1.25f, large.after, 1e-6f)
    }

    @Test fun atTheLargestSettingTheStoryStopsAtTwice() {
        val largest = measure(3f)
        assertEquals(1.25f, largest.root, 1e-6f)
        assertEquals(2f, largest.story, 1e-6f)
    }

    @Test fun smallerTextStaysSmallerForBoth() {
        val small = measure(0.85f)
        assertEquals(0.85f, small.root, 1e-6f)
        assertEquals(0.85f, small.story, 1e-6f)
    }
}
