/**
 * Whether a story's Markdown is too costly to read as a tree — the web's twin
 * of the apps' StoryNesting, and one rule more. Every reader of a story builds
 * its tree and walks it recursively (react-markdown on the card page, the
 * server's fromMarkdown walks for embeds, link cards and share passages), and
 * the rules let a story run to 200 000 characters:
 *
 * - quotes and lists opened a few thousand deep (`> > > …`) overflow the
 *   stack — a crash on the page's server render and in every reader's tab,
 *   not a slow read;
 * - a paragraph of thousands of emphasis, strikethrough, code or bracket
 *   delimiters (`**…`, `~~a …`, `*[…`, `a* *…`) costs the parser time
 *   quadratic in their number — minutes for one paragraph — and nests as
 *   deep;
 * - a table's rows are padded to its header's columns: a wide header over
 *   many short lines comes to millions of cells.
 *
 * No story worth reading comes near either. One that does is drawn as its
 * words (StoryMarkdown), embeds and link cards nothing, and a share card
 * quotes none of it — as the apps do (their StoryNesting, the same rule, but
 * for indentation counted at the line's start only).
 * One pass over the text, a few counters: nothing here can be slow itself.
 */

/** Quotes and list items one line may open, and (×4) the columns of indentation it may start in. */
export const STORY_NESTING_LIMIT = 32;
/**
 * Inline delimiters (`* _ ~ \` [ ]`) one paragraph may hold outside code fences: a parser nests a
 * level for each that opens and never closes, and the iOS reader's runs out of a background
 * thread's stack a few hundred levels in (the apps' StoryNesting keeps the same number).
 */
export const PARAGRAPH_DELIMITER_LIMIT = 200;
/** The paragraphs' delimiter counts, squared and summed: what the parser's work grows with. */
export const STORY_DELIMITER_BUDGET = 1_000_000;
/**
 * Cells one table may come to. A GFM table pads every row to its header's columns, and any line
 * after the header is a row: a header of a thousand `|` over ten thousand one-letter lines is ten
 * million cells from a few dozen KB. Read per blank-line block as (most `|` on a line + 1) × lines.
 */
export const TABLE_CELL_LIMIT = 20_000;

const SPACE = 0x20;
const TAB = 0x09;
const NEWLINE = 0x0a;
const CR = 0x0d;

function isSpace(c: number): boolean {
  return c === SPACE || c === TAB || c === CR;
}

function isDelimiter(c: number): boolean {
  // * _ ~ ` [ ]
  return c === 0x2a || c === 0x5f || c === 0x7e || c === 0x60 || c === 0x5b || c === 0x5d;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

export function storyTooComplex(story: string): boolean {
  const n = story.length;
  let i = 0;
  let paragraph = 0; // delimiters in the paragraph being read
  let load = 0; // Σ paragraph²
  let columns = 0; // most `|` on a line of the paragraph (a table's header has its columns' worth)
  let rows = 0; // the paragraph's lines (every line after a table's header is a row)
  let fence = 0; // the fence character while inside a fenced code block (` or ~), else 0
  const endParagraph = (): boolean => {
    load += paragraph * paragraph;
    paragraph = 0;
    columns = 0;
    rows = 0;
    return load > STORY_DELIMITER_BUDGET;
  };
  while (i < n) {
    // The line's container prefix: indentation (all of it, also between markers) and quote/list markers.
    let depth = 0;
    let indent = 0;
    for (;;) {
      while (i < n && isSpace(story.charCodeAt(i))) {
        indent += story.charCodeAt(i) === TAB ? 4 : 1;
        i++;
      }
      if (indent > STORY_NESTING_LIMIT * 4) return true;
      if (i >= n) break;
      const c = story.charCodeAt(i);
      if (c === 0x3e) {
        // >
        i++;
      } else if ((c === 0x2d || c === 0x2a || c === 0x2b) && i + 1 < n && isSpace(story.charCodeAt(i + 1))) {
        // - * + and a space
        i += 2;
      } else if (isDigit(c)) {
        let j = i;
        while (j < n && j - i < 9 && isDigit(story.charCodeAt(j))) j++;
        const after = story.charCodeAt(j);
        if (j + 1 < n && (after === 0x2e || after === 0x29) && isSpace(story.charCodeAt(j + 1))) i = j + 2;
        else break;
      } else {
        break;
      }
      if (++depth > STORY_NESTING_LIMIT) return true;
    }
    // The line's content.
    const start = i;
    while (i < n && story.charCodeAt(i) !== NEWLINE) i++;
    const end = i;
    i++; // past the line feed
    if (start === end && depth === 0) {
      // A blank line ends the paragraph.
      if (endParagraph()) return true;
      continue;
    }
    const first = story.charCodeAt(start);
    if ((first === 0x60 || first === 0x7e) && story.charCodeAt(start + 1) === first && story.charCodeAt(start + 2) === first) {
      // A code fence opens or closes: what is inside is never read inline.
      if (!fence) fence = first;
      else if (fence === first) fence = 0;
      if (endParagraph()) return true;
      continue;
    }
    if (fence) continue;
    let pipes = 0;
    for (let k = start; k < end; k++) {
      const c = story.charCodeAt(k);
      if (isDelimiter(c)) paragraph++;
      else if (c === 0x7c) pipes++; // |
    }
    if (paragraph > PARAGRAPH_DELIMITER_LIMIT) return true;
    if (pipes > columns) columns = pipes;
    rows++;
    if (columns > 0 && (columns + 1) * rows > TABLE_CELL_LIMIT) return true;
  }
  return endParagraph();
}
