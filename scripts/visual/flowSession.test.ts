import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BEFORE_JS, hookServer, parseJunit, sessionConfig, withHook, writeSessionFlows } from './flowSession';

const FLOWS = join(process.cwd(), 'maestro/flows');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const HOOK = (flow: string) => `  - runScript:\n      file: before.js\n      env:\n        FLOW: ${flow}\n`;
const cut = (text: string) => text.search(/^---\s*$/m);

describe('a session’s copy of a flow', () => {
  it('starts every repository flow with the runner’s hook, its own name passed, the rest of the flow untouched', () => {
    for (const file of readdirSync(FLOWS).filter((f) => f.endsWith('.yaml'))) {
      const flow = file.replace(/\.yaml$/, '');
      const text = readFileSync(join(FLOWS, file), 'utf8');
      const hooked = withHook(text, flow);
      // The header gains `onFlowStart:` and the hook, at its end (no flow has one yet), and nothing else changes:
      // draft-offline's onFlowComplete stays, and the steps are the same byte for byte.
      expect(text.slice(0, cut(text))).not.toMatch(/^onFlowStart:/m);
      const header = text.slice(0, cut(text));
      expect(hooked, flow).toBe(`${header}${header.endsWith('\n') ? '' : '\n'}onFlowStart:\n${HOOK(flow)}${text.slice(cut(text))}`);
      expect(hooked.slice(cut(hooked))).toBe(text.slice(cut(text)));
    }
  });

  it('puts the hook first in an onFlowStart the flow has already', () => {
    const text = 'appId: x\nname: f\nonFlowStart:\n  - runScript: mine.js\n---\n- launchApp\n';
    expect(withHook(text, 'f')).toBe(`appId: x\nname: f\nonFlowStart:\n${HOOK('f')}  - runScript: mine.js\n---\n- launchApp\n`);
    expect(() => withHook('- launchApp\n', 'f')).toThrow(/no header/);
  });

  it('writes the copies beside copies of common/ and assets/ (Maestro follows no link out of its workspace) and the hook script', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'visual-session-')), 'flows');
    dirs.push(join(dir, '..'));
    const files = writeSessionFlows(dir, FLOWS, ['tap', 'send-picture']);
    expect(files).toEqual([join(dir, 'tap.yaml'), join(dir, 'send-picture.yaml')]);
    expect(lstatSync(join(dir, 'common')).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(dir, 'assets/paper.png')).isFile()).toBe(true);
    expect(existsSync(join(dir, 'common/launch.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'assets/paper.png'))).toBe(true);
    expect(readFileSync(join(dir, 'before.js'), 'utf8')).toBe(BEFORE_JS);
    // The folder runs its own flows, in this order, a failure stopping nothing.
    expect(readFileSync(join(dir, 'config.yaml'), 'utf8')).toBe(sessionConfig(['tap', 'send-picture']));
    expect(sessionConfig(['tap', 'send-picture'])).toBe('flows:\n  - "*"\nexecutionOrder:\n  continueOnFailure: true\n  flowsOrder:\n    - tap\n    - send-picture\n');
  });
});

describe('the session’s report', () => {
  it('gives each flow its verdict and time from Maestro’s JUnit', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites><testsuite name="Test Suite" device="emulator-5600" tests="3" failures="1">
<testcase id="tap" name="tap" classname="tap" time="19.4" status="SUCCESS"/>
<testcase id="leave-note" name="leave-note" classname="leave-note" time="22.0" status="ERROR"><failure>Element not found</failure></testcase>
<testcase id="sign-in" name="sign-in" classname="sign-in" time="8" status="SUCCESS"></testcase>
</testsuite></testsuites>`;
    expect(parseJunit(xml)).toEqual([
      { flow: 'tap', passed: true, seconds: 19 },
      { flow: 'leave-note', passed: false, seconds: 22 },
      { flow: 'sign-in', passed: true, seconds: 8 },
    ]);
  });
});

describe('the runner’s hook', () => {
  it('readies each flow in turn, one at a time, and says no — failing that flow — when it can’t', async () => {
    const seen: string[] = [];
    let running = 0;
    const hook = await hookServer(async (flow) => {
      running++;
      expect(running).toBe(1);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      if (flow === 'bad') throw new Error('the seed failed twice');
      seen.push(flow);
    });
    try {
      const ask = (flow: string) => fetch(`${hook.url}/before?flow=${flow}`, { method: 'POST' });
      const [a, b, bad] = await Promise.all([ask('tap'), ask('leave-note'), ask('bad')]);
      expect([a.status, b.status, bad.status]).toEqual([200, 200, 500]);
      expect(await bad.text()).toBe('the seed failed twice');
      expect(seen).toEqual(['tap', 'leave-note']);
      expect((await fetch(`${hook.url}/other`)).status).toBe(404);
    } finally {
      await hook.close();
    }
  });
});
