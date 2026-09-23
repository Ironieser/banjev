/* BanJev service worker: keeps the paper list fresh and owns persistent state. */
importScripts('lib/core.js');
const core = self.BanJev;

const REFRESH_MINUTES = 6 * 60;

const DEFAULT_SETTINGS = {
  enabled: true,
  showNameMatches: true, // arXiv full-name matches without extra evidence (faded logo)
  scoring: null, // null = core.DEFAULT_SCORING; see the popup's "Scoring" section
  excludedPapers: [],
  notThem: { names: [], scholarIds: [] },
  confirmedScholarIds: {},
};

const REPO = 'Ironieser/banjev';
const DATA_URL = `https://raw.githubusercontent.com/${REPO}/main/data/papers.json`;

async function getState() {
  const s = await chrome.storage.local.get(['papers', 'curation', 'updatedAt', 'lastError', 'settings']);
  if (!s.papers || !s.curation) {
    const snap = await (await fetch(chrome.runtime.getURL('data/papers.json'))).json();
    Object.assign(s, fromSnapshot(snap));
    await chrome.storage.local.set({ papers: s.papers, curation: s.curation, updatedAt: s.updatedAt });
  }
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  return s;
}

function fromSnapshot(snap) {
  return {
    papers: snap.papers,
    curation: { banAuthors: snap.banAuthors || [], allowAuthors: snap.allowAuthors || [], scholarProfiles: snap.scholarProfiles || {} },
    updatedAt: snap.updatedAt,
  };
}

// The repo's data/papers.json is the curated source of truth: a GitHub Action
// refreshes it from arXiv every 6 hours and applies data/manual.json.
async function refresh() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('GitHub HTTP ' + res.status);
    const snap = await res.json();
    if (!Array.isArray(snap.papers) || !snap.papers.length) throw new Error('empty list');
    await chrome.storage.local.set({ ...fromSnapshot(snap), lastError: null, checkedAt: new Date().toISOString() });
    return { ok: true, count: snap.papers.length };
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
      case 'learnProfile': // Scholar profile verified by evidence on the profile page
        return updateSettings((s) => {
          s.confirmedScholarIds[msg.scholarId] = msg.key;
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
