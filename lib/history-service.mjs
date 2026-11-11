import { HISTORY_CONSENT_VERSION, HISTORY_SELECT_COLUMNS, validateHistoryPayload, toExportRow } from './history-contract.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HISTORY_PAGE_SIZE = 20;
export class HistoryError extends Error {
  constructor(code, message) { super(message); this.name = 'HistoryError'; this.code = code; }
}
const failure = (code, text) => new HistoryError(code, text);
const changed = () => failure('signed_out', '登录状态已变化，请重新打开私人历史。');
const resultKeys = ['season', 'question_version', 'scoring_version', 'translation_version', 'origin', 'dimensions', 'consent_version', 'client_request_id'];

function cursorFor(row) {
  if (!row || !UUID.test(row.id) || typeof row.created_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) ||
      !Number.isFinite(Date.parse(row.created_at))) {
    throw failure('invalid_record', '服务器返回的记录标识或时间无效。');
  }
  // Preserve PostgreSQL microseconds: Date.toISOString() would skip records.
  return { id: row.id, createdAt: row.created_at };
}
function payloadIdentity(payload) {
  return JSON.stringify(resultKeys.map(key => key === 'dimensions'
    ? payload.dimensions.map(({ id, score }) => [id, score]).sort(([a], [b]) => a.localeCompare(b)) : payload[key]));
}

export function createHistoryService(client) {
  async function capabilities(token = null) {
    let query = client.rpc('history_capabilities');
    if (token) query = query.setHeader('Authorization', `Bearer ${token}`);
    const { data, error } = await query;
    if (error || !data || typeof data.session_active !== 'boolean' || typeof data.capture_enabled !== 'boolean') {
      throw failure('unavailable', '暂时无法确认账号权限，请稍后重试。');
    }
    return data;
  }
  async function currentSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data?.session?.access_token || !data.session.user?.id) throw changed();
    return data.session;
  }
  async function bind() {
    const session = await currentSession();
    const { data, error } = await client.auth.getUser(session.access_token);
    if (error || data?.user?.id !== session.user.id) throw changed();
    const binding = { token: session.access_token, userId: data.user.id };
    const cap = await check(binding);
    return { ...binding, cap };
  }
  async function check(binding) {
    const session = await currentSession();
    // Pin every request to its original token, and discard an in-flight result
    // after any session change. Even a token refresh asks the UI to retry.
    if (session.access_token !== binding.token || session.user.id !== binding.userId) throw changed();
    const cap = await capabilities(binding.token);
    if (!cap.session_active) throw changed();
    const after = await currentSession();
    if (after.access_token !== binding.token || after.user.id !== binding.userId) throw changed();
    return cap;
  }
  const pinned = (query, binding) => query.setHeader('Authorization', `Bearer ${binding.token}`);
  async function requireActive() { return (await bind()).cap; }
  async function listBound(after, binding) {
    await check(binding);
    let query = client.from('test_runs').select(HISTORY_SELECT_COLUMNS)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(HISTORY_PAGE_SIZE);
    if (after) {
      const cursor = cursorFor({ id: after.id, created_at: after.createdAt });
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await pinned(query, binding);
    if (error || !Array.isArray(data)) throw failure('read_failed', '读取历史记录失败，请重试。');
    for (const row of data) { cursorFor(row); toExportRow(row); }
    await check(binding);
    return { rows: data, cursor: data.length ? cursorFor(data.at(-1)) : null };
  }
  async function listPage(after = null) { return listBound(after, await bind()); }
  async function save(payload) {
    validateHistoryPayload(payload);
    const binding = await bind();
    if (!binding.cap.capture_enabled || binding.cap.consent_version !== HISTORY_CONSENT_VERSION) {
      throw failure('capture_closed', '新增保存暂未开放；已有记录仍可查看、导出或删除。');
    }
    const { data, error } = await pinned(client.from('test_runs').insert(payload).select(HISTORY_SELECT_COLUMNS).single(), binding);
    await check(binding);
    if (!error && data) { toExportRow(data); return data; }
    if (error?.code === '23505') {
      const duplicate = await pinned(client.from('test_runs').select(HISTORY_SELECT_COLUMNS)
        .eq('client_request_id', payload.client_request_id).maybeSingle(), binding);
      await check(binding);
      if (!duplicate.error && duplicate.data) {
        toExportRow(duplicate.data);
        if (payloadIdentity(duplicate.data) === payloadIdentity(payload)) return duplicate.data;
      }
    }
    throw failure('save_failed', '保存未完成，请重试；原始逐题答案不会上传。');
  }
  async function deleteRun(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw failure('invalid_record', '记录标识无效。');
    const binding = await bind();
    const before = await pinned(client.from('test_runs').select('id').eq('id', id).maybeSingle(), binding);
    await check(binding);
    if (before.error || !before.data) throw failure('not_found', '无法找到这条本人记录，请刷新列表。');
    const removed = await pinned(client.from('test_runs').delete().eq('id', id), binding);
    if (removed.error) throw failure('delete_failed', '删除未完成，请重试。');
    const after = await pinned(client.from('test_runs').select('id').eq('id', id).limit(1), binding);
    try { await check(binding); } catch { throw failure('delete_unconfirmed', '登录状态已变化，暂时无法确认删除结果；请重新登录并检查。'); }
    if (after.error || !Array.isArray(after.data) || after.data.length) {
      throw failure('delete_unconfirmed', '暂时无法确认删除结果，请重试；此条记录仍显示在列表中。');
    }
    return { deleted: true };
  }
  async function exportAll() {
    const binding = await bind();
    const exported = [], seen = new Set();
    let cursor = null;
    while (true) {
      const page = await listBound(cursor, binding);
      if (!page.rows.length) break;
      for (const row of page.rows) {
        if (seen.has(row.id)) throw failure('export_incomplete', '导出分页未前进，请刷新后重试。');
        seen.add(row.id); exported.push(toExportRow(row));
      }
      cursor = page.cursor;
    }
    await check(binding);
    return exported;
  }
  async function signOut() {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw failure('signout_failed', '服务器尚未确认退出，请重试；页面已隐藏私人记录。');
    return { signedOut: true };
  }
  return { capabilities, requireActive, listPage, save, deleteRun, exportAll, signOut };
}
