'use client';

import { useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/atoms/Field/Field';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import { MascotsStrip } from './MascotsStrip';
import styles from './SettingsClient.module.css';

/**
 * Settings → 外觀 → 小精靈: the paper puppets now and then on the home feed and a card's page (round 19), off until
 * turned on — this browser's choice, kept with the other display tweaks. A field as the section's others are: its
 * label over it, the hint at its start and the switch at its end; under it a strip where one naps while it is off
 * and they come and go while it is on (round 20: what 小精靈 means, plain to see).
 */
export function MascotsSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations('tweaks');
  const id = useId();
  const row = useRef<HTMLDivElement>(null);
  return (
    <Field label={t('mascots')} labelId={`${id}-label`}>
      <div ref={row} className={styles.switchRow}>
        <p id={`${id}-hint`} className={styles.switchHint}>
          {t('mascotsHint')}
        </p>
        <ToggleSwitch checked={on} onChange={() => onChange(!on)} ariaLabel={t('mascots')} describedBy={`${id}-hint`} seed={97} />
      </div>
      <MascotsStrip on={on} row={row} />
    </Field>
  );
}
