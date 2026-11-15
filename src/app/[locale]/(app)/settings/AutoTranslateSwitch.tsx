'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/atoms/Field/Field';
import { ToggleSwitch } from '@/components/atoms/ToggleSwitch/ToggleSwitch';
import styles from './SettingsClient.module.css';

/**
 * Settings → 語言 → 自動翻譯 (round 25 §F4): stories in another language than the interface — their titles and
 * excerpts in the feeds too — shown translated by AI. Off by default, kept in this browser beside the display tweaks
 * (no account field). A field as 小紙團's: the label over it, the hint at its start, the switch at its end.
 */
export function AutoTranslateSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations('settings.language');
  const id = useId();
  return (
    <Field label={t('autoTranslateStories')} labelId={`${id}-label`}>
      <div className={styles.switchRow}>
        <p id={`${id}-hint`} className={styles.switchHint}>
          {t('autoTranslateStoriesHint')}
        </p>
        <ToggleSwitch checked={on} onChange={() => onChange(!on)} ariaLabel={t('autoTranslateStories')} describedBy={`${id}-hint`} seed={67} />
      </div>
    </Field>
  );
}
