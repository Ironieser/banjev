/*
 * BanJev core: pure data + matching logic shared by the service worker,
 * content scripts, popup and Node tests. No DOM access in this file.
 */
(function (root) {
  'use strict';

  // Jev went public on 2026-09-17 (first awesome-jev commit). Only papers
  // submitted on or after this date count as "Jev bandwagon" papers.
  const JEV_EPOCH = '2026-09-17';

  const ARXIV_QUERY =
    'https://export.arxiv.org/api/query?search_query=' +
    encodeURIComponent('(ti:Jev OR abs:Jev) AND submittedDate:[202609170000 TO 209912312359]') +
    '&sortBy=submittedDate&sortOrder=descending&max_results=500';

  // ---------- normalization ----------

  function stripDiacritics(s) {
    return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  // "Li Hua (李华)" -> "li hua"; "José Núñez" -> "jose nunez"
  function normName(name) {
    if (!name) return '';
    let s = String(name).replace(/\([^)]*\)|（[^）]*）/g, ' ');
    // "Hua, Li" -> "Li Hua"
    const comma = s.split(',');
    if (comma.length === 2 && comma[0].trim() && comma[1].trim() && !/\s/.test(comma[0].trim())) {
      s = comma[1] + ' ' + comma[0];
    }
    s = stripDiacritics(s).toLowerCase();
    s = s.replace(/[^a-z\s\-']/g, ' ').replace(/[-']/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Google Scholar abbreviates to "SJ Smith" / "L Hua". Key = initials + last name.
  function abbrevKey(name) {
    const n = normName(name);
    if (!n) return '';
    const parts = n.split(' ');
    const last = parts.pop();
    return (parts.map((p) => p[0]).join('') + ' ' + last).trim();
  }

  // Parse a Scholar abbreviated author "SJ Smith" -> key "sj smith"
  function scholarAbbrevKey(text) {
    const t = stripDiacritics(String(text)).replace(/[^A-Za-z\s\-']/g, ' ').trim();
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return '';
    const last = parts.pop().toLowerCase().replace(/[-']/g, ' ');
    const initials = parts.join('').toLowerCase();
    return initials + ' ' + last;
  }

  function normTitle(t) {
    return stripDiacritics(String(t || ''))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // "2609.26758v1" / "arXiv:2609.26758" -> "2609.26758"
  function normArxivId(s) {
    const m = String(s || '').match(/(\d{4}\.\d{4,5})(v\d+)?/);
    return m ? m[1] : '';
  }

  // ---------- arXiv Atom parsing (regex: DOMParser is unavailable in MV3 workers) ----------

  function decodeXml(s) {
    return s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
      .replace(/&amp;/g, '&');
  }

  function parseArxivAtom(xml) {
    const papers = [];
    const entries = xml.split(/<entry>/).slice(1);
    for (const raw of entries) {
      const e = raw.split(/<\/entry>/)[0];
      const pick = (tag) => {
        const m = e.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
        return m ? decodeXml(m[1]).replace(/\s+/g, ' ').trim() : '';
      };
      const id = normArxivId(pick('id'));
      if (!id) continue;
      const authors = [];
      const re = /<author>\s*<name>([\s\S]*?)<\/name>/g;
      let m;
      while ((m = re.exec(e))) authors.push(decodeXml(m[1]).replace(/\s+/g, ' ').trim());
      papers.push({
        id,
        title: pick('title'),
        authors,
        published: pick('published').slice(0, 10),
      });
    }
    return papers;
  }

  // arXiv IDs linked from a Markdown file (used on the vendored awesome-jev snapshot).
  function extractArxivIds(markdown) {
    const ids = new Set();
    const re = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/gi;
    let m;
    while ((m = re.exec(markdown))) ids.add(m[1]);
    return [...ids];
  }

  // Keep only bandwagon papers: submitted on/after the Jev epoch.
  function filterPapers(papers) {
    return papers.filter((p) => p.id && (!p.published || p.published >= JEV_EPOCH));
  }

  function mergePapers(...lists) {
    const byId = new Map();
    for (const list of lists) for (const p of list || []) if (p && p.id) byId.set(p.id, { ...byId.get(p.id), ...p });
    return [...byId.values()].sort((a, b) => (b.published || '').localeCompare(a.published || '') || b.id.localeCompare(a.id));
  }

  // ---------- scoring ----------

  // Author-position weight: 1st = 1, 2nd = 0.5, 3rd = 0.25, then keeps halving.
  const BAN_THRESHOLD = 1;
  function positionWeight(pos) {
    return Math.pow(0.5, pos - 1);
  }

  /*
   * Aggregate authors over the listed papers.
   * curation: { banAuthors: [name], allowAuthors: [name] } maintained in data/manual.json
   * Returns records sorted by score desc, then latest paper desc:
   *   { key, name, score, banned, forced, allowed, latest, papers: [{ id, title, published, position }] }
   */
  function scoreAuthors(papers, curation) {
    curation = curation || {};
    const forced = new Set((curation.banAuthors || []).map(normName));
    const allowed = new Set((curation.allowAuthors || []).map(normName));
    const m = new Map();
    for (const p of papers) {
      p.authors.forEach((a, i) => {
        const key = normName(a);
        if (!key) return;
        if (!m.has(key)) m.set(key, { key, name: a, score: 0, papers: [] });
        const r = m.get(key);
        if (r.papers.some((x) => x.id === p.id)) return;
        r.score += positionWeight(i + 1);
        r.papers.push({ id: p.id, title: p.title, published: p.published, position: i + 1 });
      });
    }
    for (const r of m.values()) {
      r.score = Math.round(r.score * 1000) / 1000;
      r.forced = forced.has(r.key);
      r.allowed = allowed.has(r.key);
      r.banned = !r.allowed && (r.forced || r.score >= BAN_THRESHOLD);
      r.papers.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
      r.latest = r.papers[0] ? r.papers[0].published : '';
    }
    return [...m.values()].sort((a, b) => b.score - a.score || (b.latest || '').localeCompare(a.latest || '') || a.name.localeCompare(b.name));
  }

  // ---------- index + matching ----------

  /*
   * settings (per-user, extension storage): {
   *   excludedPapers: [arxivId],                         // "this isn't really a Jev paper"
   *   notThem: { names: [normName], scholarIds: [id] },  // false positives
   *   confirmedScholarIds: { id: normName },             // profiles verified in this browser
   * }
   * curation (repo, data/manual.json): { banAuthors, allowAuthors, scholarProfiles: { name: id | [id] } }
   */
  function buildIndex(papers, settings, curation) {
    settings = settings || {};
    curation = curation || {};
    const excluded = new Set(settings.excludedPapers || []);
    const live = papers.filter((p) => !excluded.has(p.id));
    const byId = new Map();
    const byTitle = new Map();
    for (const p of live) {
      byId.set(p.id, p);
      byTitle.set(normTitle(p.title), p);
    }
    const authors = new Map(); // normName -> score record
    const byAbbrev = new Map(); // abbrevKey -> [normName]
    for (const r of scoreAuthors(live, curation)) {
      authors.set(r.key, r);
      const k = abbrevKey(r.name);
      if (!byAbbrev.has(k)) byAbbrev.set(k, []);
      byAbbrev.get(k).push(r.key);
    }
    // Known Scholar profiles: curated in the repo, or verified in this browser.
    const scholarToKey = new Map();
    for (const [name, ids] of Object.entries(curation.scholarProfiles || {})) {
      [].concat(ids).forEach((id) => scholarToKey.set(id, normName(name)));
    }
    for (const [id, key] of Object.entries(settings.confirmedScholarIds || {})) {
      if (typeof key === 'string' && !scholarToKey.has(id)) scholarToKey.set(id, key);
    }
    const knownIds = new Map(); // normName -> Set(scholarId)
    for (const [id, key] of scholarToKey) {
      if (!knownIds.has(key)) knownIds.set(key, new Set());
      knownIds.get(key).add(id);
    }
    const notThem = settings.notThem || {};
    return {
      papers: live,
      byId,
      byTitle,
      authors,
      byAbbrev,
      scholarToKey,
      knownIds,
      bannedCount: [...authors.values()].filter((r) => r.banned).length,
      notThemNames: new Set(notThem.names || []),
      notThemScholar: new Set(notThem.scholarIds || []),
    };
  }

  function findPaper(index, { id, title }) {
    const nid = normArxivId(id);
    if (nid && index.byId.has(nid)) return index.byId.get(nid);
    const nt = normTitle(title);
    if (nt && nt.length > 20) {
      if (index.byTitle.has(nt)) return index.byTitle.get(nt);
      // Scholar truncates long titles with "…"
      for (const [k, p] of index.byTitle) if (nt.length > 40 && k.startsWith(nt)) return p;
    }
    return null;
  }

  // Author records a displayed name could refer to.
  function candidates(index, a) {
    if (a.abbreviated) return (index.byAbbrev.get(scholarAbbrevKey(a.name)) || []).map((k) => index.authors.get(k));
    const r = index.authors.get(normName(a.name));
    return r ? [r] : [];
  }

  // The author of one of `papers` that a displayed name refers to (full or abbreviated).
  function authorOn(index, papers, a) {
    const key = a.abbreviated ? scholarAbbrevKey(a.name) : normName(a.name);
    for (const p of papers) {
      for (const x of p.authors) {
        if ((a.abbreviated ? abbrevKey(x) : normName(x)) === key) return index.authors.get(normName(x));
      }
    }
    // arXiv display names sometimes differ slightly from the API ("Li Hua" vs "L. Hua")
    if (!a.abbreviated) return authorOn(index, papers, { name: a.name, abbreviated: true });
    return null;
  }

  // A Scholar profile that is known to belong to someone else with the same name.
  function otherPerson(index, r, scholarId) {
    if (!scholarId) return false;
    const owner = index.scholarToKey.get(scholarId);
    if (owner) return owner !== r.key;
    const known = index.knownIds.get(r.key);
    return !!(known && known.size && !known.has(scholarId));
  }

  function hit(level, r, index, reason) {
    return { level, author: r, papers: r.papers.map((x) => index.byId.get(x.id)).filter(Boolean), reason };
  }

  /*
   * Classify every author on one paper-like item (an arXiv entry, a Scholar result).
   * authors: [{ name, abbreviated?: bool, scholarId?: string }]
   * paper:   { id?, title? }
   * opts:    { site: 'arxiv' | 'scholar', showNameMatches }
   * Only banned authors (score >= 1 or force-banned) are tagged. Returns per author null or
   *   { level: 'paper' | 'confirmed' | 'name', author: record, papers: [listed paper], reason }
   *  - paper:     this item IS a listed Jev paper and the author is on it.
   *  - confirmed: identity evidence: a known Scholar profile, or >= 2 co-authors of the
   *               same listed paper appear together here.
   *  - name:      the full name alone matches (arXiv only; never on Scholar).
   */
  function classifyAuthors(index, paper, authors, opts) {
    opts = opts || {};
    const scholar = opts.site === 'scholar';
    const listed = paper ? findPaper(index, paper) : null;
    const skip = authors.map((a) => !!(a.scholarId && index.notThemScholar.has(a.scholarId)));
    const cands = authors.map((a, i) => (skip[i] ? [] : candidates(index, a).filter((r) => !otherPerson(index, r, a.scholarId))));

    // Co-author evidence: listed papers with >= 2 distinct displayed authors on them.
    const count = new Map();
    cands.forEach((cs) => {
      const ids = new Set();
      cs.forEach((r) => r.papers.forEach((x) => ids.add(x.id)));
      ids.forEach((id) => count.set(id, (count.get(id) || 0) + 1));
    });

    return authors.map((a, i) => {
      if (skip[i]) return null;
      if (listed) {
        const r = authorOn(index, [listed], a);
        return r && r.banned ? hit('paper', r, index, 'author of this paper') : null;
      }
      const owner = a.scholarId && index.scholarToKey.get(a.scholarId);
      if (owner) {
        const r = index.authors.get(owner);
        return r && r.banned ? hit('confirmed', r, index, 'known Scholar profile') : null;
      }
      if (!a.abbreviated && index.notThemNames.has(normName(a.name))) return null;
      const banned = cands[i].filter((r) => r.banned);
      if (!banned.length) return null;
      const co = banned.find((r) => r.papers.some((x) => count.get(x.id) >= 2));
      if (co) return hit('confirmed', co, index, 'co-authors of a listed paper appear together');
      if (scholar || a.abbreviated || opts.showNameMatches === false) return null;
      return hit('name', banned[0], index, 'full name match');
    });
  }

  /*
   * Scholar profile page. pubs: [{ title, authors: [abbreviated name] }]
   * Confirmed only with evidence (never by name alone):
   *  - the profile is known (curated in the repo or verified earlier), or
   *  - a listed paper appears in its publication list, or
   *  - >= 2 of its publications share co-authors with the owner's listed paper(s)
   *    (Scholar can take weeks to index a new arXiv paper).
   * A same-name profile is never tagged once the author's real profile is known.
   */
  const COAUTHOR_PUBS = 2;
  function classifyProfile(index, { scholarId, name, pubs }) {
    if (scholarId && index.notThemScholar.has(scholarId)) return null;
    pubs = pubs || [];
    const owner = scholarId && index.scholarToKey.get(scholarId);
    if (owner) {
      const r = index.authors.get(owner);
      return r && r.banned ? hit('confirmed', r, index, 'known Scholar profile') : null;
    }
    const a = { name };
    const own = uniq(pubs.map((p) => findPaper(index, { title: p.title })).filter(Boolean));
    // A listed paper on the profile is proof only if the profile owner's name is on it.
    const proof = own.filter((p) => authorOn(index, [p], a));
    if (proof.length) {
      const r = authorOn(index, proof, a);
      if (otherPerson(index, r, scholarId)) return null;
      return r.banned ? { ...hit('confirmed', r, index, 'profile lists a Jev paper'), learn: r.key } : null;
    }
    const r = index.authors.get(normName(name));
    if (!r || !r.banned || otherPerson(index, r, scholarId)) return null;
    // co-author network: abbreviated keys of r's co-authors on listed papers
    const own_k = abbrevKey(r.name);
    const co = new Set();
    r.papers.forEach((x) => index.byId.get(x.id).authors.forEach((n) => abbrevKey(n) !== own_k && co.add(abbrevKey(n))));
    if (!co.size) return null; // single-author papers: nothing to cross-check
    // Abbreviations like "L Hua" are common, so require several shared publications and,
    // when the listed paper has >= 2 co-authors, at least 2 distinct matching co-authors.
    const matched = new Set();
    const shared = pubs.filter((p) => {
      const hits = (p.authors || []).map(scholarAbbrevKey).filter((k) => co.has(k));
      hits.forEach((k) => matched.add(k));
      return hits.length > 0;
    });
    const enough = co.size >= 2 ? shared.length >= COAUTHOR_PUBS && matched.size >= 2 : shared.length >= COAUTHOR_PUBS + 1;
    if (enough) {
      return { ...hit('confirmed', r, index, `${shared.length} publications with co-authors ${[...matched].join(', ')}`), learn: r.key };
    }
    return null;
  }

  function uniq(ps) {
    const seen = new Set();
    return ps.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  }

  const api = {
    JEV_EPOCH,
    ARXIV_QUERY,
    normName,
    abbrevKey,
    scholarAbbrevKey,
    normTitle,
    normArxivId,
    parseArxivAtom,
    extractArxivIds,
    filterPapers,
    mergePapers,
    buildIndex,
    findPaper,
    classifyAuthors,
    classifyProfile,
    scoreAuthors,
    positionWeight,
    BAN_THRESHOLD,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BanJev = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
