import type { RealtimePublisher } from '@/server/ports/realtime';

/** Phase 1: nothing listens yet. Phase 2 replaces it with the `signals/{uid}` adapter. */
export const noopRealtime: RealtimePublisher = {
  touch: async () => {},
};
