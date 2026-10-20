import { Fragment } from 'react';
import { LATIN_MARK_CLASS, splitLatinMarks } from '@/lib/markdown/rehypeLatinMarks';

/** Where a CJK title may break between clauses: just after its full-width stops and pauses. */
const CLAUSE_END = /(?<=[，、；：。！？…—）」』》])/u;

/** A clause's words, each apostrophe inside a Latin word (don’t) set apart for `.story-latin-mark`. */
function Marked({ text }: { text: string }) {
  const parts = splitLatinMarks(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.mark ? (
          <span key={i} className={LATIN_MARK_CLASS}>
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * A CJK story's title, its clauses kept whole: Chinese breaks between any two
 * characters, so a balanced title wrapped mid-phrase (「湖中央，我看／見了知行合一」).
 * Each clause after the first stop is its own `.story-clause` (an inline
 * block, story.css), so a title too long for one line breaks after its
 * punctuation (「湖中央，／我看見了知行合一」); a clause longer than the line
 * still wraps inside itself. Apostrophes inside Latin words are set apart for
 * story.css's `.story-latin-mark`, as the reader's rehype plugin
 * (lib/markdown/rehypeLatinMarks) does in the story. A title of one clause
 * renders as it is.
 */
export function LatinMarkText({ text }: { text: string }) {
  const clauses = text.split(CLAUSE_END).filter(Boolean);
  if (clauses.length < 2) return <Marked text={text} />;
  return (
    <>
      {clauses.map((clause, i) => (
        <span key={i} className="story-clause">
          <Marked text={clause} />
        </span>
      ))}
    </>
  );
}
