# 部署与持续集成 · 2026-10-29 更新

## 当前线上确切版本（有证据）

- 正式网址：<https://the-community-lab.vercel.app/>，现已部署 **Astro + Tailwind** 的韩中双语独立原创演示版，非节目官方复刻。
- GitHub 权威源码：`mykcs/the-community-lab` `main` 提交 `1740ee7431b286f6c899cf1c4166ed0966568b35`（[已合并 PR #4](https://github.com/mykcs/the-community-lab/pull/4)）。
- 生产 Vercel 部署：[dpl_DofTF4BAwFYCXDXhtKu5SkDGFL4P](https://vercel.com/wangrui92-team/the-community-lab/DofTF4BAwFYCXDXhtKu5SkDGFL4P)，`READY`，`target=production`，`source=cli`，`meta.githubCommitSha` 与以上 `main` SHA 完全一致；正式域名已被 Vercel 绑定到此部署。
- 预览构建：[dpl_FWYcdLgnf7pzx6VVbszhqr5okbq9](https://vercel.com/wangrui92-team/the-community-lab/FWYcdLgnf7pzx6VVbszhqr5okbq9)，亦为同一 SHA、`READY`。生产/预览由已授权 Mac 的独立临时 checkout 通过 Vercel CLI 部署，无新 Token、付费套餐或第三方服务。
- Vercel **现有项目** `the-community-lab`：框架已配置为 `astro`、构建 `npm run build`、输出 `dist`，Node 为 `24.x`。未创建第二个同名站点。
- GitHub Actions：本次 PR 的最终 head `71975239db298c003319b03dd6864f48eb4a6eb7` 对应 [Verify Astro bilingual demo #40918101519](https://github.com/mykcs/the-community-lab/actions/runs/40918101519) **success**；18/18 测试通过，包括两季 65,600 种原创演示答案组合。
- **真实 Chrome 浏览器复验**：在正式域名和本地构建，分别检查 440×956 CSS px 移动视口及 1440×900 CSS px 桌面，双季完整答题、韩文先于中文、结果、暂停/恢复/返回和横向溢出均通过。此为模拟 iPhone 18 Pro Max 的浏览器 CSS 视口，不冒充实体手机。详情见 [实际 QA](QA-2026-10-29.md)。

## GitHub → Vercel 自动部署仍未完成（独立 P1 缺口）

**重要：生产网站确已更新，不代表自动发布已经实现。** 2026-10-29 本轮从已有 Git 项目执行 `vercel git connect https://github.com/mykcs/the-community-lab --scope wangrui92-team`，Vercel 实际返回：

> Failed to connect mykcs/the-community-lab to project. Make sure there aren't any typos and that you have access to the repository if it's private.

当前 Vercel GitHub namespace `mykcs` 为 `isAccessRestricted=true`，项目搜索 `the-community-lab` 返回空；同一团队其他三个已有 GitHub 关联项目可见。**这支持「Vercel GitHub App 尚不能访问新仓库」的判断，但不能仅凭该错误断言唯一根因。** 仓库本身为公开仓库且 GitHub Git 正常读取。此失败不是 Astro 构建或生产网站故障。

下一步在现有项目上完成授权和验证（不是再创建一个 Vercel 项目）：

1. 由 GitHub 安装管理员在 **GitHub → Settings → Applications → Installed GitHub Apps → Vercel → Configure** 核查是否按 selected repositories 限制授权；仅为 `mykcs/the-community-lab` 添加 Vercel App 的仓库访问（不新建宽范围 token，不申请无关 repo scope）。若安装管理员和调用 Agent 权限不同，停在平台的人类授权界面。
2. 然后在 **Vercel → the-community-lab → Settings → Git** 将现有项目连接到 `mykcs/the-community-lab`，生产分支指向 `main`；也可以重新运行官方 `vercel git connect`，但必须以平台实际成功回应为准。
3. 做一次独立验证：从 PR 提交触发 Vercel Preview，确认完成构建与精确 commit SHA；随后合并一个经 CI 通过的安全变更，确认 Vercel **由 Git 自动触发** Production、部署 SHA 与 `main` 相符，域名上的版本更新，移动端回归无异常。只看到「连接成功」还不足以标记自动部署完成。

目前不修改 GitHub 账户的安装授权，不借用其它仓库的 token，不关闭已有保护。问题追踪为 [Issue #3](https://github.com/mykcs/the-community-lab/issues/3)。

## 历史与当前安全边界

首版无依赖静态网站于 2026-10-29 通过 Vercel API 直接文件部署且状态 `READY`，该状态**只属于旧快照**；随后合并上述 Astro 版本，进行了本次精确 SHA 手动生产部署与实测。不要再以旧的部署说明判断当前正式站点。

访客无需登录即可做原创演示题，答案保留在当前浏览器内存，关闭／刷新即失效；尚无用户账号、数据库、追踪、上传真实答卷。节目原题的合法复制、官方评分金标准、真实嘉宾数据、韩中独立人工双语审校均未完成。GitHub OAuth 和云端私有历史记录必须先单独完成用户隐私同意、会话权限、RLS、双账号隔离与删除读回验收，不能仅凭本轮网页/部署测试开启。

初始预算继续保持不增加付费订阅；Vercel Hobby 的实际条款与额度由当前账户和平台负责确认。
