package com.resonance.app

import com.resonance.app.ui.WriterStep
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A debug build's `--es writeStep publish` and `--ez coverFrame true` (round 25's publish-cover and cover-frame
 * screens, scripts/visual/screens.ts): the writer opens on its publish step, then 調整封面 over its cover — each
 * taken once, so a writer opened afterwards opens as it would.
 */
class DebugLaunchWriterTest {
    @After fun clear() {
        DebugLaunch.writeStep = null
        DebugLaunch.coverFrame = false
    }

    @Test fun publishIsTheOneStepALaunchOpens() {
        assertEquals(WriterStep.Publish, DebugLaunch.launchStep("publish"))
        assertEquals(WriterStep.Publish, DebugLaunch.launchStep(" Publish "))
        for (word in listOf(null, "", "write", "published", "cover")) assertNull(word, DebugLaunch.launchStep(word))
    }

    @Test fun theStepIsTakenOnce() {
        DebugLaunch.writeStep = "publish"
        assertEquals(WriterStep.Publish, DebugLaunch.takeWriteStep())
        assertNull(DebugLaunch.takeWriteStep())
    }

    @Test fun theFrameDialogIsTakenOnce() {
        assertFalse(DebugLaunch.takeCoverFrame())
        DebugLaunch.coverFrame = true
        assertTrue(DebugLaunch.takeCoverFrame())
        assertFalse(DebugLaunch.takeCoverFrame())
    }
}
