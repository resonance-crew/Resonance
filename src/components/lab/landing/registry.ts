/**
 * The landing prototypes (branch landing-lab only — never merged as is). Each lives in its own folder,
 * `src/components/lab/landing/<id>/`, and exports a default page component taking LabLandingProps.
 * Each has its own route, /[locale]/lab/landing/<id> (src/app/[locale]/lab/landing/<id>/page.tsx), which imports only
 * that prototype — so one prototype that fails to compile never takes the others down.
 */
export interface LabVariant {
  id: string;
  name: string;
  pitch: string;
}

export const LAB_VARIANTS: LabVariant[] = [
  { id: 'answer', name: 'A · 換你說 Your Turn', pitch: '你自己回應一個真實的故事：點一句開頭、按回應，看它變成一張連著那個故事的卡片' },
  { id: 'issue', name: 'B · 對頁 Facing Pages', pitch: '今天的一期文學小誌：真實的故事用大字排出來，一個故事對著回應它的故事，小紙團是編輯部' },
  { id: 'oneday', name: 'C · 一天的戲 One Day', pitch: '整頁從早晨演到晚安：小紙團站在每段的地板上，三幕演出「用故事回應故事」，最後在悄悄的夜空下謝幕' },
];
