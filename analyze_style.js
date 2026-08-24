#!/usr/bin/env node
/**
 * analyze_style.js —— 历年命题风格模型提取（大数据基线）
 * 读取 data_*.js，从写作/翻译/阅读/听力中挖掘：
 *   - 主题词频（历年真题覆盖的高频主题，用于新题契合度比对）
 *   - 写作题型分布、类别分布、Directions 结构
 *   - 阅读题型(skill)分布、每篇题量、篇幅特征
 *   - 听力题量与 ref 命中率
 * 输出 style_model.json，供 screen_topics.js 做"筛选比对"。
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

// 1) 载入现有题库（伪装 window 全局）
global.window = {};
for (const f of ['data_writing.js','data_translation_a.js','data_translation_b.js','data_reading.js','data_listening.js']) {
  const p = path.join(DIR, f);
  if (fs.existsSync(p)) require(p);
}
const B = global.window.BANK || {};

// 2) 主题词典（用于把任意文本映射到六级高频主题）
const THEMES = {
  '科技/AI':      ['ai','人工智能','科技','技术','创新','数字','智能','机器人','芯片','算力','互联网','软件','自动化','大模型','数据'],
  '环境/双碳':    ['环境','绿色','碳','能源','可再生','生态','气候','污染','可持续','节能','减排','风电','光伏','自然'],
  '就业/社会':    ['就业','工作','职业','毕业生','青年','社会','养老','人口','民生','失能','护理','招聘','失业','劳动力'],
  '文化/教育':    ['文化','教育','非遗','传统','历史','文学','艺术','语言','学习','学校','师生','知识','传承','国潮'],
  '经济/贸易':    ['经济','贸易','消费','出口','进口','增长','市场','产业','企业','金融','投资','外贸','商品','收入'],
  '心理/健康':    ['心理','健康','医疗','身体','运动','营养','疾病','幸福','压力','医院','卫生','养老','寿命'],
  '品德/价值观':  ['品德','责任','信任','尊重','价值观','诚信','合作','沟通','助人','励志','自律','独立']
};

// 3) 词频统计（对一段文本统计命中主题词次数）
function themeHits(text) {
  const t = (text || '').toLowerCase();
  const out = {};
  for (const [theme, kws] of Object.entries(THEMES)) {
    let n = 0;
    for (const kw of kws) {
      // 中文关键词直接计数出现次数；英文做单词边界匹配
      if (/[\u4e00-\u9fa5]/.test(kw)) {
        n += (t.split(kw).length - 1);
      } else {
        const re = new RegExp('\\b' + kw + '\\b', 'g');
        n += (t.match(re) || []).length;
      }
    }
    if (n > 0) out[theme] = n;
  }
  return out;
}

function addCounts(acc, hits) {
  for (const [k, v] of Object.entries(hits)) acc[k] = (acc[k] || 0) + v;
}

// 4) 写作分析
const writing = B.writing || [];
const writingCats = {};
const writingTypes = {};
const writingThemeFreq = {};
for (const w of writing) {
  writingCats[w.c] = (writingCats[w.c] || 0) + 1;
  writingTypes[w.type] = (writingTypes[w.type] || 0) + 1;
  addCounts(writingThemeFreq, themeHits([w.c, w.t, w.tip].join(' ')));
}

// 5) 翻译分析
const translation = [].concat(B.translation || []);
const transCats = {};
const transThemeFreq = {};
for (const tr of translation) {
  if (tr.c) transCats[tr.c] = (transCats[tr.c] || 0) + 1;
  addCounts(transThemeFreq, themeHits([tr.c, tr.t, tr.zh, tr.en].join(' ')));
}

// 6) 阅读分析
const reading = B.reading || [];
const readThemeFreq = {};
const readSkillFreq = {};
let readQTotal = 0, readLenTotal = 0;
for (const r of reading) {
  addCounts(readThemeFreq, themeHits([r.title, r.passage, r.skillNote].join(' ')));
  for (const q of (r.questions || [])) {
    readQTotal++;
    readSkillFreq[q.skill || '未标注'] = (readSkillFreq[q.skill || '未标注'] || 0) + 1;
  }
  readLenTotal += (r.passage || '').length;
}

// 7) 听力分析
const listening = B.listening || [];
let listenQTotal = 0, listenRefOK = 0;
const listenThemeFreq = {};
for (const l of listening) {
  addCounts(listenThemeFreq, themeHits([l.title, l.transcript].join(' ')));
  for (const q of (l.questions || [])) {
    listenQTotal++;
    if (Array.isArray(q.ref) && q.ref.length) listenRefOK++;
  }
}

// 8) 合并全局主题词频（历年真题"大数据"覆盖画像）
const globalThemeFreq = {};
for (const m of [writingThemeFreq, transThemeFreq, readThemeFreq, listenThemeFreq]) {
  addCounts(globalThemeFreq, m);
}
const topThemes = Object.entries(globalThemeFreq).sort((a, b) => b[1] - a[1]);
const totalThemeHits = Object.values(globalThemeFreq).reduce((a, b) => a + b, 0);
const themeShare = {};
for (const [k, v] of topThemes) themeShare[k] = +(v / totalThemeHits).toFixed(3);

// 9) 输出
const model = {
  generatedAt: new Date().toISOString().slice(0, 10),
  sourceCounts: {
    writing: writing.length,
    translation: translation.length,
    reading: reading.length,
    readingPassages: reading.length,
    readingQuestions: readQTotal,
    listening: listening.length,
    listeningQuestions: listenQTotal
  },
  writing: { categories: writingCats, types: writingTypes, themeFreq: writingThemeFreq },
  translation: { categories: transCats, themeFreq: transThemeFreq },
  reading: {
    skillFreq: readSkillFreq,
    avgQuestionsPerPassage: +(readQTotal / Math.max(1, reading.length)).toFixed(2),
    avgPassageLength: Math.round(readLenTotal / Math.max(1, reading.length)),
    themeFreq: readThemeFreq
  },
  listening: {
    avgQuestionsPerPassage: +(listenQTotal / Math.max(1, listening.length)).toFixed(2),
    refHitRate: +(listenRefOK / Math.max(1, listenQTotal)).toFixed(3),
    themeFreq: listenThemeFreq
  },
  // 历年主题覆盖画像（新题契合度基准）
  historicalThemeShare: themeShare,
  topThemes: topThemes,
  THEMES // 词典，供筛选脚本复用
};

fs.writeFileSync(path.join(DIR, 'style_model.json'), JSON.stringify(model, null, 2), 'utf8');
console.log('=== 历年命题风格模型 ===');
console.log('题库规模:', JSON.stringify(model.sourceCounts));
console.log('写作类别分布:', JSON.stringify(writingCats));
console.log('写作题型分布:', JSON.stringify(writingTypes));
console.log('阅读 skill 分布:', JSON.stringify(readSkillFreq));
console.log('阅读平均篇幅(字符):', model.reading.avgPassageLength, ' 平均每篇题量:', model.reading.avgQuestionsPerPassage);
console.log('听力 ref 命中率:', model.listening.refHitRate);
console.log('历年主题覆盖占比 top:', JSON.stringify(themeShare));
console.log('\n已写出 style_model.json');
