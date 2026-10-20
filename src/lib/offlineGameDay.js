const OUTBOX_KEY = "pickleflow-game-day-outbox-v1";
const CACHE_PREFIX = "pickleflow-game-day-cache-v1:";

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
    // The live in-memory state remains usable when storage is unavailable.
  }
}

export function pendingGameDayOperations(eventId) {
  if (typeof window === "undefined") return [];
  return readJson(OUTBOX_KEY, []).filter((item) => item.eventId === eventId);
}

export function enqueueGameDayOperation(eventId, type, payload) {
  const operation = {
    id: crypto.randomUUID(),
    eventId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  const outbox = readJson(OUTBOX_KEY, []);
  outbox.push(operation);
  writeJson(OUTBOX_KEY, outbox);
  return operation;
}

export function acknowledgeGameDayOperation(operationId) {
  writeJson(
    OUTBOX_KEY,
    readJson(OUTBOX_KEY, []).filter((item) => item.id !== operationId),
  );
}

export function cacheGameDayState(eventId, state) {
  if (typeof window === "undefined") return;
  writeJson(`${CACHE_PREFIX}${eventId}`, {
    ...state,
    cachedAt: new Date().toISOString(),
  });
}

export function getCachedGameDayState(eventId) {
  if (typeof window === "undefined") return null;
  return readJson(`${CACHE_PREFIX}${eventId}`, null);
}
