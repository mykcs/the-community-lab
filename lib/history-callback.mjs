import { browserHistoryConfig, historyContext, consumeExpectedLogin, clearLoginHandoff } from './history-browser.mjs';
import { readPendingHistory, clearPendingHistory } from './history-handoff.mjs';
import { clearPkceStorage } from './history-auth-storage.mjs';

const status = document.getElementById('callback-status');
const returned = window.communityOAuthReturn;
delete window.communityOAuthReturn;
let exchanged = false;
async function finish() {
  const config = browserHistoryConfig();
  if (!config.configured || window.location.pathname.replace(/\/$/, '') !== config.callbackPath.replace(/\/$/, '')) {
    clearLoginHandoff(); throw new Error('登录尚未启用，未保存结果。');
  }
  const flow = consumeExpectedLogin();
  if (returned?.rejected || !returned?.code || !flow) {
    clearLoginHandoff(); throw new Error('登录已取消、过期或不是从本标签页发起。未保存结果，请重新开始。');
  }
  const { client, service } = await historyContext();
  // detectSessionInUrl is false. This is the only code exchange call.
  if (exchanged) return;
  exchanged = true;
  const { error } = await client.auth.exchangeCodeForSession(returned.code, { flowId: flow.flowId });
  returned.code = null;
  clearPkceStorage(window.sessionStorage);
  if (error) { clearLoginHandoff(); throw new Error('无法确认这次 GitHub 登录，未保存结果，请重新登录。'); }
  await service.requireActive();
  const pending = readPendingHistory(window.sessionStorage);
  if (!pending) { status.textContent = '已登录。登录本身不会保存结果，可前往私人历史。'; return; }
  if (!config.saveAvailable) {
    clearPendingHistory(window.sessionStorage);
    status.textContent = '已登录，但新增保存暂未开放，交接结果已清除。已有记录仍可查看、导出或删除。'; return;
  }
  try {
    await service.save(pending.payload);
  } catch {
    status.textContent = '已登录，但未能确认保存。交接期限内可前往私人历史重新确认保存或取消；不会自动重试。';
    return;
  }
  try {
    clearPendingHistory(window.sessionStorage);
    status.textContent = '已确认保存你此前同意的这次示例结果，可前往私人历史查看、导出或删除。';
  } catch {
    status.textContent = '服务器已确认保存，但浏览器未确认清除暂存结果。请关闭当前标签页，再打开私人历史查看。';
  }
}
finish().catch(error => { status.textContent = error.message || '登录未完成，请重新开始。'; });
