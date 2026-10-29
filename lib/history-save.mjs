import { browserHistoryConfig, historyContext, startGithubLogin, clearLoginHandoff } from './history-browser.mjs';
import { toHistoryPayload } from './history-contract.mjs';
import { writePendingHistory, clearPendingHistory } from './history-handoff.mjs';

function element(tag, text, className = '') {
  const el = document.createElement(tag); el.textContent = text; el.className = className; return el;
}

export function addHistorySaveAction(actions, result) {
  const config = browserHistoryConfig();
  if (!config.saveAvailable) return;
  const open = element('button', '选择保存这次结果', 'button button-outline');
  open.type = 'button'; actions.append(open);
  open.addEventListener('click', () => {
    const dialog = document.createElement('dialog');
    dialog.className = 'history-dialog'; dialog.setAttribute('aria-labelledby', 'save-history-title');
    const title = element('h2', '要把这次示例结果存到私人历史吗？'); title.id = 'save-history-title';
    const details = element('p', `将使用 GitHub 登录，由 Supabase 处理账号标识及 GitHub 提供的资料／邮箱。只保存本次季别、版本和维度分数，不保存逐题答案。数据区域：${config.regionLabel}；保存期限：${config.retentionLabel}。`);
    const handoff = element('p', '登录跳转前，分数会暂存在当前标签页。15 分钟后不能再用；返回网站时检查并清理，关闭标签页也会清除。你可以导出、删除记录或注销本站账号。');
    const privacy = element('a', '阅读隐私说明 →'); privacy.href = '/privacy'; privacy.target = '_blank'; privacy.rel = 'noopener noreferrer';
    const form = document.createElement('form');
    const label = element('label', '', 'history-consent');
    const consent = document.createElement('input'); consent.type = 'checkbox'; consent.required = true;
    label.append(consent, element('span', '我同意保存这次价值观示例结果，并已阅读隐私说明。'));
    const status = element('p', '', 'history-status'); status.setAttribute('role', 'status');
    const submit = element('button', '同意并继续', 'button button-primary'); submit.type = 'submit';
    const cancel = element('button', '暂不保存', 'button button-outline'); cancel.type = 'button';
    const controls = element('div', '', 'history-actions'); controls.append(submit, cancel);
    form.append(label, status, controls); dialog.append(title, details, handoff, privacy, form);
    document.body.append(dialog); dialog.showModal();
    let busy = false, preparedPayload = null;
    const cancelSave = () => {
      if (busy) return;
      try { clearLoginHandoff(); dialog.close(); }
      catch (error) { status.textContent = error.message; }
    };
    cancel.addEventListener('click', cancelSave);
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancelSave(); });
    dialog.addEventListener('close', () => { dialog.remove(); open.focus(); }, { once: true });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !consent.checked) return;
      busy = true; submit.disabled = true; cancel.disabled = true; status.textContent = '正在确认登录与保存权限…';
      try {
        preparedPayload ??= toHistoryPayload(result, { consent: true, requestId: crypto.randomUUID() });
        const payload = preparedPayload;
        const { client, service } = await historyContext();
        const session = await client.auth.getSession();
        if (session.error) throw new Error('无法确认登录状态，请稍后重试。');
        if (session.data.session) {
          await service.save(payload);
          clearPendingHistory(window.sessionStorage);
          status.textContent = '已保存。你可以在私人历史中查看、导出或删除。';
          submit.hidden = true; consent.disabled = true; cancel.textContent = '关闭';
          const link = element('a', '打开私人历史 →'); link.href = '/history'; status.append(' ', link);
        } else {
          writePendingHistory(window.sessionStorage, payload, { consent: true });
          await startGithubLogin({ preservePending: true });
        }
      } catch (error) { status.textContent = error.message || '保存未完成，请重试。'; }
      finally { busy = false; submit.disabled = false; cancel.disabled = false; }
    });
  });
}
