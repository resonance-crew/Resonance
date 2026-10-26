package com.resonance.kit.story

/**
 * How deep a story's quotes and lists may open for its Markdown to be parsed at all — the iOS
 * kit's StoryNesting. Reading a story maps its tree recursively (StoryParser, and the reader
 * draws it so), and a story of `> > > …` — which the rules let run to 200 000 characters —
 * nests tens of thousands deep: a stack overflow, not a slow read. No story worth reading nests
 * this deep; the reader draws one that does as its words, and a share card quotes none of it.
 */
object StoryNesting {
    const val LIMIT = 32

    /**
     * Whether a line of the story opens more than [limit] quotes and list items at its start (a
     * `>`, a bullet or a number followed by a space each count; a guess on the deep side, read in
     * one pass), or starts that many levels of indentation in (lists nest by indenting too).
     */
    fun tooDeep(story: String, limit: Int = LIMIT): Boolean {
        var i = 0
        val n = story.length
        fun space(c: Char) = c == ' ' || c == '\t'
        while (i < n) {
            var depth = 0
            var indent = 0
            var lineStart = true
            scan@ while (i < n && story[i] != '\n') {
                while (i < n && space(story[i])) {
                    if (lineStart) indent += if (story[i] == '\t') 4 else 1
                    i++
                }
                lineStart = false
                if (indent > limit * 4) return true
                if (i >= n) break
                when (story[i]) {
                    '>' -> i++
                    '-', '*', '+' -> {
                        if (i + 1 >= n || !space(story[i + 1])) break@scan
                        i += 2
                    }
                    in '0'..'9' -> {
                        var j = i
                        while (j < n && j - i < 9 && story[j] in '0'..'9') j++
                        if (j + 1 >= n || (story[j] != '.' && story[j] != ')') || !space(story[j + 1])) break@scan
                        i = j + 2
                    }
                    else -> break@scan
                }
                depth++
                if (depth > limit) return true
            }
            while (i < n && story[i] != '\n') i++
            i++
        }
        return false
    }
}
