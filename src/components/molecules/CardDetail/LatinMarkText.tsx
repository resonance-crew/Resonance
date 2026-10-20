import { Fragment } from 'react';
import { LATIN_MARK_CLASS, splitLatinMarks } from '@/lib/markdown/rehypeLatinMarks';

/**
 * A CJK story's title with each apostrophe inside a Latin word (don’t) set
 * apart for story.css's `.story-latin-mark` — the reader's rehype plugin
 * (lib/markdown/rehypeLatinMarks) does the same to the story. A text with
 * none renders as it is.
 */
export function LatinMarkText({ text }: { text: string }) {
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
