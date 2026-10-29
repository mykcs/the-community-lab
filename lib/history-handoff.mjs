import { validateHistoryPayload } from './history-contract.mjs';

export const PENDING_HISTORY_KEY = 'community-pending-history-v1';
export const PENDING_HISTORY_TTL_MS = 15 * 60 * 1000;

// This storage is used only after the visitor actively agrees to saving. The
// timestamp limits use after returning from OAuth; it is not server retention.
export function writePendingHistory(storage, payload, { consent = false, now = Date.now() } = {}) {
  if (consent !== true) throw new Error('请先明确同意保存这次结果');
  validateHistoryPayload(payload);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('暂存时间无效');
  const pending = { version: 1, createdAt: now, expiresAt: now + PENDING_HISTORY_TTL_MS, payload };
  try { storage.setItem(PENDING_HISTORY_KEY, JSON.stringify(pending)); }
  catch { throw new Error('浏览器无法暂存登录交接，请保持此页面并重试。'); }
  return pending;
}

export function clearPendingHistory(storage) {
  try { storage.removeItem(PENDING_HISTORY_KEY); }
  catch { throw new Error('浏览器未确认清除暂存结果，请关闭当前标签页。'); }
}

export function readPendingHistory(storage, now = Date.now()) {
  try {
    const raw = storage.getItem(PENDING_HISTORY_KEY);
    if (raw === null) return null;
    const pending = JSON.parse(raw);
    if (!pending || Array.isArray(pending) ||
        Object.keys(pending).sort().join(',') !== 'createdAt,expiresAt,payload,version' ||
        pending.version !== 1 || !Number.isSafeInteger(now) ||
        !Number.isSafeInteger(pending.createdAt) || !Number.isSafeInteger(pending.expiresAt) ||
        pending.createdAt < 0 || pending.createdAt > now || pending.expiresAt <= now ||
        pending.expiresAt - pending.createdAt !== PENDING_HISTORY_TTL_MS) throw new Error('invalid');
    validateHistoryPayload(pending.payload);
    return pending;
  } catch {
    clearPendingHistory(storage);
    return null;
  }
}
