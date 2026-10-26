// The hand-drawn design language for Android: generated tokens, the web's
// type stack with CSS line boxes, the procedural geometry (the Kotlin port of
// src/lib/design), grain, the organic components, and the story reader.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.resonance.design"
    compileSdk = 37
    defaultConfig { minSdk = 29 }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // The components' own tests (what a finger and TalkBack meet) compose them on the JVM under
    // Robolectric, with the module's fonts and pictures.
    testOptions { unitTests.isIncludeAndroidResources = true }
    // The app's fonts and grain tiles (its assets, apps/android/app/build.gradle.kts), for those tests.
    sourceSets {
        getByName("test") {
            assets.srcDirs("../../../shared/fonts", "../../../ios/Packages/DesignSystem/Sources/DesignSystem/Resources")
        }
    }
}

// The kit's and the geometry's immutable values are stable to Compose (compose-stability.conf), so a
// row or a card rebuilt with equal values skips. `-PcomposeReports` writes the compiler's reports and
// metrics (build/compose-reports): which composables can skip and which parameters it reads as
// unstable, for an audit.
composeCompiler {
    stabilityConfigurationFiles.add(rootProject.layout.projectDirectory.file("compose-stability.conf"))
    if (providers.gradleProperty("composeReports").isPresent) {
        reportsDestination = layout.buildDirectory.dir("compose-reports")
        metricsDestination = layout.buildDirectory.dir("compose-reports")
    }
}

dependencies {
    api("com.resonance:resonance-geometry:0.1.0")
    api(project(":core:kit"))
    val composeBom = platform("androidx.compose:compose-bom:2026.09.00")
    api(composeBom)
    api("androidx.compose.ui:ui")
    api("androidx.compose.foundation:foundation")
    api("androidx.compose.material3:material3")
    api("androidx.compose.material:material-icons-core:1.7.8")
    api("io.coil-kt.coil3:coil-compose:3.6.3")
    api("io.coil-kt.coil3:coil-network-okhttp:3.6.3")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.17")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("androidx.compose.ui:ui-test-manifest")
}
