import type { DriveMode } from './drive';

/** What the film's cards need of the runtime: the drive's mode and hand-back, and the scheduled resume's off. */
export interface CardHands {
  drive: { readonly mode: DriveMode; handBack(): void };
  /** The film is not to play on after this (as ❚❚): clears a resume the wheel, a finger or a key scheduled. */
  stopResume(): void;
}

const onCard = (e: Event) => !!(e.target as Element | null)?.closest?.('[data-film-card]');

/**
 * The visitor's hand on a card while the film plays (round 25 §B — the owner: 「只有使用者滑鼠点下去的时候才会触发事件，
 * 其他时候都不要停止播放动画」). A mouse merely moving over a card changes nothing; its primary button pressed on one
 * hands the page back at once, as ❚❚ does (it doesn't play on by itself), so the click lands on the card pressed. A
 * finger is the touch handlers' (a scroll that skips ahead); the keyboard's `:focus-visible` on a card hands back
 * too. Returns the way to stop listening.
 */
export function watchCardHands(stage: HTMLElement, hands: CardHands): () => void {
  const takeBack = () => {
    hands.stopResume();
    if (hands.drive.mode === 'play') hands.drive.handBack();
  };
  const onPress = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (onCard(e)) takeBack();
  };
  const onFocus = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (onCard(e) && t?.matches?.(':focus-visible')) takeBack();
  };
  stage.addEventListener('pointerdown', onPress);
  stage.addEventListener('focusin', onFocus);
  return () => {
    stage.removeEventListener('pointerdown', onPress);
    stage.removeEventListener('focusin', onFocus);
  };
}
