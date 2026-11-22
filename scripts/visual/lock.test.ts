import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LockBusy, acquire, busyMessage, resourcesFor, stale } from './lock';

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

describe('the beat (a stuck holder)', () => {
  const holderFile = (dir: string, resource: string) => JSON.parse(readFileSync(join(dir, `${resource}.lock`), 'utf8'));

  it('writes its beat into every file it holds, and keeps who it is', async () => {
    const dir = freshDir();
    let now = at;
    const lock = await acquire(['ios', 'port-3150'], { ...as(111, dir), now: () => now, heartbeatMs: 0 });
    expect(holderFile(dir, 'ios').heartbeatAt).toBe(at.toISOString());
    now = new Date(at.getTime() + 60_000);
    lock.beat!();
    for (const r of ['ios', 'port-3150']) expect(holderFile(dir, r)).toMatchObject({ pid: 111, command: 'visual capture (111)', heartbeatAt: now.toISOString() });
    lock.release();
  });

  it('beats on its own timer while it holds the lock, and stops once released', async () => {
    const dir = freshDir();
    let tick = 0;
    const lock = await acquire(['android'], { ...as(111, dir), now: () => new Date(at.getTime() + ++tick * 1000), heartbeatMs: 5 });
    const first = holderFile(dir, 'android').heartbeatAt;
    await new Promise((r) => setTimeout(r, 40));
    expect(holderFile(dir, 'android').heartbeatAt > first).toBe(true);
    lock.release();
    expect(existsSync(join(dir, 'android.lock'))).toBe(false);
  });

  it('takes over a live holder whose beat stopped (stuck), says so, and never touches the process', async () => {
    const dir = freshDir();
    const old = new Date(at.getTime() - 11 * 60_000).toISOString();
    writeFileSync(join(dir, 'ios.lock'), JSON.stringify({ pid: 999, startedAt: old, cwd: '/r30', command: 'visual capture ios', heartbeatAt: old }));
    const said: string[] = [];
    const lock = await acquire(['ios'], { ...as(222, dir), log: (l) => said.push(l), heartbeatMs: 0 });
    expect(holderFile(dir, 'ios').pid).toBe(222);
    expect(said.join('\n')).toMatch(/pid 999.*stuck, so its lock is taken over.*left running/);
    lock.release();
  });

  it('leaves a live holder whose beat is recent, and an older harness’s lock without a beat, to their pid', async () => {
    const dir = freshDir();
    const recent = new Date(at.getTime() - 2 * 60_000).toISOString();
    writeFileSync(join(dir, 'ios.lock'), JSON.stringify({ pid: 999, startedAt: recent, cwd: '/a', command: 'a', heartbeatAt: recent }));
    await expect(acquire(['ios'], { ...as(222, dir), heartbeatMs: 0 })).rejects.toBeInstanceOf(LockBusy);
    const longAgo = new Date(at.getTime() - 3 * 3600_000).toISOString();
    writeFileSync(join(dir, 'mac.lock'), JSON.stringify({ pid: 998, startedAt: longAgo, cwd: '/b', command: 'b' }));
    await expect(acquire(['mac'], { ...as(222, dir), heartbeatMs: 0 })).rejects.toBeInstanceOf(LockBusy);
  });

  it('says when another run took its lock over, so the run can stop', async () => {
    const dir = freshDir();
    const lost: [string, number | undefined][] = [];
    const lock = await acquire(['mac'], { ...as(111, dir), heartbeatMs: 0, onLost: (r, h) => lost.push([r, h?.pid]) });
    writeFileSync(join(dir, 'mac.lock'), JSON.stringify({ pid: 333, startedAt: at.toISOString(), cwd: '/y', command: 'other', heartbeatAt: at.toISOString() }));
    lock.beat!();
    expect(lost).toEqual([['mac', 333]]);
    // It no longer beats into the other run's file, nor removes it.
    expect(holderFile(dir, 'mac').pid).toBe(333);
    lock.release();
    expect(holderFile(dir, 'mac').pid).toBe(333);
  });

  it('judges staleness by the beat alone', () => {
    const h = { pid: 1, startedAt: at.toISOString(), cwd: '/', command: 'c' };
    expect(stale(h, at, 1000)).toBe(false);
    expect(stale({ ...h, heartbeatAt: new Date(at.getTime() - 2000).toISOString() }, at, 1000)).toBe(true);
    expect(stale({ ...h, heartbeatAt: new Date(at.getTime() - 500).toISOString() }, at, 1000)).toBe(false);
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
