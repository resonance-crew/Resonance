package com.resonance.design

import android.text.StaticLayout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import com.resonance.design.generated.Tokens
import com.resonance.geometry.PathCommand
import com.resonance.geometry.wavyLine
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Where the paper puppets' island (round 19: the home feed's and a card page's 小精靈, behind 外觀's
 * switch) finds what a screen shows — the twin of the web's `data-mascot` marks. A screen hosting the
 * island provides one ([LocalMascotMarks]); with none (the switch off, every other screen) nothing is
 * marked and nothing is kept. A mark keeps only the view's [LayoutCoordinates], written as the
 * framework places it: nothing is measured here, and nothing per frame — the island reads the marks
 * once a scroll has come to rest or the content changed ([version]).
 */
class MascotMarks {
    private val marks = LinkedHashMap<String, Mark>()

    /** A view marked: where it is, and what more the island may want of it (a band's top rule, a title's first line). */
    class Mark(val coordinates: LayoutCoordinates, val extra: Any? = null)

    /** A phone band's wavy rule along its top ([wavyLine] at its width with this seed); none for the list's first band. */
    data class BandRule(val seed: Double)

    /**
     * A bordered card's hand-drawn outline ([borderedCardOutline] at its size with this seed), in the
     * pen [Tokens.Ink]: the island is handed its drawn top and extent (round 20, the owner: the card's
     * line in front of whoever is behind it), not the flat frame it is laid out in.
     */
    data class CardOutline(val seed: Double)

    /** Bumped when a view is marked for the first time (or anew: a card composed again): the scene is read again. */
    val version = MutableStateFlow(0)

    fun mark(key: String, coordinates: LayoutCoordinates, extra: Any? = null) {
        val was = marks[key]
        if (was?.coordinates === coordinates && was.extra == extra) return
        marks[key] = Mark(coordinates, extra)
        version.value++
    }

    /** The story title's first line (its own px: left, top, right, bottom), from its layout as it is built. */
    var titleLine: Rect? = null
        private set

    fun title(layout: StaticLayout) {
        if (layout.lineCount == 0) return
        val line = Rect(layout.getLineLeft(0), layout.getLineTop(0).toFloat(), layout.getLineRight(0), layout.getLineBottom(0).toFloat())
        if (line == titleLine) return
        titleLine = line
        version.value++
    }

    /** What is marked and still laid out (a card scrolled out of the lazy list's reach is let go). */
    fun attached(): Map<String, Mark> {
        marks.entries.removeAll { !it.value.coordinates.isAttached }
        return marks.toMap()
    }

    companion object {
        /** A band's rule (dp) along its top, from x 0 to [width], as points every ~6 dp: the edge a puppet sits on. */
        fun bandRulePoints(width: Double, seed: Double, y: Double): List<Offset> {
            val out = ArrayList<Offset>()
            var x0 = 0.0
            var y0 = 0.0
            for (c in wavyLine(width, seed, 1.4, 7)) when (c) {
                is PathCommand.Move -> { x0 = c.x; y0 = c.y }
                is PathCommand.Cubic -> {
                    val n = maxOf(2, ((c.x - x0) / 6).toInt())
                    for (k in 0 until n) {
                        val t = k.toDouble() / n
                        val u = 1 - t
                        val px = u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x
                        val py = u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y
                        out += Offset(px.toFloat(), (py + y).toFloat())
                    }
                    x0 = c.x; y0 = c.y
                }
                else -> {}
            }
            out += Offset(x0.toFloat(), (y0 + y).toFloat())
            return out
        }
    }
}

/** The island's marks on this screen; null (nothing marked) where there is no island. */
val LocalMascotMarks = staticCompositionLocalOf<MascotMarks?> { null }

/** Marks this view as [key] for the island, when the screen has one. */
@Composable
fun Modifier.mascotMark(key: String, extra: Any? = null): Modifier {
    val marks = LocalMascotMarks.current ?: return this
    return onGloballyPositioned { marks.mark(key, it, extra) }
}
