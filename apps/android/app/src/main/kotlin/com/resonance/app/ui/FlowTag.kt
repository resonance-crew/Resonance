package com.resonance.app.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import com.resonance.app.BuildConfig

/**
 * A name the interaction flows (maestro/flows, `id:`) find a control by when it has no words of its
 * own (a text field whose hint is drawn, not said). Debug builds show it as the node's resource id;
 * iOS gives the same control the same `accessibilityIdentifier`.
 */
fun Modifier.flowTag(tag: String): Modifier =
    if (BuildConfig.DEBUG) semantics { testTagsAsResourceId = true }.testTag(tag) else this
