import { describeSessionStoreContract } from '@/server/contract/sessions.contract';
import { memorySessionStore } from './sessions';

let n = 0;
describeSessionStoreContract('memory', async () => ({ store: memorySessionStore(), uid: `u${++n}` }));
