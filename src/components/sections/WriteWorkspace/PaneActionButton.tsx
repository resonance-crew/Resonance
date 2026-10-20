'use client';

import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import type { PrimaryAction } from '@/components/molecules/CardEditor/CardEditor';

/**
 * The editor's one way forward (下一步), drawn where its host puts it: at the
 * end of the writer's bar or the pane's header row, or floating at the
 * pane's top-right at the split — the verb's solid pill, small.
 */
export function PaneActionButton({ action }: { action: PrimaryAction }) {
  return (
    <OrganicButton variant="solid" size="sm" disabled={action.disabled} loading={action.loading} onClick={action.onPress}>
      {action.label}
    </OrganicButton>
  );
}
