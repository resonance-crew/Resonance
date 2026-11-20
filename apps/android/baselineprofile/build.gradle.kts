// The app's Baseline Profile and its startup benchmark (A2): run on a device or an emulator of your own,
// `./gradlew :app:generateReleaseBaselineProfile` records the five journeys (BaselineProfileGenerator) into
// app/src/release/generated/baselineProfiles; `./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest`
// times a cold start with and without it (StartupBenchmark).
plugins {
    id("com.android.test")
    id("androidx.baselineprofile")
}

android {
    namespace = "com.resonance.baselineprofile"
    compileSdk = 37

    defaultConfig {
        minSdk = 29
        targetSdk = 36
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    targetProjectPath = ":app"
}

// Never a managed device here: the person recording picks the device (never the owner's phone).
baselineProfile {
    useConnectedDevices = true
}

dependencies {
    implementation("androidx.test.ext:junit:1.3.0")
    implementation("androidx.test.uiautomator:uiautomator:2.3.0")
    implementation("androidx.benchmark:benchmark-macro-junit4:1.5.0")
}
