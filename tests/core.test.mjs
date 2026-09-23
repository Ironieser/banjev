import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../src/lib/core.js');
const papers = JSON.parse(readFileSync(new URL('../data/papers.json', import.meta.url))).papers;
const idx = (settings, curation) => core.buildIndex(papers, settings, curation);

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

test('scoring: 1st = 1, 2nd = 0.5, 3rd = 0.25, banned at >= 1', () => {
  assert.deepEqual([1, 2, 3, 4].map(core.positionWeight), [1, 0.5, 0.25, 0.125]);
  const ps = [
    { id: 'a', title: 'A', published: '2026-09-20', authors: ['Ann One', 'Bob Two', 'Cat Three'] },
    { id: 'b', title: 'B', published: '2026-09-21', authors: ['Dan', 'Bob Two', 'Cat Three'] },
    { id: 'c', title: 'C', published: '2026-09-22', authors: ['Eve', 'Fay', 'Cat Three'] },
    { id: 'd', title: 'D', published: '2026-09-22', authors: ['Gus', 'Hal', 'Ivy', 'Cat Three'] },
  ];
  const s = Object.fromEntries(core.scoreAuthors(ps, { banAuthors: ['Fay'], allowAuthors: ['Ann One'] }).map((r) => [r.name, r]));
  assert.equal(s['Bob Two'].score, 1);
  assert.equal(s['Bob Two'].banned, true);
  assert.equal(s['Cat Three'].score, 0.875);
  assert.equal(s['Cat Three'].banned, false);
  assert.equal(s['Fay'].banned, true, 'force-banned');
  assert.equal(s['Ann One'].banned, false, 'allow-listed');
  assert.deepEqual(s['Bob Two'].papers.map((p) => [p.id, p.position]), [['b', 2], ['a', 2]]);
  const ranked = core.scoreAuthors(ps).map((r) => r.name);
  assert.deepEqual(ranked.slice(0, 3), ['Eve', 'Gus', 'Bob Two'], 'ties: newest paper first, then name');
});

test('real data: Delong Li (1st x2) and Xu Wang (2nd x2) are banned, Junhao Xu (2nd x1) is not', () => {
  const s = Object.fromEntries(core.scoreAuthors(papers).map((r) => [r.name, r]));
  assert.equal(s['Delong Li'].score, 2);
  assert.equal(s['Xu Wang'].score, 1);
  assert.ok(s['Xu Wang'].banned);
  assert.equal(s['Junhao Xu'].banned, false);
});

test('listed paper: only its banned authors are tagged', () => {
  const r = core.classifyAuthors(idx(), { id: '2609.26758' }, [{ name: 'Yu Sun' }, { name: 'Junhao Xu' }]);
  assert.deepEqual(r.map((x) => x && x.level), ['paper', null]);
  assert.equal(r[0].author.score, 1);
  const byTitle = core.classifyAuthors(idx(), { title: 'Type-Safe Is Not Error-Free: A Constrained Decision Head Follows the Option…' }, [
    { name: 'Y Sun', abbreviated: true },
    { name: 'J Xu', abbreviated: true },
  ]);
  assert.deepEqual(byTitle.map((x) => x && x.level), ['paper', null]);
});

test('other paper: co-authors together => confirmed, lone name => name-only, unbanned => nothing', () => {
  const r = core.classifyAuthors(idx(), { id: '2501.00001' }, [{ name: 'Yu Sun' }, { name: 'Junhao Xu' }, { name: 'Somebody Else' }]);
  assert.deepEqual(r.map((x) => x && x.level), ['confirmed', null, null]);
  const lone = core.classifyAuthors(idx(), { id: '2501.00002' }, [{ name: 'Werner Robitza' }, { name: 'Yi Li' }]);
  assert.equal(lone[0].level, 'name');
  assert.equal(lone[1], null, 'Yi Li is 2nd author once: 0.5, not banned');
});

test('manual curation from the repo', () => {
  assert.equal(core.classifyAuthors(idx({}, { banAuthors: ['Yi Li'] }), {}, [{ name: 'Yi Li' }])[0].level, 'name');
  assert.equal(core.classifyAuthors(idx({}, { allowAuthors: ['Werner Robitza'] }), {}, [{ name: 'Werner Robitza' }])[0], null);
});

test('Scholar: never by name alone; co-author evidence or known profile only', () => {
  const sch = { site: 'scholar' };
  assert.equal(core.classifyAuthors(idx(), {}, [{ name: 'D Li', abbreviated: true }], sch)[0], null);
  assert.equal(core.classifyAuthors(idx(), {}, [{ name: 'Amir Rafe', scholarId: 'x' }], sch)[0], null, 'full name alone is not enough on Scholar');
  const pair = core.classifyAuthors(idx(), {}, [{ name: 'D Li', abbreviated: true }, { name: 'X Wang', abbreviated: true }, { name: 'H Gong', abbreviated: true }], sch);
  assert.deepEqual(pair.map((x) => x && x.level), ['confirmed', 'confirmed', null]);
  const cur = { scholarProfiles: { 'Dongming Jiang': 'FZLU_acAAAAJ' } };
  const known = core.classifyAuthors(idx({}, cur), {}, [{ name: 'D Jiang', abbreviated: true, scholarId: 'FZLU_acAAAAJ' }], sch);
  assert.equal(known[0].level, 'confirmed');
  // same-name researcher with another profile: untouched, even next to the real co-authors
  const other = core.classifyAuthors(idx({}, cur), {}, [{ name: 'D Jiang', abbreviated: true, scholarId: 'OTHER' }, { name: 'Y Li', abbreviated: true }], sch);
  assert.equal(other[0], null);
});

test('arXiv name-only matches can be switched off', () => {
  assert.equal(core.classifyAuthors(idx(), {}, [{ name: 'Werner Robitza' }], { site: 'arxiv', showNameMatches: false })[0], null);
});

test('false-positive controls', () => {
  const s = { notThem: { names: ['werner robitza'], scholarIds: ['zzz'] }, excludedPapers: ['2609.26758'] };
  assert.equal(core.classifyAuthors(idx(s), {}, [{ name: 'Werner Robitza' }])[0], null);
  assert.equal(core.classifyAuthors(idx(s), {}, [{ name: 'Yu Sun' }])[0], null, 'excluded paper no longer counts');
  const cur = { scholarProfiles: { 'Dongming Jiang': 'zzz' } };
  assert.equal(core.classifyProfile(idx(s, cur), { scholarId: 'zzz', name: 'Dongming Jiang', pubs: [] }), null);
});

const jiang = JSON.parse(readFileSync(new URL('./fixtures/jiang-pubs.json', import.meta.url)));

test('Scholar profile: real Dongming Jiang profile confirmed by co-author network before Jev-Mem is indexed', () => {
  assert.ok(!jiang.some((p) => /Jev/i.test(p.title)), 'fixture predates indexing');
  const r = core.classifyProfile(idx(), { scholarId: 'FZLU_acAAAAJ', name: 'Dongming Jiang', pubs: jiang });
  assert.equal(r.level, 'confirmed');
  assert.equal(r.learn, 'dongming jiang');
  assert.match(r.reason, /co-authors/);
  // a same-name profile whose papers don't share co-authors: nothing
  const stranger = jiang.map((p) => ({ ...p, authors: ['D Jiang', 'Q Zhou'] }));
  assert.equal(core.classifyProfile(idx(), { scholarId: 'S1', name: 'Dongming Jiang', pubs: stranger }), null);
  // one shared co-author is not enough when the listed paper has two
  const weak = jiang.map((p) => ({ ...p, authors: p.authors.filter((a) => a !== 'B Li') }));
  assert.equal(core.classifyProfile(idx(), { scholarId: 'S2', name: 'Dongming Jiang', pubs: weak }), null);
  // once the real profile is known, same-name profiles are never tagged
  const cur = { scholarProfiles: { 'Dongming Jiang': 'FZLU_acAAAAJ' } };
  assert.equal(core.classifyProfile(idx({}, cur), { scholarId: 'S3', name: 'Dongming Jiang', pubs: jiang }), null);
  assert.equal(core.classifyProfile(idx({}, cur), { scholarId: 'FZLU_acAAAAJ', name: 'Dongming Jiang', pubs: [] }).level, 'confirmed');
});

test('Scholar profile verification via listed paper', () => {
  const t = 'JEV-as-a-Judge: Accept When Confident, Escalate When Unsure';
  const ok = core.classifyProfile(idx(), { scholarId: 'u1', name: 'Yubo Li', pubs: [{ title: 'Other' }, { title: t }] });
  assert.equal(ok.level, 'confirmed');
  assert.equal(ok.learn, 'yubo li');
  // 4th author on the listed paper: verified identity, but score 0.125 => not banned
  assert.equal(core.classifyProfile(idx(), { scholarId: 'u2', name: 'Rema Padman', pubs: [{ title: t }] }), null);
  // same name, no evidence: nothing (Scholar never tags by name alone)
  assert.equal(core.classifyProfile(idx(), { scholarId: 'u3', name: 'Amir Rafe', pubs: [{ title: 'Unrelated' }] }), null);
  // a listed paper on a profile whose owner is not an author is not proof
  assert.equal(core.classifyProfile(idx(), { scholarId: 'u4', name: 'Some Body', pubs: [{ title: t }] }), null);
});
