package com.resonance.design

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The card page's meta line (round 9 §1): the read time and date as they were, and on the owner's
 * 私人卡 the lock and 私人卡 after them — drawn inline, read out as words.
 */
@RunWith(RobolectricTestRunner::class)
class StoryMetaLineTest {
    @get:Rule val compose = createComposeRule()

    @Before fun fonts() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
    }

    @Test fun aSharedCardsMetaIsItsReadTimeAndDate() {
        compose.setContent { StoryMetaLine("6 分鐘 · 2026年10月10日", 13f) }
        compose.onNodeWithText("6 分鐘 · 2026年10月10日").assertExists()
    }

    @Test fun aPrivateCardsMetaEndsWithTheLockAndItsName() {
        // Never published: the read time alone, then the lock (a card's page once crashed on the inline glyph's empty alternate text).
        compose.setContent { StoryMetaLine("1 分鐘", 14f, lock = "私人卡") }
        compose.onNodeWithContentDescription("1 分鐘 · 私人卡").assertExists()
    }
}
