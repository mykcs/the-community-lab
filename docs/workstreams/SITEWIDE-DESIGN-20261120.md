# The Community Lab 全站排版与年月日统一

> Draft · TASK SPEC ONLY · Implementation: NOT DONE
> Size: M · Confidence: medium

## 目标和范围

维护者于2026年11月20日要求：所有网页实际消费本站统一的字体、字号、字重、行距、间距与年月日规范。跨网站保留独立风格。必须实现、验证并合并 main，规范文件本身不代表交付。

## 当前事实与去重

两份独立 reviewer HTML 完全绕过主站样式；首页、问卷、reviewer 存在独立字号/间距。#11 为无关历史归档。

## 既有 owner 与实施

src/styles/global.css、Astro 页面与 docs/translation-review/index.html、docs/original-question-translation-review/index.html 的嵌入样式。

四个已部署路由以及 file:// 离线 reviewer 都引用一个本站规则源；用构建同步的嵌入 CSS 保持离线及严格 CSP；不增加远程字体/脚本或放宽 CSP；问卷题文、选项、评分、review 状态保持科学语义。

## 验收合同

- [ ] 语义 typography/spacing tokens 在既有 owner 维护；真实消费者迁入，重复定义退役；必要角色变体有说明。
- [ ] 从 build 枚举全部 HTML，src 和两个 docs reviewer 及独立/跳转页全部有可检查的样式归属，新增漏接页面会失败。
- [ ] 完整中文日期 YYYY年M月D日、英文 YYYY-MM-DD；年/月精度不补造日；具体时间保留时区。机器 ISO、URL、代码、datetime 和原始证据不改。
- [ ] 全部路由桌面与 440×956 CSS px 手机渲染，无文档横向溢出或文字裁切；动态交互、语言、主题和主要角色截图验收。
- [ ] 检查包含漏接样式和错误日期的已知坏例，不以规则文件存在当 PASS。
- [ ] npm ci && npm run check && npm run build && npm run test:browser；必要时同步已有 CSP hash；GitHub Pages /the-community-lab/ 是正式站，Vercel 自动部署保持禁用。
- [ ] 当前 head 的既有必要检查通过，更新证据后转 Ready、合并 main，读回 merge SHA；部署身份另行核实。

## 执行和恢复

单一写入者；独立于其他站点，按总工作优先级推进。已获实现、验证、合并授权；不改研究/问卷事实、隐私保护、权限或 hosting authority。回退为本 PR 逆向改动。下一步读取上述 owners 与实际生成路由。

## 证据

仅合同已创建；实现 NOT DONE；构建/浏览器 NOT RUN。完成实施后补实际命令、覆盖数与结果。
