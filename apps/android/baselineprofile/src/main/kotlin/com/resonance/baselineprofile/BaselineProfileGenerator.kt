package com.resonance.baselineprofile

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The app under test (the release build the plugin makes non-minified for recording). */
private const val PACKAGE = "com.resonance.stories"

/**
 * The app's hot paths (A2), recorded into its Baseline Profile: a cold start, the feed scrolled, a card
 * opened, a thread opened and the writer opened — the screens whose first frames ran interpreted or
 * JIT-compiled after an install. Signed in beforehand on the recording device (the profile needs the
 * signed-in screens); each journey goes as far as the device's account lets it and stops quietly.
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(packageName = PACKAGE, includeInStartupProfile = true) {
        pressHome()
        startActivityAndWait()
        scrollFeed()
        openCard()
        openThread()
        openWriter()
    }
}

/** A cold start timed with no profile and with the recorded one: what the profile is worth. */
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val rule = MacrobenchmarkRule()

    @Test
    fun startupWithoutProfile() = startup(CompilationMode.None())

    @Test
    fun startupWithProfile() = startup(CompilationMode.Partial())

    private fun startup(mode: CompilationMode) = rule.measureRepeated(
        packageName = PACKAGE,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.COLD,
        iterations = 8,
        setupBlock = { pressHome() },
    ) { startActivityAndWait() }
}

private const val WAIT_MILLIS = 5_000L

private fun MacrobenchmarkScope.scrollFeed() {
    val list = device.wait(Until.findObject(By.scrollable(true)), WAIT_MILLIS) ?: return
    list.setGestureMargin(device.displayWidth / 5)
    repeat(3) { list.fling(Direction.DOWN) }
    device.waitForIdle()
    list.fling(Direction.UP)
    device.waitForIdle()
}

private fun MacrobenchmarkScope.openCard() {
    val list = device.findObject(By.scrollable(true)) ?: return
    list.children.firstOrNull { it.isClickable }?.click() ?: return
    device.waitForIdle()
    device.findObject(By.scrollable(true))?.fling(Direction.DOWN)
    device.waitForIdle()
    device.pressBack()
    device.waitForIdle()
}

/** The tabs by what TalkBack calls them (the app's own words, in either language). */
private fun MacrobenchmarkScope.tab(vararg names: String) =
    names.firstNotNullOfOrNull { device.findObject(By.desc(it)) }

private fun MacrobenchmarkScope.openThread() {
    tab("訊息", "Messages")?.click() ?: return
    device.waitForIdle()
    device.findObject(By.scrollable(true))?.children?.firstOrNull { it.isClickable }?.click() ?: return
    device.waitForIdle()
    device.pressBack()
    device.waitForIdle()
}

private fun MacrobenchmarkScope.openWriter() {
    tab("寫卡片", "Write")?.click() ?: return
    device.wait(Until.hasObject(By.clazz("android.webkit.WebView")), WAIT_MILLIS)
    device.waitForIdle()
    device.pressBack()
    device.waitForIdle()
}
