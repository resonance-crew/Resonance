import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { netFaults, webFlowsToRun, widthsFor } from './webFlows';
import { firestoreKind, listenTargets, type NetLog } from './webflows/kit';
import { WEB_FLOWS } from './webflows/index';

const FLOWS = [{ name: 'live-message' }, { name: 'bell' }, { name: 'bookmark' }];

describe('which web flows a run takes', () => {
  it('takes every flow in the registry’s order, and --only narrows them keeping that order', () => {
    expect(webFlowsToRun([], FLOWS)).toEqual(['live-message', 'bell', 'bookmark']);
    expect(webFlowsToRun(['bookmark', 'live-message'], FLOWS)).toEqual(['live-message', 'bookmark']);
  });

  it('refuses a name no flow has, naming the ones there are', () => {
    expect(() => webFlowsToRun(['bel'], FLOWS)).toThrow(/No such web flow: bel \(have live-message, bell, bookmark\)/);
    expect(() => webFlowsToRun(['bell', 'nope'], FLOWS)).toThrow(/nope/);
  });

  it('has every flow file of scripts/visual/webflows registered once, under its file’s name', () => {
    const files = readdirSync(join(__dirname, 'webflows'))
      .filter((f) => f.endsWith('.ts') && !['index.ts', 'kit.ts'].includes(f))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const names = WEB_FLOWS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(files);
    for (const f of WEB_FLOWS) expect(f.proves.length).toBeGreaterThan(20);
  });
});

describe('--width', () => {
  it('runs the captures’ desktop and phone sizes, desktop first, by default and for both', () => {
    for (const arg of [undefined, 'both']) {
      expect(widthsFor(arg).map((d) => [d.id, d.width, d.height, d.phone])).toEqual([
        ['desktop', 1440, 900, false],
        ['phone', 390, 844, true],
      ]);
    }
  });

  it('takes one of them alone, and refuses anything else', () => {
    expect(widthsFor('phone').map((d) => d.id)).toEqual(['phone']);
    expect(widthsFor('desktop').map((d) => d.id)).toEqual(['desktop']);
    expect(() => widthsFor('tablet')).toThrow(/--width takes desktop, phone or both, not "tablet"/);
  });
});

describe('the Firestore requests a page makes', () => {
  const base = 'http://127.0.0.1:8480';
  it('tells writes, reads and listens apart', () => {
    expect(firestoreKind('POST', `${base}/google.firestore.v1.Firestore/Listen/channel?VER=8&RID=1`)).toBe('listen');
    expect(firestoreKind('POST', `${base}/google.firestore.v1.Firestore/Write/channel?VER=8`)).toBe('write');
    expect(firestoreKind('POST', `${base}/v1/projects/demo-resonance/databases/(default)/documents:commit`)).toBe('write');
    expect(firestoreKind('PATCH', `${base}/v1/projects/demo-resonance/databases/(default)/documents/cards/x`)).toBe('write');
    expect(firestoreKind('POST', `${base}/v1/projects/demo-resonance/databases/(default)/documents:runQuery`)).toBe('read');
    expect(firestoreKind('POST', `${base}/v1/projects/demo-resonance/databases/(default)/documents:batchGet`)).toBe('read');
    expect(firestoreKind('GET', `${base}/v1/projects/demo-resonance/databases/(default)/documents/cards/x`)).toBe('read');
    expect(firestoreKind('GET', `${base}/emulator/v1/projects/demo-resonance`)).toBeNull();
  });

  it('reads what a listen follows and what a read names from the body', () => {
    const listen = `count=1&ofs=0&req0___data__=${encodeURIComponent(
      JSON.stringify({ addTarget: { documents: { documents: ['projects/demo-resonance/databases/(default)/documents/signals/alice'] }, targetId: 2 } }),
    )}`;
    expect(listenTargets(listen)).toEqual(['signals/alice']);
    const query = JSON.stringify({ parent: 'projects/demo-resonance/databases/(default)/documents', structuredQuery: { from: [{ collectionId: 'cards' }] } });
    expect(listenTargets(query)).toEqual(['collection:cards']);
    expect(listenTargets(null)).toEqual([]);
  });
});

describe('what fails a flow whatever it asserted', () => {
  const clean = (): Pick<NetLog, 'api' | 'firestore' | 'pageErrors'> => ({
    api: [{ method: 'GET', path: '/api/v1/me', status: 200, body: null, at: 0 }],
    firestore: [{ kind: 'listen', method: 'POST', what: '/Listen/channel', targets: ['signals/alice'], at: 0 }, { kind: 'read', method: 'POST', what: ':batchGet', targets: ['cards/x'], at: 0 }],
    pageErrors: [],
  });

  it('passes the viewer’s own signals listen and reads still on Firestore', () => {
    expect(netFaults(clean(), 'alice')).toEqual([]);
  });

  it('fails a Firestore write, a listen on anything else, a 5xx and an uncaught exception', () => {
    const net = clean();
    net.firestore.push({ kind: 'write', method: 'POST', what: '/documents:commit', targets: ['cards/x'], at: 0 });
    net.firestore.push({ kind: 'listen', method: 'POST', what: '/Listen/channel', targets: ['conversations/alice_bob/messages'], at: 0 });
    net.api.push({ method: 'POST', path: '/api/v1/messages', status: 503, body: null, at: 0 });
    net.pageErrors.push('TypeError: x is undefined');
    const faults = netFaults(net, 'alice');
    expect(faults).toHaveLength(4);
    expect(faults[0]).toMatch(/Firestore write from the page: POST \/documents:commit \(cards\/x\)/);
    expect(faults[1]).toMatch(/listen on conversations\/alice_bob\/messages/);
    expect(faults[2]).toBe('POST /api/v1/messages answered 503');
    expect(faults[3]).toMatch(/uncaught in the page: TypeError/);
  });

  it('counts someone else’s signals as a listen on something else', () => {
    const net = clean();
    net.firestore[0].targets = ['signals/bob'];
    expect(netFaults(net, 'alice')).toHaveLength(1);
  });
});
