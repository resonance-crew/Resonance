package com.resonance.design

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.CacheDrawModifierNode
import androidx.compose.ui.draw.CacheDrawScope
import androidx.compose.ui.draw.DrawResult
import androidx.compose.ui.node.DelegatingNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.platform.InspectorInfo

/**
 * `drawWithCache` for a drawing that is a value: [block] is a data class of every input it draws
 * from (and draws in its `invoke`). Compose's own element compares its lambda by identity, so a
 * modifier factory that makes a new lambda on every call threw its cache away on every
 * recomposition; this one is equal whenever its block is, and keeps what it cached — the outline,
 * the paths, the grain brush — until the block, the size, the density or the layout direction
 * changes. The node is the one `drawWithCache` makes ([CacheDrawModifierNode]).
 */
internal fun Modifier.drawWithCacheOf(block: (CacheDrawScope) -> DrawResult): Modifier = this then DrawCacheOfElement(block)

private class DrawCacheOfElement(val block: (CacheDrawScope) -> DrawResult) : ModifierNodeElement<DrawCacheOfNode>() {
    override fun create() = DrawCacheOfNode(block)
    override fun update(node: DrawCacheOfNode) = node.update(block)
    override fun equals(other: Any?): Boolean = other is DrawCacheOfElement && other.block == block
    override fun hashCode(): Int = block.hashCode()
    override fun InspectorInfo.inspectableProperties() {
        name = "drawWithCache"
        properties["block"] = block
    }
}

private class DrawCacheOfNode(private var block: (CacheDrawScope) -> DrawResult) : DelegatingNode() {
    private val cache = delegate(CacheDrawModifierNode { block(this) })

    /** Another block (an unequal one: Compose asks only then): build the cache again at the next draw. */
    fun update(next: (CacheDrawScope) -> DrawResult) {
        block = next
        cache.invalidateDrawCache()
    }
}
