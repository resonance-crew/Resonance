import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LockBusy, acquire, busyMessage, resourcesFor } from './lock';

const dirs: string[] = [];
const freshDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'visual-lock-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const at = new Date('2026-11-13T04:00:00Z');
const as = (pid: number, dir: string, alive: (pid: number) => boolean = () => true) => ({
  dir,
  pid,
  alive,
  now: () => at,
  cwd: `/work/${pid}`,
  command: `visual capture (${pid})`,
  log: () => {},
});

describe('resourcesFor', () => {
  it('locks the device platforms and the stack’s three ports, never the web’s browser', () => {
    expect(resourcesFor(['web', 'android', 'ios'], { auth: 9299, firestore: 8280, dev: 3150 })).toEqual(['android', 'ios', 'port-3150', 'port-8280', 'port-9299']);
    // A web slice on private ports locks only those ports: two web slices on different ports run side by side.
    expect(resourcesFor(['web'], { auth: 9499, firestore: 8480, dev: 3350 })).toEqual(['port-3350', 'port-8480', 'port-9499']);
    // On someone else's stack (--no-stack) only the devices.
    expect(resourcesFor(['mac'], null)).toEqual(['mac']);
  });
});

describe('acquire', () => {
  it('refuses a second run on the same devices, naming who holds them and how to queue', async () => {
    const dir = freshDir();
    const first = await acquire(['android', 'port-3150'], as(111, dir));
    const refused = acquire(['ios', 'android'], as(222, dir));
    await expect(refused).rejects.toBeInstanceOf(LockBusy);
    const error = (await refused.catch((e) => e)) as LockBusy;
    expect(error.resource).toBe('android');
    expect(error.message).toContain('pid 111');
    expect(error.message).toContain('visual capture (111)');
    expect(error.message).toContain('/work/111');
    expect(error.message).toContain('--wait');
    // All or none: the refused run kept nothing it took on the way (ios comes before nothing, android is first).
    expect(existsSync(join(dir, 'ios.lock'))).toBe(false);
    first.release();
    expect(existsSync(join(dir, 'android.lock'))).toBe(false);
  });

  it('lets runs on other devices and other ports go side by side', async () => {
    const dir = freshDir();
    const a = await acquire(['android', 'port-3150'], as(111, dir));
    const b = await acquire(['ios', 'port-3350'], as(222, dir));
    expect(a.resources).toEqual(['android', 'port-3150']);
    expect(b.resources).toEqual(['ios', 'port-3350']);
  });

  it('takes over a lock whose holder is gone (a run killed outright)', async () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'ios.lock'), JSON.stringify({ pid: 999, startedAt: at.toISOString(), cwd: '/x', command: 'old' }));
    const lock = await acquire(['ios'], as(222, dir, (pid) => pid !== 999));
    expect(JSON.parse(readFileSync(join(dir, 'ios.lock'), 'utf8')).pid).toBe(222);
    lock.release();
  });

  it('is the same run’s again when its own pid holds it (the flows inside a capture)', async () => {
    const dir = freshDir();
    await acquire(['android'], as(111, dir));
    await expect(acquire(['android'], as(111, dir))).resolves.toBeTruthy();
  });

  it('queues with --wait: says once what it waits for, and starts when the other run is done', async () => {
    const dir = freshDir();
    const first = await acquire(['ios'], as(111, dir));
    const said: string[] = [];
    let naps = 0;
    const second = acquire(['ios'], {
      ...as(222, dir),
      wait: true,
      log: (line) => said.push(line),
      sleep: async () => {
        if (++naps === 3) first.release();
      },
    });
    const lock = await second;
    expect(lock.resources).toEqual(['ios']);
    expect(naps).toBe(3);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/waiting for ios, held by pid 111.*queued behind it/);
  });

  it('never releases a lock someone else took over', async () => {
    const dir = freshDir();
    const mine = await acquire(['mac'], as(111, dir));
    writeFileSync(join(dir, 'mac.lock'), JSON.stringify({ pid: 333, startedAt: at.toISOString(), cwd: '/y', command: 'other' }));
    mine.release();
    expect(JSON.parse(readFileSync(join(dir, 'mac.lock'), 'utf8')).pid).toBe(333);
  });
});

describe('busyMessage', () => {
  it('says a port is a stack’s, and how long the other run has had it', () => {
    const text = busyMessage('port-3150', { pid: 7, startedAt: '2026-11-13T03:46:00.000Z', cwd: '/w', command: 'visual capture web' }, at);
    expect(text).toContain('port 3150 (a visual stack)');
    expect(text).toContain('(14 min)');
    expect(text).toContain('VISUAL_DEV_PORT');
  });
});
