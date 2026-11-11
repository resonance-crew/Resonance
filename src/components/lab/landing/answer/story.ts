/** A real card as prototype A draws it: plain text only (no story markdown reaches the client), an anonymous one without its author. */
export interface LabStory {
  id: string;
  /** Its card page (an anonymous card by its id). */
  href: string;
  title: string;
  /** The opening, plain text, cut where a reader would pause. */
  opening: string;
  /** Characters of plain text in the whole story (the featured pick's rule). */
  long: number;
  /** The author's pen name; null for an anonymous card. */
  author: string | null;
  minutes: number;
  script: 'cjk' | 'latin';
  lang?: string;
  /** Its colour family (cardPalettes: no neighbour shares it). */
  palette: number;
  cover?: string;
}
