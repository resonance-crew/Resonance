package com.resonance.kit.story

/**
 * How deep a story's quotes and lists may open, and how many inline delimiters a paragraph may
 * hold ([tooComplex]), for its Markdown to be parsed at all — the iOS
 * kit's StoryNesting. Reading a story maps its tree recursively (StoryParser, and the reader
 * draws it so), and a story of `> > > …` — which the rules let run to 200 000 characters —
 * nests tens of thousands deep: a stack overflow, not a slow read. No story worth reading nests
 * this deep; the reader draws one that does as its words, and a share card quotes none of it.
 */
object StoryNesting {
    const val LIMIT = 32

    /**
     * Inline delimiters (`*`, `_`, `~`, a backtick, `[`, `]`) one paragraph may hold outside code
     * fences. A parser nests a level for each that opens and never closes (`**…`, `*_…`, `*[…`); the
     * iOS reader's runs out of a background thread's stack a few hundred levels in, and the web's
     * spends time quadratic in them. iOS and the web keep the same numbers
     * (src/lib/markdown/storyLimits.ts).
     */
    const val PARAGRAPH_DELIMITERS = 200

    /** The paragraphs' delimiter counts, squared and summed. */
    const val DELIMITER_BUDGET = 1_000_000

    /**
     * Cells all of a story's tables may come to: rows are padded to the header's columns, every line
     * after the header is a row, and the web's parser resolves a story's tables in one pass quadratic
     * in the cells written across them. Each blank-line block holding a line that could be a delimiter
     * row (only `-`, `:`, `|`, `>` and spaces, at least one `-`; a table needs no `|`) counts
     * (most `|` on a line + 1) × its lines.
     */
    const val TABLE_CELLS = 5_000

    /**
     * Whether the story is too costly to read as Markdown at all: [tooDeep], or a paragraph holding
     * more than [PARAGRAPH_DELIMITERS] inline delimiters, or more than [DELIMITER_BUDGET] over it, or
     * tables of more than [TABLE_CELLS] cells. A line ends at LF, CR or CRLF, as the parser reads it.
     */
    fun tooComplex(story: String): Boolean = tooDeep(story) || tooManyDelimiters(story)

    /**
     * Counts each paragraph's inline delimiters after its lines' quote and list markers, skipping
     * fenced code (opened as CommonMark opens one, and closed early when its container ends), and
     * every line's table cells, fenced or not.
     */
    fun tooManyDelimiters(story: String): Boolean {
        val n = story.length
        fun space(c: Char) = c == ' ' || c == '\t'
        fun delimiter(c: Char) = c == '*' || c == '_' || c == '~' || c == '`' || c == '[' || c == ']'
        fun delimiterRowChar(c: Char) = c == '|' || c == ':' || c == '-' || c == '>' || c == ' ' || c == '\t'
        fun run(from: Int, to: Int, c: Char): Int {
            var k = from
            while (k < to && story[k] == c) k++
            return k - from
        }
        fun holds(from: Int, to: Int, c: Char): Boolean = (from until to).any { story[it] == c }
        fun onlySpace(from: Int, to: Int): Boolean = (from until to).all { space(story[it]) }
        var paragraph = 0L
        var load = 0L
        var columns = 0L
        var rows = 0L
        var table = false
        var cells = 0L
        // While inside a fenced code block: its character, run length, quotes and column.
        var fence = 0.toChar()
        var fenceLength = 0
        var fenceQuotes = 0
        var fenceColumn = 0
        fun endParagraph(): Boolean {
            load += paragraph * paragraph
            if (table) cells += (columns + 1) * rows
            paragraph = 0
            columns = 0
            rows = 0
            table = false
            return load > DELIMITER_BUDGET || cells > TABLE_CELLS
        }
        var i = 0
        while (i < n) {
            var depth = 0
            var quotes = 0
            var lead = 0
            var column = 0
            prefix@ while (true) {
                lead = 0
                while (i < n && space(story[i])) {
                    val w = if (story[i] == '\t') 4 else 1
                    lead += w
                    column += w
                    i++
                }
                if (i >= n) break
                when (story[i]) {
                    '>' -> {
                        i++
                        column++
                        quotes++
                    }
                    '-', '*', '+' -> {
                        if (i + 1 >= n || !space(story[i + 1])) break@prefix
                        i += 2
                        column += 2
                    }
                    in '0'..'9' -> {
                        var j = i
                        while (j < n && j - i < 9 && story[j] in '0'..'9') j++
                        if (j + 1 >= n || (story[j] != '.' && story[j] != ')') || !space(story[j + 1])) break@prefix
                        column += j + 2 - i
                        i = j + 2
                    }
                    else -> break@prefix
                }
                depth++
            }
            val start = i
            while (i < n && story[i] != '\n' && story[i] != '\r') i++
            val end = i
            i += if (i + 1 < n && story[i] == '\r' && story[i + 1] == '\n') 2 else 1
            if (start == end && depth == 0) {
                // A blank line ends the paragraph.
                if (endParagraph()) return true
                continue
            }
            // Tables are counted on every line, inside what looks like a code fence too: a fence
            // misread must never hide one.
            var pipes = 0L
            var delimiterRow = true
            var dash = false
            for (k in start until end) {
                val c = story[k]
                if (c == '|') pipes++
                if (c == '-') dash = true else if (!delimiterRowChar(c)) delimiterRow = false
            }
            if (pipes > columns) columns = pipes
            rows++
            if (delimiterRow && dash) table = true
            if (table && cells + (columns + 1) * rows > TABLE_CELLS) return true
            if (fence != 0.toChar()) {
                // A fence ends with its container: closing early only counts more.
                if (quotes < fenceQuotes || column < fenceColumn) {
                    fence = 0.toChar()
                } else {
                    val r = run(start, end, fence)
                    if (lead <= 3 && r >= fenceLength && onlySpace(start + r, end)) {
                        fence = 0.toChar()
                        if (endParagraph()) return true
                    }
                    continue // what is inside is never read inline
                }
            }
            // A fence opens as CommonMark reads one: three or more ` or ~, indented at most three
            // columns, and a backtick fence's info string holds no backtick.
            val first = if (start < end) story[start] else ' '
            val r = if (first == '`' || first == '~') run(start, end, first) else 0
            if (r >= 3 && lead <= 3 && (first == '~' || !holds(start + r, end, '`'))) {
                fence = first
                fenceLength = r
                fenceQuotes = quotes
                fenceColumn = column
                if (endParagraph()) return true
                continue
            }
            for (k in start until end) if (delimiter(story[k])) paragraph++
            if (paragraph > PARAGRAPH_DELIMITERS) return true
        }
        return endParagraph()
    }

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
            scan@ while (i < n && story[i] != '\n' && story[i] != '\r') {
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
            while (i < n && story[i] != '\n' && story[i] != '\r') i++
            i += if (i + 1 < n && story[i] == '\r' && story[i + 1] == '\n') 2 else 1
        }
        return false
    }
}
