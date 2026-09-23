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

  const AWESOME_README = 'https://raw.githubusercontent.com/yibie/awesome-jev/main/README.md';

  // ---------- normalization ----------

  function stripDiacritics(s) {
    return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  // "Yu Sun (孙宇)" -> "yu sun"; "Cristóvão" -> "cristovao"
  function normName(name) {
    if (!name) return '';
    let s = String(name).replace(/\([^)]*\)|（[^）]*）/g, ' ');
    // "Sun, Yu" -> "Yu Sun"
    const comma = s.split(',');
    if (comma.length === 2 && comma[0].trim() && comma[1].trim() && !/\s/.test(comma[0].trim())) {
      s = comma[1] + ' ' + comma[0];
    }
    s = stripDiacritics(s).toLowerCase();
    s = s.replace(/[^a-z\s\-']/g, ' ').replace(/[-']/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Google Scholar abbreviates to "WYB Lim" / "Y Sun". Key = initials + last name.
  function abbrevKey(name) {
    const n = normName(name);
    if (!n) return '';
    const parts = n.split(' ');
    const last = parts.pop();
    return (parts.map((p) => p[0]).join('') + ' ' + last).trim();
  }

  // Parse a Scholar abbreviated author "WYB Lim" -> key "wyb lim"
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

  // arXiv IDs linked from the awesome-jev README (none today, but the list may grow).
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

  // ---------- index + matching ----------

  /*
   * settings: {
   *   excludedPapers: [arxivId],        // user says "this paper isn't really a Jev paper"
   *   notThem: { names: [normName], scholarIds: [id] },  // false positives
   *   confirmedScholarIds: { id: [arxivId] },            // learned or user-pinned profiles
   * }
   */
  function buildIndex(papers, settings) {
    settings = settings || {};
    const excluded = new Set(settings.excludedPapers || []);
    const live = papers.filter((p) => !excluded.has(p.id));
    const byId = new Map();
    const byTitle = new Map();
    const byName = new Map(); // normName -> [paper]
    const byAbbrev = new Map(); // abbrevKey -> [paper]
    for (const p of live) {
      byId.set(p.id, p);
      byTitle.set(normTitle(p.title), p);
      for (const a of p.authors) {
        const n = normName(a);
        if (!n) continue;
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(p);
        const k = abbrevKey(a);
        if (!byAbbrev.has(k)) byAbbrev.set(k, []);
        byAbbrev.get(k).push(p);
      }
    }
    const notThem = settings.notThem || {};
    return {
      papers: live,
      byId,
      byTitle,
      byName,
      byAbbrev,
      notThemNames: new Set(notThem.names || []),
      notThemScholar: new Set(notThem.scholarIds || []),
      confirmedScholar: settings.confirmedScholarIds || {},
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

  /*
   * Classify every author on one paper-like item (an arXiv entry, a Scholar result).
   * authors: [{ name, abbreviated?: bool, scholarId?: string }]
   * paper:   { id?, title? }
   * Returns one result per author: null or
   *   { level: 'paper' | 'confirmed' | 'name', papers: [listed paper], reason }
   *  - paper:     this item IS a listed Jev paper, so every author on it is an author of it.
   *  - confirmed: strong identity evidence (known Scholar profile, or >= 2 co-authors
   *               of the same listed paper appear together here).
   *  - name:      the name alone matches; could be a different person with the same name.
   */
  function classifyAuthors(index, paper, authors, opts) {
    opts = opts || {};
    const listed = paper ? findPaper(index, paper) : null;
    const hits = authors.map((a) => {
      if (a.scholarId && index.notThemScholar.has(a.scholarId)) return { skip: true };
      const n = normName(a.name);
      const cands = a.abbreviated ? index.byAbbrev.get(scholarAbbrevKey(a.name)) : index.byName.get(n);
      return { cands: cands || [], n };
    });

    // Co-author evidence: which listed papers have >= 2 distinct authors on this item?
    const count = new Map();
    hits.forEach((h) => {
      if (h.skip) return;
      new Set(h.cands.map((p) => p.id)).forEach((pid) => count.set(pid, (count.get(pid) || 0) + 1));
    });

    return authors.map((a, i) => {
      const h = hits[i];
      if (h.skip) return null;
      if (listed) {
        return { level: 'paper', papers: [listed], reason: 'author of listed paper' };
      }
      if (a.scholarId && index.confirmedScholar[a.scholarId]) {
        const ps = index.confirmedScholar[a.scholarId].map((id) => index.byId.get(id)).filter(Boolean);
        if (ps.length) return { level: 'confirmed', papers: ps, reason: 'Scholar profile verified' };
      }
      if (!h.cands.length) return null;
      if (!a.abbreviated && index.notThemNames.has(h.n)) return null;
      const coauth = h.cands.filter((p) => count.get(p.id) >= 2);
      if (coauth.length) return { level: 'confirmed', papers: uniq(coauth), reason: 'co-authors of a listed paper appear together' };
      if (a.abbreviated && !opts.abbrevNameMatches) return null;
      return { level: 'name', papers: uniq(h.cands), reason: a.abbreviated ? 'abbreviated name match' : 'full name match' };
    });
  }

  // Scholar profile page: verified if its publication list contains a listed paper.
  function classifyProfile(index, { scholarId, name, pubTitles }) {
    if (scholarId && index.notThemScholar.has(scholarId)) return null;
    if (scholarId && index.confirmedScholar[scholarId]) {
      const ps = index.confirmedScholar[scholarId].map((id) => index.byId.get(id)).filter(Boolean);
      if (ps.length) return { level: 'confirmed', papers: ps, reason: 'Scholar profile verified' };
    }
    const n = normName(name);
    const own = uniq((pubTitles || []).map((t) => findPaper(index, { title: t })).filter(Boolean));
    const nameCands = index.byName.get(n) || [];
    // A listed paper on the profile is proof only if the profile owner's name is on it.
    const proof = own.filter((p) => p.authors.some((x) => normName(x) === n || abbrevKey(x) === abbrevKey(name)));
    if (proof.length) return { level: 'confirmed', papers: proof, reason: 'profile lists a Jev paper', learn: proof.map((p) => p.id) };
    if (index.notThemNames.has(n)) return null;
    if (nameCands.length) return { level: 'name', papers: uniq(nameCands), reason: 'full name match' };
    return null;
  }

  function uniq(ps) {
    const seen = new Set();
    return ps.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
  }

  function authorList(papers) {
    const m = new Map();
    for (const p of papers) for (const a of p.authors) {
      const n = normName(a);
      if (!m.has(n)) m.set(n, { name: a, papers: [] });
      m.get(n).papers.push(p.id);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const api = {
    JEV_EPOCH,
    ARXIV_QUERY,
    AWESOME_README,
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
    authorList,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BanJev = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
