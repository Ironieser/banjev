import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/lib/core.js');
const papers = JSON.parse(readFileSync(new URL('../data/papers.json', import.meta.url))).papers;
const idx = (settings) => core.buildIndex(papers, settings);

test('snapshot contains the papers from the screenshot', () => {
  const ids = papers.map((p) => p.id);
  for (const id of ['2609.26758', '2609.26550', '2609.26532', '2609.25845', '2609.24965', '2609.24395', '2609.24052', '2609.23986']) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(papers.every((p) => p.published >= core.JEV_EPOCH));
});

test('name normalization', () => {
  assert.equal(core.normName('Yu Sun (孙宇)'), 'yu sun');
  assert.equal(core.normName('Sun, Yu'), 'yu sun');
  assert.equal(core.normName('Alexandre Cristovão Maiorano'), 'alexandre cristovao maiorano');
  assert.equal(core.abbrevKey('Wei Yang Bryan Lim'), 'wyb lim');
  assert.equal(core.scholarAbbrevKey('WYB Lim'), 'wyb lim');
  assert.equal(core.normArxivId('https://arxiv.org/abs/2609.26758v1'), '2609.26758');
});

test('parseArxivAtom + filter', () => {
  const xml = `<feed><entry><id>http://arxiv.org/abs/2609.11111v2</id><published>2026-09-18T00:00:00Z</published>
    <title>A &amp; B
      with Jev</title><author><name>Ana Pérez</name></author><author><name>Bo Li</name></author></entry>
    <entry><id>http://arxiv.org/abs/2606.22807v3</id><published>2026-06-22T00:00:00Z</published><title>Old</title><author><name>X Y</name></author></entry></feed>`;
  const ps = core.parseArxivAtom(xml);
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0], { id: '2609.11111', title: 'A & B with Jev', authors: ['Ana Pérez', 'Bo Li'], published: '2026-09-18' });
  assert.deepEqual(core.filterPapers(ps).map((p) => p.id), ['2609.11111']);
});

test('listed paper tags every author as paper-level', () => {
  const r = core.classifyAuthors(idx(), { id: '2609.26758' }, [{ name: 'Yu Sun' }, { name: 'Junhao Xu' }]);
  assert.deepEqual(r.map((x) => x.level), ['paper', 'paper']);
  const byTitle = core.classifyAuthors(idx(), { title: 'Type-Safe Is Not Error-Free: A Constrained Decision Head Follows the Option…' }, [{ name: 'Y Sun', abbreviated: true }]);
  assert.equal(byTitle[0].level, 'paper');
});

test('other paper: co-authors together => confirmed, lone common name => name-only', () => {
  const r = core.classifyAuthors(idx(), { id: '2501.00001' }, [{ name: 'Yu Sun' }, { name: 'Junhao Xu' }, { name: 'Somebody Else' }]);
  assert.deepEqual(r.map((x) => x && x.level), ['confirmed', 'confirmed', null]);
  const lone = core.classifyAuthors(idx(), { id: '2501.00002' }, [{ name: 'Yi Li' }, { name: 'Zed Q' }]);
  assert.equal(lone[0].level, 'name');
  assert.equal(lone[1], null);
});

test('Scholar abbreviated names: off by default unless co-author evidence or known profile', () => {
  const a = [{ name: 'Y Li', abbreviated: true }];
  assert.equal(core.classifyAuthors(idx(), {}, a)[0], null);
  assert.equal(core.classifyAuthors(idx(), {}, a, { abbrevNameMatches: true })[0].level, 'name');
  const pair = core.classifyAuthors(idx(), {}, [{ name: 'D Li', abbreviated: true }, { name: 'X Wang', abbreviated: true }]);
  assert.deepEqual(pair.map((x) => x.level), ['confirmed', 'confirmed']);
  const known = core.classifyAuthors(idx({ confirmedScholarIds: { abc: ['2609.23986'] } }), {}, [{ name: 'Y Li', abbreviated: true, scholarId: 'abc' }]);
  assert.equal(known[0].level, 'confirmed');
});

test('false-positive controls', () => {
  const s = { notThem: { names: ['yi li'], scholarIds: ['zzz'] }, excludedPapers: ['2609.24395'] };
  assert.equal(core.classifyAuthors(idx(s), {}, [{ name: 'Yi Li' }])[0], null);
  assert.equal(core.classifyAuthors(idx(s), {}, [{ name: 'Werner Robitza' }])[0], null, 'excluded paper no longer counts');
  assert.equal(core.classifyProfile(idx(s), { scholarId: 'zzz', name: 'Yu Sun', pubTitles: [] }), null);
});

test('Scholar profile verification', () => {
  const t = 'JEV-as-a-Judge: Accept When Confident, Escalate When Unsure';
  const ok = core.classifyProfile(idx(), { scholarId: 'u1', name: 'Rema Padman', pubTitles: ['Other', t] });
  assert.equal(ok.level, 'confirmed');
  assert.deepEqual(ok.learn, ['2609.26550']);
  // same-name profile without a listed paper stays "name"
  assert.equal(core.classifyProfile(idx(), { scholarId: 'u2', name: 'Yi Li', pubTitles: ['Unrelated'] }).level, 'name');
  // a listed paper on a profile whose owner is not an author is not proof
  assert.equal(core.classifyProfile(idx(), { scholarId: 'u3', name: 'Some Body', pubTitles: [t] }), null);
});
