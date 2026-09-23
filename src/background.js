/* BanJev service worker: keeps the paper list fresh and owns persistent state. */
importScripts('lib/core.js');
const core = self.BanJev;

const REFRESH_MINUTES = 6 * 60;

const DEFAULT_SETTINGS = {
  enabled: true,
  showNameMatches: true, // full-name matches without extra evidence ("BanJev?")
  abbrevNameMatches: false, // Scholar "Y Sun"-style matches: very noisy, off by default
  excludedPapers: [],
  notThem: { names: [], scholarIds: [] },
  confirmedScholarIds: {},
};

async function getState() {
  const s = await chrome.storage.local.get(['papers', 'updatedAt', 'lastError', 'settings']);
  if (!s.papers) {
    const snap = await (await fetch(chrome.runtime.getURL('data/papers.json'))).json();
    s.papers = snap.papers;
    s.updatedAt = snap.updatedAt;
    await chrome.storage.local.set({ papers: s.papers, updatedAt: s.updatedAt });
  }
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  return s;
}

async function refresh() {
  const state = await getState();
  try {
    const res = await fetch(core.ARXIV_QUERY);
    if (!res.ok) throw new Error('arXiv HTTP ' + res.status);
    const searched = core.parseArxivAtom(await res.text());
    let linked = [];
    try {
      const md = await (await fetch(core.AWESOME_README)).text();
      const ids = core.extractArxivIds(md);
      if (ids.length) {
        const r = await fetch('https://export.arxiv.org/api/query?max_results=500&id_list=' + ids.join(','));
        linked = core.parseArxivAtom(await r.text());
      }
    } catch (e) {
      /* README is a secondary source; ignore failures */
    }
    // Merge with what we had so a flaky/partial API response never shrinks the list.
    const papers = core.filterPapers(core.mergePapers(state.papers, searched, linked));
    await chrome.storage.local.set({ papers, updatedAt: new Date().toISOString(), lastError: null });
    return { ok: true, count: papers.length };
  } catch (e) {
    await chrome.storage.local.set({ lastError: String(e.message || e) });
    return { ok: false, error: String(e.message || e) };
  }
}

// Serialized so concurrent messages (e.g. learnProfile + notThem) never clobber each other.
let settingsQueue = Promise.resolve();
function updateSettings(fn) {
  const run = settingsQueue.then(async () => {
    const { settings } = await getState();
    const next = structuredClone(settings);
    fn(next);
    await chrome.storage.local.set({ settings: next });
    return next;
  });
  settingsQueue = run.catch(() => {});
  return run;
}

chrome.runtime.onInstalled.addListener(async () => {
  await getState();
  chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 1 });
  refresh();
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => a.name === 'refresh' && refresh());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    switch (msg.type) {
      case 'getState':
        return getState();
      case 'refresh':
        return refresh();
      case 'learnProfile': // Scholar profile verified by a listed paper on it
        return updateSettings((s) => {
          const cur = new Set(s.confirmedScholarIds[msg.scholarId] || []);
          msg.paperIds.forEach((id) => cur.add(id));
          s.confirmedScholarIds[msg.scholarId] = [...cur];
        });
      case 'confirmProfile': // user: "yes, this is the same person"
        return updateSettings((s) => {
          s.confirmedScholarIds[msg.scholarId] = msg.paperIds;
          s.notThem.scholarIds = s.notThem.scholarIds.filter((x) => x !== msg.scholarId);
        });
      case 'notThem': // user: false positive
        return updateSettings((s) => {
          if (msg.scholarId) {
            s.notThem.scholarIds = [...new Set([...s.notThem.scholarIds, msg.scholarId])];
            delete s.confirmedScholarIds[msg.scholarId];
          } else if (msg.name) {
            s.notThem.names = [...new Set([...s.notThem.names, core.normName(msg.name)])];
          }
        });
      case 'setSettings':
        return updateSettings((s) => Object.assign(s, msg.patch));
      default:
        return null;
    }
  })().then(reply, (e) => reply({ error: String(e) }));
  return true;
});
