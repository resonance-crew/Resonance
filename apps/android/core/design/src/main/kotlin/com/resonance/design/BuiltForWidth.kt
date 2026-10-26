package com.resonance.design

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.invalidateDraw
import androidx.compose.ui.node.invalidateMeasurement
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize

/**
 * What a leaf was last built as ([builtForWidth]), for its own handlers — a tap finding the link
 * under it: written while it is measured, read after. Null until then.
 */
internal class WidthBuilt<T : Any> {
    var value: T? = null
        internal set
}

/**
 * What BoxWithConstraints gave the text leaves — the width offered, to lay their words out for —
 * without its subcomposition (a composition of its own, run inside measure, for every title,
 * excerpt, bubble and paragraph): [build] runs while measuring, for the constraints' max width, and
 * again only when that width or [key] changes; the leaf takes [size] of what it built (px, as the
 * `width`/`height` modifiers the leaves used took their dp: rounded, then within the constraints)
 * and [draw] draws it, behind anything else it holds.
 *
 * [key] holds every input of [build] and [size] but the width, [drawKey] every input of [draw]
 * besides what was built (a snapshot state read while drawing is followed on its own). A
 * recomposition with equal keys keeps what was built and drawn; another [drawKey] only draws again.
 */
internal fun <T : Any> Modifier.builtForWidth(
    key: Any,
    built: WidthBuilt<T>,
    build: (widthPx: Int) -> T,
    size: (T) -> IntSize,
    drawKey: Any? = null,
    draw: DrawScope.(T) -> Unit,
): Modifier = this then BuiltForWidthElement(key, drawKey, built, build, size, draw)

private class BuiltForWidthElement<T : Any>(
    val key: Any,
    val drawKey: Any?,
    val built: WidthBuilt<T>,
    val build: (Int) -> T,
    val size: (T) -> IntSize,
    val draw: DrawScope.(T) -> Unit,
) : ModifierNodeElement<BuiltForWidthNode<T>>() {
    override fun create() = BuiltForWidthNode(this)
    override fun update(node: BuiltForWidthNode<T>) = node.update(this)

    // The lambdas are left out: equal keys mean they would build and draw the same.
    override fun equals(other: Any?): Boolean =
        other is BuiltForWidthElement<*> && other.key == key && other.drawKey == drawKey && other.built === built

    override fun hashCode(): Int = (key.hashCode() * 31 + drawKey.hashCode()) * 31 + System.identityHashCode(built)

    override fun InspectorInfo.inspectableProperties() {
        name = "builtForWidth"
        properties["key"] = key
    }
}

private class BuiltForWidthNode<T : Any>(private var spec: BuiltForWidthElement<T>) : Modifier.Node(), LayoutModifierNode, DrawModifierNode {
    private var value: T? = null
    private var builtFor = -1

    // Only what changed is invalidated (update below), not everything at every update.
    override val shouldAutoInvalidate: Boolean get() = false

    fun update(next: BuiltForWidthElement<T>) {
        val rebuild = next.key != spec.key || next.built !== spec.built
        spec = next
        if (rebuild) {
            value = null
            builtFor = -1
            invalidateMeasurement()
        }
        invalidateDraw()
    }

    override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
        val width = constraints.maxWidth
        var v = value
        if (v == null || builtFor != width) {
            v = spec.build(width)
            value = v
            builtFor = width
            spec.built.value = v
            // The same size can hold other lines (another width, another key): draw them.
            invalidateDraw()
        }
        val s = spec.size(v)
        val w = Dp(s.width / density).roundToPx().coerceIn(constraints.minWidth, constraints.maxWidth)
        val h = Dp(s.height / density).roundToPx().coerceIn(constraints.minHeight, constraints.maxHeight)
        val placeable = measurable.measure(Constraints.fixed(w, h))
        return layout(w, h) { placeable.place(0, 0) }
    }

    override fun ContentDrawScope.draw() {
        value?.let { spec.draw(this, it) }
        drawContent()
    }
}
