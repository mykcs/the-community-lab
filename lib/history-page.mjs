import { browserHistoryConfig, historyContext, startGithubLogin, clearLoginHandoff, downloadHistory } from './history-browser.mjs';
import { readPendingHistory, clearPendingHistory } from './history-handoff.mjs';
import { SEASONS } from '../data/questions.mjs';

const $ = id => document.getElementById(id);
const config = browserHistoryConfig();
let context, generation = 0, cursor = null, operation = null;
const listed = new Set();
function element(tag, text, className = '') { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; }
function message(text) { $('account-status').textContent = text; }
function clearPrivate() {
  const moveFocus = $('account-private').contains(document.activeElement) ||
    [...document.querySelectorAll('dialog[data-private]')].some(dialog => dialog.contains(document.activeElement));
  $('account-private').hidden = true; $('history-list').replaceChildren();
  $('history-more').hidden = true; $('history-empty').hidden = true; $('pending-history').hidden = true;
  $('pending-history').reset(); cursor = null; listed.clear();
  document.querySelectorAll('dialog[data-private]').forEach(dialog => dialog.remove());
  if (moveFocus) $('history-title').focus({ preventScroll: true });
}
async function action(work) {
  const epoch = generation;
  if (operation?.epoch === epoch) return;
  const owner = { epoch }; operation = owner;
  try { await work(() => epoch === generation); }
  catch (error) { if (epoch === generation) message(error.message || '操作未完成，请重试。'); }
  finally { if (operation === owner) operation = null; }
}
function appendRecords(rows) {
  for (const row of rows) {
    if (listed.has(row.id)) continue;
    listed.add(row.id);
    const li = element('li', '', 'history-record');
    const season = SEASONS[row.season];
    li.append(element('h3', `${row.season === 1 ? '第一季' : '第二季'} · 原创示例`),
      element('p', `保存于 ${new Date(row.created_at).toLocaleString('zh-CN')}`));
    const scores = document.createElement('dl');
    for (const dimension of row.dimensions) {
      const item = document.createElement('div');
      item.append(element('dt', season.axes.find(axis => axis.id === dimension.id)?.name || dimension.id),
        element('dd', `${dimension.score > 0 ? '+' : ''}${dimension.score}`)); scores.append(item);
    }
    li.append(scores, element('p', `题库 ${row.question_version} / 计分 ${row.scoring_version} / 译文 ${row.translation_version}`, 'history-version'));
    const remove = element('button', '删除这条记录', 'button button-outline'); remove.type = 'button';
    remove.addEventListener('click', () => confirmDialog('删除这条示例记录？', '删除后无法恢复。服务器确认已无该条记录后，才会从列表移除。', '确认删除', async valid => {
      await context.service.deleteRun(row.id);
      if (!valid()) return;
      li.remove(); listed.delete(row.id); message('服务器已确认删除这条记录。');
    }, remove));
    li.append(remove); $('history-list').append(li);
  }
}
function confirmDialog(titleText, detail, submitText, work, trigger) {
  const dialog = document.createElement('dialog'); dialog.className = 'history-dialog'; dialog.dataset.private = 'true';
  const title = element('h2', titleText); title.id = 'history-confirm-title'; dialog.setAttribute('aria-labelledby', title.id);
  const form = document.createElement('form');
  const label = element('label', '', 'history-consent'); const check = document.createElement('input'); check.type = 'checkbox'; check.required = true;
  label.append(check, element('span', '我理解此操作无法恢复，并确认继续。'));
  const submit = element('button', submitText, 'button button-primary'); submit.type = 'submit';
  const cancel = element('button', '取消', 'button button-outline'); cancel.type = 'button';
  const status = element('p', '', 'history-status'); status.setAttribute('role', 'status');
  const controls = element('div', '', 'history-actions'); controls.append(submit, cancel);
  form.append(label, status, controls); dialog.append(title, element('p', detail), form); document.body.append(dialog); dialog.showModal();
  let running = false;
  cancel.addEventListener('click', () => { if (!running) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (running) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); if (trigger.isConnected) trigger.focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!check.checked || running || operation?.epoch === generation) return;
    action(async valid => {
      running = true; submit.disabled = true; cancel.disabled = true;
      try { await work(valid); if (valid()) dialog.close(); }
      catch (error) { if (valid()) status.textContent = error.message || '尚未确认完成，请重试。'; }
      finally { running = false; submit.disabled = false; cancel.disabled = false; }
    });
  });
}
async function load(valid, after = null) {
  const page = await context.service.listPage(after);
  if (!valid()) return;
  appendRecords(page.rows); cursor = page.cursor;
  // A provider may cap pages below our limit. Only an empty page proves end.
  $('history-more').hidden = !page.rows.length;
  $('history-empty').hidden = listed.size !== 0;
}
async function refresh() {
  const epoch = ++generation; clearPrivate(); message('正在确认登录与本人记录…');
  try {
    await context.service.requireActive();
    if (epoch !== generation) return;
    $('account-login').hidden = true; $('account-private').hidden = false;
    await load(() => epoch === generation);
    if (epoch !== generation) return;
    const pending = readPendingHistory(window.sessionStorage);
    $('pending-history').hidden = !pending || !config.saveAvailable;
    message('只显示当前账号的记录。');
  } catch (error) {
    if (epoch !== generation) return;
    clearPrivate(); $('account-login').hidden = false;
    message(error.message || '无法读取私人历史，请重新登录或重试。');
  }
}

if (config.configured) {
  $('account-unavailable').hidden = true; $('account-login').hidden = false;
  historyContext().then(value => {
    context = value;
    context.client.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      ++generation; clearPrivate(); message('登录状态已变化，正在重新确认…');
      if (event === 'SIGNED_OUT') { $('account-login').hidden = false; message('已退出登录。'); return; }
      // Supabase Auth callbacks must not await another Auth method under lock.
      setTimeout(refresh, 0);
    });
    refresh();
  }).catch(error => message(error.message));
}
$('history-login').addEventListener('click', () => action(async () => { message('正在前往 GitHub…'); await startGithubLogin(); }));
$('history-cancel-login').addEventListener('click', () => action(async () => { clearLoginHandoff(); message('已取消本标签页的登录交接并清除待保存结果。'); }));
$('history-more').addEventListener('click', () => action(valid => load(valid, cursor)));
$('history-export').addEventListener('click', () => action(async valid => {
  message('正在读取全部分页，完成前不会生成文件…');
  const records = await context.service.exportAll();
  if (valid()) { downloadHistory(records); message(`已导出全部 ${records.length} 条记录。请自行保管下载文件。`); }
}));
$('history-signout').addEventListener('click', async () => {
  ++generation; clearPrivate(); $('account-login').hidden = false;
  // Logout must remain available even while another request is in flight.
  let cleanupError = null;
  try { clearLoginHandoff(); } catch (error) { cleanupError = error; }
  try {
    await context.service.signOut();
    message('服务器已确认退出本次登录。' + (cleanupError ? '浏览器未确认清除交接缓存，请关闭当前标签页。' : ''));
  } catch { message('服务器尚未确认退出，请重试。' + (cleanupError ? '浏览器也未确认清除交接缓存，请关闭当前标签页。' : '')); }
});
$('pending-history').addEventListener('submit', event => {
  event.preventDefault(); if (!$('pending-history').querySelector('input').checked) return;
  action(async valid => {
    const pending = readPendingHistory(window.sessionStorage);
    if (!pending || !config.saveAvailable) throw new Error('交接已失效或新增保存已关闭，未保存结果。');
    await context.service.save(pending.payload);
    if (!valid()) return;
    clearPendingHistory(window.sessionStorage); await refresh(); message('已确认保存此前同意的示例结果。');
  });
});
$('pending-cancel').addEventListener('click', () => action(async () => { clearPendingHistory(window.sessionStorage); $('pending-history').hidden = true; message('已清除待保存结果。'); }));
$('history-remove-account').addEventListener('click', () => {
  const trigger = $('history-remove-account');
  confirmDialog('永久注销本站账号？', '将删除本站账号和全部历史结果。你可以先取消并导出。GitHub 账号不受影响。', '永久注销本站账号', async valid => {
    const { data, error } = await context.client.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('登录已失效，请重新登录。');
    await context.service.requireActive();
    if (!valid()) throw new Error('登录状态已变化，请重新确认。');
    const response = await fetch('/api/account-delete', { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ confirm: 'DELETE_MY_ACCOUNT' }) });
    const result = await response.json();
    if (response.status !== 200 || result.deleted !== true || result.pendingVerification !== false) {
      throw new Error(result.pendingVerification ? '已发起注销，但尚未确认全部删除，请稍后重新检查。' : '注销未完成，请重试。');
    }
    if (!valid()) return;
    ++generation; clearPrivate(); clearLoginHandoff();
    // Server deletion is already verified; a local cleanup failure must not
    // pretend that the deleted server identity still exists.
    try { await context.client.auth.signOut({ scope: 'local' }); } catch { /* show server-confirmed result below */ }
    $('account-login').hidden = false; message('服务端已确认注销本站账号，并确认其历史记录为空。');
  }, trigger);
});
