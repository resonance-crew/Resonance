/**
 * The landing page's paper puppets (engine.ts says how the stage behaves; types.ts what it is told and answers).
 */
export { createStage, DEFAULT_OPTIONS } from './engine';
export { readManifest } from './rig';
export { pathY } from './geometry';
export { ACT_STANCE, isActName } from './acts';
export type {
  ActName, BehindCover, CastEntry, Cover, EdgeLedge, How, Ink, Ledge, LineLedge, Manifest, MeetVariant, PeekLedge, Point,
  PuppetMode, Rect, RevealInfo, RigPart, Side, SpotLedge, StageAct, StageApi, StageClock, StageEnv, StageEvent,
  StageEventDetail, StageOptions, StageSettings, StageStats, Theme, Traits, VisitorInfo, VisitRequest, Zone,
} from './types';
