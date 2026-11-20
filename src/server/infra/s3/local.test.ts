import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { describeObjectStoreContract, describePrivateObjectStoreContract } from '@/server/contract/objects.contract';
import { LocalChatImages, LocalStorageProvider } from './local';

// The emulators' folders keep the same contract as memory (and, for what R2's
// fake can show, R2: src/lib/storage/r2.test.ts).

const roots: string[] = [];
const fresh = async () => {
  const root = await mkdtemp(join(tmpdir(), 'local-objects-contract-'));
  roots.push(root);
  return root;
};

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describeObjectStoreContract('local folder', async (pageKeys) => new LocalStorageProvider(await fresh(), 'http://localhost:3100/api/emulator-storage', pageKeys));
describePrivateObjectStoreContract('local folder', async () => new LocalChatImages(await fresh()));
