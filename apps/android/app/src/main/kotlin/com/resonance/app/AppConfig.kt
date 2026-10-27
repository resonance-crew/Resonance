package com.resonance.app

/**
 * Which backend the app talks to. Release builds always use production;
 * debug builds launched with `--ez emulator true` use the local stack as the
 * Android emulator sees the Mac (10.0.2.2): the Firebase emulators (project
 * demo-resonance) and `npm run dev:emulator -- --port 3100`. `--ei emulatorAuthPort`,
 * `--ei emulatorFirestorePort` and `--ei emulatorApiPort` point it at another set
 * (`npm run emulators:at`), so parallel checkouts don't share one; `--es emulatorHost localhost`
 * reaches them from a phone on USB through `adb reverse` (a `bench` build times the app there).
 */
data class AppConfig(
    val usesEmulator: Boolean,
    /** Where the local stack is: the Mac as the Android emulator sees it, or the device's own loopback. */
    val emulatorHost: String = EMULATOR_HOST,
    val emulatorAuthPort: Int = 9099,
    val emulatorFirestorePort: Int = 8080,
    val emulatorApiPort: Int = 3100,
    /**
     * The Meta (Facebook) app id the app shares to Instagram Stories under (`source_application`;
     * share.spec §4.8): app "Resonance", no permissions, no review. Null hides the Stories action.
     */
    val metaAppId: String? = META_APP_ID,
) {
    val origin: String = if (usesEmulator) "http://$emulatorHost:$emulatorApiPort" else "https://resonance.channel"

    companion object {
        const val EMULATOR_HOST = "10.0.2.2"
        /** A launch's `emulatorHost`: the emulator's alias for the Mac or a loopback (the debug network config's hosts), else [EMULATOR_HOST]. */
        fun emulatorHostOf(asked: String?): String = asked?.takeIf { it in setOf(EMULATOR_HOST, "localhost", "127.0.0.1") } ?: EMULATOR_HOST
        /** The emulators run as this project (firebase/firebase.json); the app must match. */
        const val EMULATOR_PROJECT = "demo-resonance"
        /** [metaAppId]'s value (iOS: AppConfig.metaAppID). */
        const val META_APP_ID = "1115208464203859"
    }
}
