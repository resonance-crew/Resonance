package com.resonance.app

import com.resonance.kit.config.UpdateNeed
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** `--es visualUpdate …` (the release screenshots' `update-required`): what it shows, and that nothing else is read as it. */
class DebugLaunchUpdateTest {
    @Test fun `required shows the update page and recommended the note, whatever the server says`() {
        assertEquals(UpdateNeed.Required, DebugLaunch.updateNeed("required"))
        assertEquals(UpdateNeed.Recommended, DebugLaunch.updateNeed("recommended"))
    }

    @Test fun `no value, or any other word, leaves it to the server`() {
        assertNull(DebugLaunch.updateNeed(null))
        assertNull(DebugLaunch.updateNeed(""))
        assertNull(DebugLaunch.updateNeed("true"))
    }
}
