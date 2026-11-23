package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Round 32 §P7 (the owner: 冷启动后点击推送通知 → 进入目标页并显示出消息的耗时): a tapped push that starts the app puts its
 * page on the stacks from the tabs' first composition — the thread composed (and its requests sent) in their first
 * frame, no feed composed under it, no push a frame later. On a debug AVD (LaunchTrace) that took the push's route to
 * the thread's first request from 0.9–1.5 s to about 10 ms. The stacks it makes are the ones the later open made.
 */
class ColdStartPushTest {
    private val thread = Route.Thread("bob", uid = "bob")

    @Test fun aConversationStartsOnTheMessagesTabOverItsListAsTheOpenWouldHaveMadeIt() {
        val start = coldStart(thread)
        assertEquals(Tab.Messages, start.tab)
        assertEquals(thread, start.pageOn(Tab.Messages))
        assertNull(start.pageOn(Tab.Feed))
        // What MainTabs' open made of it on fresh stacks: a phone's push, a tablet's pane — the same stack.
        val phone = mutableListOf<Route>(Route.Root(Tab.Messages)).also { openThread(it, thread) }
        val panes = mutableListOf<Route>(Route.Root(Tab.Messages)).also { it.chooseInPane(thread) }
        assertEquals(listOf(Route.Root(Tab.Messages), start.page), phone)
        assertEquals(phone, panes)
    }

    @Test fun anyOtherPageStartsOverTheFeedAndNoneIsTheFeedAsEver() {
        val card = Route.Card("rich-story")
        assertEquals(ColdStart(Tab.Feed, card), coldStart(card))
        assertEquals(ColdStart(Tab.Feed, null), coldStart(null))
        assertNull(coldStart(null).pageOn(Tab.Feed))
    }

    @Test fun theTabsReadTheColdStartsPushBeforeTheirFirstCompositionAndDoNotOpenItTwice() {
        val source = File("src/main/kotlin/com/resonance/app/ui/Navigation.kt").readText()
        val tabs = source.substringAfter("fun MainTabs(").substringBefore("// A tapped push: its page")
        // The stacks start with it…
        assert("PushCenter.opened.value" in tabs) { "the push is read as the tabs are first composed" }
        assert("rememberRouteStack(Route.Root(it), start.pageOn(it))" in tabs)
        assert("mutableStateOf(start.tab)" in tabs)
        // …and the effect that opens a push leaves that one (its notification still marked read).
        val effect = source.substringAfter("LaunchedEffect(tappedPush) {").substringBefore("when {")
        assert("launched.opened === opened && coldStartShows(launched.route, tab, stacks.getValue(tab))" in effect)
        assert(effect.indexOf("markRead") < effect.indexOf("launched.opened === opened"))
    }

    /**
     * The review's case: a push tapped after Android reclaimed the process — the activity recreated with its saved
     * tabs (the feed, [Root(Feed)]) — must still open its conversation: the restored stacks never took it.
     */
    @Test fun restoredStacksThatDidNotTakeThePushStillOpenIt() {
        val restored = listOf<Route>(Route.Root(Tab.Feed))
        assertFalse(coldStartShows(thread, Tab.Feed, restored))
        // Restored on Messages with another conversation on top: opened too.
        assertFalse(coldStartShows(thread, Tab.Messages, listOf(Route.Root(Tab.Messages), Route.Thread("carol", uid = "carol"))))
        // Only stacks the cold start made (or that already end with it) leave the push alone.
        val made = coldStart(thread)
        assertTrue(coldStartShows(thread, made.tab, listOf(Route.Root(Tab.Messages), made.page!!)))
        assertFalse(coldStartShows(null, Tab.Feed, restored))
        // And then the open the effect falls through to puts it on the Messages stack.
        val messages = mutableListOf<Route>(Route.Root(Tab.Messages)).also { openThread(it, thread) }
        assertEquals(thread, messages.last())
    }
}
