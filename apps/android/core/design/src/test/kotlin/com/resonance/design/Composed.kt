package com.resonance.design

import androidx.compose.runtime.AbstractApplier
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Composition
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Recomposer
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.ResonanceColors
import kotlin.coroutines.EmptyCoroutineContext

/** Light terracotta: the palette every screen wears by default (and the tests read their tokens in). */
val Light: ResonanceColors get() = ResonanceColors.LightTerracotta

/**
 * What [block] answers in a composition of its own (nothing drawn) under [palette]: a test's way to
 * ask a composable getter — a Tokens colour, a style or a face made from them — what it is.
 */
@Suppress("UNCHECKED_CAST")
fun <T> composed(palette: ResonanceColors = Light, block: @Composable () -> T): T {
    var out: Any? = null
    val composition = Composition(NoApplier, Recomposer(EmptyCoroutineContext))
    try {
        composition.setContent { CompositionLocalProvider(LocalResonanceColors provides palette) { out = block() } }
    } finally {
        composition.dispose()
    }
    return out as T
}

private object NoApplier : AbstractApplier<Unit>(Unit) {
    override fun insertTopDown(index: Int, instance: Unit) = Unit
    override fun insertBottomUp(index: Int, instance: Unit) = Unit
    override fun remove(index: Int, count: Int) = Unit
    override fun move(from: Int, to: Int, count: Int) = Unit
    override fun onClear() = Unit
}
