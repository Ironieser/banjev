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

test('position weights: 1, 0.5, 0.25, then halving', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((p) => core.positionWeight(p)), [1, 0.5, 0.25, 0.125, 0.0625]);
});

test('time weights: week 1 x2, week 2 x1, week 3 x0.5, week 4 x0.25, later x0', () => {
  const d = (n) => new Date(Date.parse(core.JEV_EPOCH) + n * 86400000).toISOString().slice(0, 10);
  assert.deepEqual([0, 6, 7, 13, 14, 21, 27, 28, 60].map((n) => core.weekOf(d(n))), [1, 1, 2, 2, 3, 4, 4, 5, 9]);
  assert.deepEqual([0, 6, 7, 14, 21, 28].map((n) => core.timeWeight(d(n))), [2, 2, 1, 0.5, 0.25, 0]);
  assert.equal(core.weekOf('2026-01-01'), 1, 'manual additions dated before the release count as week 1');
});

test('score = position x time; banned at >= 1; papers after week 4 ignored', () => {
  const ps = [
    { id: 'a', title: 'A', published: '2026-09-19', authors: ['Li Hua', 'Sam Smith', 'Ann Lee'] }, // week 1
    { id: 'b', title: 'B', published: '2026-09-26', authors: ['Ann Lee', 'Bo Chen'] }, // week 2
    { id: 'c', title: 'C', published: '2026-10-05', authors: ['Cy Park'] }, // week 3
    { id: 'd', title: 'D', published: '2026-10-30', authors: ['Dee Wu'] }, // week 7
  ];
  const s = Object.fromEntries(core.scoreAuthors(ps, { banAuthors: ['Cy Park'], allowAuthors: ['Li Hua'] }).map((r) => [r.name, r]));
  assert.equal(s['Sam Smith'].score, 1); // 2nd, week 1: 0.5 x 2
  assert.ok(s['Sam Smith'].banned);
  assert.equal(s['Ann Lee'].score, 1.5); // 3rd week 1 (0.5) + 1st week 2 (1)
  assert.equal(s['Bo Chen'].score, 0.5);
  assert.equal(s['Bo Chen'].banned, false);
  assert.equal(s['Cy Park'].score, 0.5);
  assert.ok(s['Cy Park'].banned, 'force-banned');
  assert.equal(s['Li Hua'].banned, false, 'allow-listed');
  assert.equal(s['Dee Wu'], undefined, 'week 7: no weight');
  assert.deepEqual(s['Ann Lee'].papers.map((p) => [p.id, p.position, p.week, p.weight]), [['b', 1, 2, 1], ['a', 3, 1, 0.5]]);
});

test('user-defined scoring', () => {
  const ps = [{ id: 'a', title: 'A', published: '2026-10-05', authors: ['Li Hua', 'Sam Smith'] }]; // week 3
  const def = Object.fromEntries(core.scoreAuthors(ps).map((r) => [r.name, r]));
  assert.equal(def['Li Hua'].banned, false); // 1 x 0.5
  const strict = { weekWeights: [4, 4, 4, 4], positionWeights: [1, 1, 1], threshold: 2 };
  const s = Object.fromEntries(core.scoreAuthors(ps, {}, strict).map((r) => [r.name, r]));
  assert.equal(s['Sam Smith'].score, 4);
  assert.ok(s['Sam Smith'].banned);
  assert.deepEqual(core.scoringOf({ threshold: -1, weekWeights: ['x'] }), core.DEFAULT_SCORING, 'invalid values fall back');
  // the index uses the user's scoring too
  const idx2 = core.buildIndex(ps, { scoring: { weekWeights: [2, 1, 0], threshold: 1 } });
  assert.equal(idx2.papers.length, 0, 'week 3 has weight 0 under this scoring: not tagged');
});

test('real data (all week 1): 1st and 2nd authors banned, 3rd only with two papers', () => {
  const s = Object.fromEntries(core.scoreAuthors(papers).map((r) => [r.name, r]));
  assert.equal(s['Delong Li'].score, 4);
  assert.equal(s['Xu Wang'].score, 2);
  assert.equal(s['Junhao Xu'].score, 1);
  assert.ok(s['Junhao Xu'].banned);
  assert.equal(s['Haochen Gong'].score, 1); // 3rd twice
  assert.ok(s['Haochen Gong'].banned);
  assert.equal(s['Hongyang Zhang'].score, 0.5);
  assert.equal(s['Hongyang Zhang'].banned, false);
});

test('listed paper: only its banned authors are tagged', () => {
  const r = core.classifyAuthors(idx(), { id: '2609.24965' }, [{ name: 'Boyuan Deng' }, { name: 'Hongyang Zhang' }]);
  assert.deepEqual(r.map((x) => x && x.level), ['paper', null]);
  assert.equal(r[0].author.score, 2);
  const byTitle = core.classifyAuthors(idx(), { title: 'Jev for Scientific Decisions: Evaluating Semantic Choices and Their…' }, [
    { name: 'B Deng', abbreviated: true },
    { name: 'H Zhang', abbreviated: true },
  ]);
  assert.deepEqual(byTitle.map((x) => x && x.level), ['paper', null]);
});

test('other paper: co-authors together => confirmed, lone name => name-only, unbanned => nothing', () => {
  const r = core.classifyAuthors(idx(), { id: '2501.00001' }, [{ name: 'Yu Sun' }, { name: 'Junhao Xu' }, { name: 'Somebody Else' }]);
  assert.deepEqual(r.map((x) => x && x.level), ['confirmed', 'confirmed', null]);
  const lone = core.classifyAuthors(idx(), { id: '2501.00002' }, [{ name: 'Werner Robitza' }, { name: 'Bingzhe Li' }]);
  assert.equal(lone[0].level, 'name');
  assert.equal(lone[1], null, 'Bingzhe Li is 3rd author once: 0.5, not banned');
});

test('manual curation from the repo', () => {
  assert.equal(core.classifyAuthors(idx({}, { banAuthors: ['Bingzhe Li'] }), {}, [{ name: 'Bingzhe Li' }])[0].level, 'name');
  assert.equal(core.classifyAuthors(idx({}, { allowAuthors: ['Werner Robitza'] }), {}, [{ name: 'Werner Robitza' }])[0], null);
});

test('Scholar: never by name alone; co-author evidence or known profile only', () => {
  const sch = { site: 'scholar' };
  assert.equal(core.classifyAuthors(idx(), {}, [{ name: 'D Li', abbreviated: true }], sch)[0], null);
  assert.equal(core.classifyAuthors(idx(), {}, [{ name: 'Amir Rafe', scholarId: 'x' }], sch)[0], null, 'full name alone is not enough on Scholar');
  const pair = core.classifyAuthors(idx(), {}, [{ name: 'D Li', abbreviated: true }, { name: 'X Wang', abbreviated: true }, { name: 'R Lang', abbreviated: true }], sch);
  assert.deepEqual(pair.map((x) => x && x.level), ['confirmed', 'confirmed', null], 'Rui Lang: 4th twice = 0.5');
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
