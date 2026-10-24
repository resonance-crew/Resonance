'use client';

import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import type { PrimaryAction } from '@/components/molecules/CardEditor/CardEditor';

/**
 * The editor's one way forward (✓ 完成, round 8 §2.1), drawn where its host
 * puts it: at the end of the writer's bar or the pane's header row, or
 * floating at the pane's top-right at the split — a glyph on the bar's paper,
 * as the app header's own entries are, its name its tooltip; the small pen
 * loader in its place while a new card's first save runs.
 */
export function PaneActionButton({ action }: { action: PrimaryAction }) {
  return (
    <BareIconButton
      icon="check"
      label={action.label}
      tone="ink"
      iconSize={22}
      tip="below"
      tipAlign="end"
      seed={19}
      disabled={action.disabled}
      loading={action.loading}
      onClick={action.onPress}
    />
  );
}
