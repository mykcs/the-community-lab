# Bilingual questionnaire and official-result equivalence

稳定 ID：`bilingual-questionnaire-parity`；范围：/questionnaire/。

## 目标与来源

让不懂韩文的读者在同季、同版本题目与选项下理解原题、完成答题，并在证据充分时取得与官方同输入完全一致的结果。

依据：[现有 Wish](../../WISH.md)、[现有 Design](../workstreams/SITEWIDE-DESIGN-20261120.md)，2026-11-26 按已有仓库内容整理；不引用私人聊天，不宣称获得新的用户批准。

## 保护的体验与语义

题干和选项保持韩文原文在前、忠实简体中文在后；保留原始题目 ID、选项值、版本、来源、授权与独立审校。原创示例、未审校试填和已核验结果严格区分，不用猜测评分冒充官方等价。保留答题隐私。

允许更优布局、交互和技术实现；保留上述来源明确的目标。新目标或被否定方案应记录来源及时间；不得将暂时做不到的能力从意图中删除。

## 实现与验收

[现有页面](../../src/pages/questionnaire/index.astro) · [Design](../workstreams/SITEWIDE-DESIGN-20261120.md) · [Dev / 验收入口](../dev/README.md) · [专用核验矩阵](../VERIFICATION-MATRIX.md)。

按核验矩阵检查逐题逐选项、条件路径、官方完整输入输出金标准、两季隔离及桌面手机流程；缺一项保持未验证。不得把本次文档接入视为官方等价或授权证据。

状态：意图来源已核对；本次只接入文档，不改变网站代码或重新验收当前生产功能。后续改版按既有真实测试和用户反馈更新证据；未验证项保持明确。
