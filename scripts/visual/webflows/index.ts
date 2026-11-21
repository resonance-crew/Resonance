/** The web flows, in the order a run takes them (webFlows.ts). A new flow joins here. */
import { bell } from './bell';
import { blockPerson } from './block-person';
import { bookmark } from './bookmark';
import { editPublished } from './edit-published';
import type { WebFlow } from './kit';
import { liveMessage } from './live-message';
import { thoughtMap } from './thought-map';
import { writeDraft } from './write-draft';

export const WEB_FLOWS: readonly WebFlow[] = [liveMessage, bell, blockPerson, writeDraft, editPublished, thoughtMap, bookmark];
