const OUTBOX_KEY = "pickleflow-score-outbox-v1";
const COURT_VIEW_PREFIX = "pickleflow-court-view-v1:";

function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Scoring still works in memory if private browsing blocks storage.
  }
}

export function scoreEntryKey(entry) {
  return `${entry.mode}:${entry.eventId || entry.token}:${entry.gameId}`;
}

export function getPendingScores() {
  if (typeof window === "undefined") return [];
  return readJson(OUTBOX_KEY, []);
}

export function savePendingScore(entry) {
  const normalized = {
    ...entry,
    one: Number(entry.one || 0),
    two: Number(entry.two || 0),
    updatedAt: new Date().toISOString(),
  };
  const key = scoreEntryKey(normalized);
  const outbox = getPendingScores().filter(
    (item) => scoreEntryKey(item) !== key,
  );
  outbox.push(normalized);
  writeJson(OUTBOX_KEY, outbox);
  return normalized;
}

export function removePendingScore(entry) {
  const key = typeof entry === "string" ? entry : scoreEntryKey(entry);
  writeJson(
    OUTBOX_KEY,
    getPendingScores().filter((item) => scoreEntryKey(item) !== key),
  );
}

export function acknowledgePendingScore(entry) {
  const key = scoreEntryKey(entry);
  writeJson(
    OUTBOX_KEY,
    getPendingScores().filter(
      (item) =>
        scoreEntryKey(item) !== key || item.updatedAt !== entry.updatedAt,
    ),
  );
}

export function pendingScoresForEvent(eventId) {
  return getPendingScores().filter(
    (item) => item.mode === "organizer" && item.eventId === eventId,
  );
}

export function pendingScoreForCourt(token, gameId) {
  return getPendingScores().find(
    (item) =>
      item.mode === "court" && item.token === token && item.gameId === gameId,
  );
}

export function cacheCourtView(token, view) {
  if (typeof window === "undefined") return;
  writeJson(`${COURT_VIEW_PREFIX}${token}`, view);
}

export function getCachedCourtView(token) {
  if (typeof window === "undefined") return null;
  return readJson(`${COURT_VIEW_PREFIX}${token}`, null);
}
