import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classify, parseCompressed, parsePs, parseSwap, phaseLine, startSampler, summarize, type Sample } from './resources';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const PS = `
    1     0   12000   0.0 /sbin/launchd
  100     1  200000  12.5 node /x/node_modules/.bin/tsx scripts/visual/run.ts capture ios
  101   100  900000  30.0 node /x/node_modules/.bin/next dev --hostname localhost --port 3150
  102   101 1500000  80.0 /usr/local/bin/node /x/node_modules/next/dist/server/lib/start-server.js
  103   100  100000   1.0 node /usr/local/bin/firebase emulators:start --only auth,firestore
  104   103  700000   5.0 /usr/bin/java -Xmx1g -jar /Users/u/.cache/firebase/emulators/cloud-firestore-emulator-v1.19.jar --port 8280
  105   100  400000  50.0 /x/ms-playwright/chromium_headless_shell-1200/chrome-mac/headless_shell --headless
  106   100 3500000 150.0 /Users/u/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd visual-phone -port 5600
  107   100  800000  90.0 /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -project Resonance.xcodeproj
  108   107  300000  95.0 /Applications/Xcode.app/…/swift-frontend -frontend -c Feed.swift
  109   100  150000   3.0 node /opt/homebrew/bin/agy -p You are reviewing … the next screen … Chromium … gradle
  110   109  220000   1.0 /Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java -classpath /Users/u/.maestro/lib/* maestro.cli.AppKt mcp
  111   109  900000  20.0 /Applications/Antigravity.app/Contents/Resources/bin/language_server --stdio
  200     1  600000   2.0 /Library/Developer/CoreSimulator/Volumes/iOS/…/SpringBoard.app/SpringBoard -- /Users/u/Library/Developer/CoreSimulator/Devices/459A5F8B-784E-4D04-A742-0A85F28363C2/data
  201     1  500000   2.0 /Library/…/SpringBoard -- /Users/u/Library/Developer/CoreSimulator/Devices/11111111-2222-3333-4444-555555555555/data
  202     1  300000   4.0 /Users/u/Resonance/apps/ios/build/visual-mac/Build/Products/Debug-maccatalyst/Resonance.app/Contents/MacOS/Resonance -emulator YES
  203     1 4000000   0.0 /Applications/Android Studio.app/…/java -cp gradle-launcher.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 8.14
  204     1 2300000 400.0 /Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java -Xmx2g com.intellij.idea.Main
`;

describe('what a run costs, by part', () => {
  it('tells the run’s own parts apart, its simulators and Mac app beside them, the machine’s build daemons said apart, nobody else’s counted', () => {
    const groups = classify(parsePs(PS), 100, { '459A5F8B-784E-4D04-A742-0A85F28363C2': 'Visual iPhone' });
    expect(Object.keys(groups).sort()).toEqual(
      ['agy', 'android-emulator', 'chromium', 'firebase-cli', 'firestore-emulator', 'harness', 'mac-app', 'machine:gradle-daemons', 'next', 'sim:Visual iPhone', 'xcodebuild'].sort(),
    );
    // agy with its own helpers (a Maestro MCP server, its language server), whatever words its prompt carries.
    expect(groups.agy).toEqual({ rssMb: Math.round(1_270_000 / 1024), cpu: 24, n: 3 });
    // A compile under the build is the build's.
    expect(groups.xcodebuild.n).toBe(2);
    expect(groups.harness.n).toBe(1);
    expect(groups.next).toEqual({ rssMb: Math.round(2_400_000 / 1024), cpu: 110, n: 2 });
    expect(groups['firestore-emulator'].rssMb).toBe(Math.round(700_000 / 1024));
    expect(groups['sim:Visual iPhone'].n).toBe(1);
    // Another session's simulator and Android Studio are not the run's, nor said.
    expect(JSON.stringify(groups)).not.toContain('idea');
  });

  it('reads the machine’s swap and compressed memory as sysctl and vm_stat give them', () => {
    expect(parseSwap('total = 5120.00M  used = 3613.38M  free = 1506.62M  (encrypted)')).toBe(3613);
    expect(parseSwap('total = 10.00G  used = 1.50G  free = 8.50G')).toBe(1536);
    expect(parseSwap('')).toBeNull();
    expect(parseCompressed('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages occupied by compressor:                 466640.\n')).toBe(7291);
  });

  it('gives each phase its peaks and swap, and the whole run’s, and says them in a line', () => {
    const sample = (t: number, phase: string, next: number, swapMb: number, freePct: number, daemons = 0): Sample => {
      const groups: Sample['groups'] = { next: { rssMb: next, cpu: 50, n: 1 }, harness: { rssMb: 200, cpu: 10, n: 1 } };
      if (daemons) groups['machine:gradle-daemons'] = { rssMb: daemons, cpu: 0, n: 1 };
      return { t, phase, freePct, swapMb, compressedMb: 1000, load1: 3, groups, runMb: next + 200 };
    };
    const summary = summarize([sample(0, 'stack', 500, 3000, 60), sample(5, 'web+mac', 2000, 3100, 50, 4000), sample(10, 'web+mac', 1500, 3400, 40)]);
    expect(summary.map((s) => s.phase)).toEqual(['stack', 'web+mac', 'all']);
    const web = summary[1];
    expect(web).toMatchObject({ seconds: 5, peakRunMb: 2200, swapMb: { start: 3100, max: 3400, end: 3400 }, minFreePct: 40 });
    expect(web.peakByGroup).toEqual({ next: 2000, harness: 200, 'machine:gradle-daemons': 4000 });
    expect(summary[2].swapMb).toEqual({ start: 3000, max: 3400, end: 3400 });
    expect(phaseLine(web)).toBe(
      "Resources (web+mac, 5 s): the run's peak 2.1 GB (next 2.0 GB, harness 0.2 GB); machine's build daemons gradle-daemons 3.9 GB · swap 3.0 GB → max 3.3 GB · free ≥ 40 %",
    );
  });

  it('samples this process as it runs, by phase, into the run’s folder, and says each phase as it ends', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'visual-resources-'));
    dirs.push(runDir);
    const lines: string[] = [];
    const sampler = startSampler(runDir, { log: (l) => lines.push(l), everyMs: 40 });
    await new Promise((r) => setTimeout(r, 120));
    sampler.mark('web+mac');
    await new Promise((r) => setTimeout(r, 120));
    const summary = await sampler.stop();
    const samples = readFileSync(join(runDir, '_resources.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Sample);
    expect(new Set(samples.map((s) => s.phase))).toEqual(new Set(['stack', 'web+mac']));
    expect(samples[0].groups.harness.rssMb).toBeGreaterThan(10);
    expect(samples[0].swapMb).not.toBeNull();
    expect(existsSync(join(runDir, '_resources.json'))).toBe(true);
    expect(summary.map((s) => s.phase)).toEqual(['stack', 'web+mac', 'all']);
    expect(lines[0]).toMatch(/^Resources \(stack, /);
    expect(lines.at(-1)).toMatch(/^Resources \(whole run, /);
  });

  it('two marks close together each give their own phase its name (the ios line said twice, compare never: run 20261123-101910)', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'visual-resources-'));
    dirs.push(runDir);
    const lines: string[] = [];
    const sampler = startSampler(runDir, { log: (l) => lines.push(l), everyMs: 10_000, phase: 'ios' });
    sampler.mark('compare');
    sampler.mark('review');
    await sampler.stop();
    expect(lines.map((l) => /^Resources \(([^,]+),/.exec(l)?.[1])).toEqual(['ios', 'compare', 'review', 'whole run']);
  });

  it('samples nothing when turned off (VISUAL_SAMPLE_S=0)', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'visual-resources-'));
    dirs.push(runDir);
    const sampler = startSampler(runDir, { log: () => {}, everyMs: 0 });
    sampler.mark('web');
    expect(await sampler.stop()).toEqual([]);
    expect(existsSync(join(runDir, '_resources.jsonl'))).toBe(false);
  });
});
