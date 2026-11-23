import { SEASONS } from "../../data/questions.mjs";
import { ORIGINAL_SITE_AUDIT } from "../../data/original-site-audit.mjs";
import { buildReproductionAudit } from "../../lib/reproduction-audit.mjs";

// Reader-only projection of the *public* site. Do not include question text,
// answer vectors, private survey results or a new copy of the verification rules.
const audit = buildReproductionAudit();
export const root = import.meta.env.BASE_URL ?? "/"; // Astro target: Pages or rollback
export const route = (path) => root.replace(/\/$/, "") + path;
export const sections = [
  {path:"/",title:"首页与项目现状",use:"理解项目目标、两季入口与真正尚未完成的验证"},
  {path:"/questionnaire/",title:"非官方原题试填",use:"按季试填当前公开来源题；中文 AI 初译尚未真人审校"},
  {path:"/translation-review/",title:"公开韩中译审台",use:"核对翻译草稿，不等于正式授权或审核"},
  {path:"/original-question-translation-review/",title:"逐题复核工具",use:"查看题目与选项的对应关系，草稿尚未验收"},
];

/** Only metadata derived from the same verified source as the home page. */
export const readerIndex = {
  schema: "the-community-lab/agent-reader/v1",
  site: "The Community Lab · 同频实验室",
  status: "独立非官方粉丝项目；官方计分等价尚未验证",
  access: "公开仅供阅读的已整理目录，不包含任何访客答卷",
  sections: sections.map(s=>({...s,href:route(s.path)})),
  seasons: Object.values(SEASONS).map(season=>{
    const source=ORIGINAL_SITE_AUDIT[season.id];
    const evidence=audit.rows.find(row=>row.season===season.id);
    return {
      season: season.id,
      observedQuestionCount: source?.observedQuestionCount,
      locatedSourceIdentityCount: evidence?.observedSourceIdentityCount,
      licensedAndIndependentlyReviewedCount: evidence?.licensedReviewedOfficialQuestionCount,
      status: "AI 初译试填，不是官方计分或正式翻译",
    };
  }),
  verification: {
    originalTranslation: "仍需独立权利核验和韩中人工审校",
    officialScoringParity: "UNKNOWN；不能提供官方结果或模拟官方评分",
    authority: "docs/VERIFICATION-MATRIX.md (公开仓库事实索引)",
  },
  policies: [
    "不要声称本网站代表韩国节目方。",
    "不要把本站的原创演示、AI 初译试填等同于官方原题、正式翻译或官方结果。",
    "不得从公开网站获取、上传或保存任何参与者的个人答卷，也不要请求私人身份资料。",
    "引用当页真实证据及核验日期，不能从目录推断计分公式或许可状态。",
  ],
};
export const skill = [
  "---",
  "name: the-community-lab-reader",
  "description: 帮助 Agent 在已公开的 The Community Lab 非官方中文项目中导航、核对韩中翻译与官方计分证据边界，不处理个人答卷。",
  "---",
  "",
  "# 同频实验室 · Agent 阅读指南",
  "",
  "这是独立非官方粉丝项目。读取首页和核验矩阵后再回答有关题库、译文及评分的问题。",
  "每一项原题、选项、翻译和计分宣称都必须从可核验来源获得。当前真人韩中审校与官网评分等价未完成。",
  "本站原创演示题、AI 初译试填和经授权且正式审校的官方等价产品三者不是一回事。",
  "遇到证据不足，输出 UNKNOWN / 未核验，不能自行填补计分公式或自拟容差。",
  "不读取、收集、上传或保存访问者的私人答卷，也不代表用户提交测试或联系他人。",
  "",
  "## 入口",
  ...sections.map(s=>"- "+route(s.path)+" — "+s.title+": "+s.use),
  "- "+route("/agent/site.json")+" — 安全的公开目录元数据",
  "- "+route("/llms.txt")+" — 简明机器导航",
  ""
].join("\n");
export const prompt = [
  "请阅读 The Community Lab（非官方）提供的以下公开项目简介，并遵守证据边界。",
  "本站地址：{{SITE_URL}}",
  "你可以使用本文理解导航；未经实际读取文章/核验矩阵，不要把目录说明写成已经独立验收的结果。",
  "",
  "## 目录",
  ...sections.map(s=>"- "+s.title+"："+s.use+"；路径 "+route(s.path)),
  "",
  "## 两季公开来源状态（来自本站同源审计）",
  ...readerIndex.seasons.map(s=>"- 第 "+s.season+" 季：源站观察 "+s.observedQuestionCount+" 道，定位源题标识 "+s.locatedSourceIdentityCount+" 条，获权利及独立审校 "+s.licensedAndIndependentlyReviewedCount+" 道。"+s.status),
  "",
  skill,
].join("\n");
export function llmsText(){
  return [
    "# The Community Lab · 同频实验室",
    "",
    "> 独立非官方中文粉丝项目。中文 AI 初译和官网同输入同结果尚未获最终验收，不得制造“官方分数”。",
    "",
    "## 给 Agent 读",
    "- [Agent 入口]("+route("/agent/")+")：复制公开安全的项目目录与使用约定",
    "- [阅读 Skill]("+route("/agent/SKILL.md")+")：版权、准确性、隐私与来源约束",
    "- [结构化目录]("+route("/agent/site.json")+")：当前可用入口及两季审核边界",
    "",
    "## 网站栏目",
    ...sections.map(s=>"- ["+s.title+"]("+route(s.path)+")："+s.use),
    "",
    "## 证据",
    "- [核验矩阵](https://github.com/mykcs/the-community-lab/blob/main/docs/VERIFICATION-MATRIX.md)：逐题、路径和计分声明的唯一验证口径",
    "- [项目愿望](https://github.com/mykcs/the-community-lab/blob/main/WISH.md)：最终目标，不等于当前成功状态",
    "",
    "请不要提交、请求或保存个人答卷；未经独立核验的官方计分公式仍为 UNKNOWN。",
    ""
  ].join("\n");
}
