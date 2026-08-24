#!/usr/bin/env node
/**
 * screen_topics.js —— 候选话题筛选 / 比对 / 去重（"大数据筛选比对组合"核心）
 * 输入：topics.raw.json（实时爬取的候选话题） + style_model.json（历年命题基线） + 现有题库
 * 逻辑：
 *   1) 契合度 fit      —— 话题主主题在历年真题主题占比中的相对权重（贴合命题传统）
 *   2) 多样性 diversity —— 主主题历年占比越低，越值得补充（填补空白）
 *   3) 时效性 recency  —— 均为 2026 实时热点，给满分；按日期微调
 *   4) 去重 overlap    —— 与现有题库同主题同角度则扣分（避免重复旧题）
 *   选分 = 0.45*fit + 0.25*diversity + 0.20*recency + 0.10*(1-overlap)
 *   最终按"每主题最多保留 N 个"做多样性裁剪，输出 topics.selected.json
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'topics.raw.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(DIR, 'style_model.json'), 'utf8'));
const share = model.historicalThemeShare;
const THEMES = model.THEMES;
const totalShare = Object.values(share).reduce((a, b) => a + b, 0) || 1;

// 现有题库主题占位（用于去重判断）
global.window = {};
for (const f of ['data_writing.js','data_translation_a.js','data_translation_b.js','data_reading.js','data_listening.js']) {
  const p = path.join(DIR, f); if (fs.existsSync(p)) require(p);
}
const B = global.window.BANK || {};
// 现有题库已覆盖的"主题+角度"指纹
const existingFingerprints = [];
for (const w of (B.writing||[])) existingFingerprints.push((w.c||'') + '|' + (w.t||''));
for (const tr of (B.translation||[])) existingFingerprints.push((tr.c||'') + '|' + (tr.t||''));
for (const r of (B.reading||[])) existingFingerprints.push('阅读|' + (r.title||''));
for (const l of (B.listening||[])) existingFingerprints.push('听力|' + (l.title||''));

function themeHits(text) {
  const t = (text || '').toLowerCase();
  const out = {};
  for (const [theme, kws] of Object.entries(THEMES)) {
    let n = 0;
    for (const kw of kws) {
      if (/[\u4e00-\u9fa5]/.test(kw)) n += (t.split(kw).length - 1);
      else { const re = new RegExp('\\b' + kw + '\\b', 'g'); n += (t.match(re) || []).length; }
    }
    if (n > 0) out[theme] = n;
  }
  return out;
}

const results = raw.candidates.map(c => {
  const text = [c.title, c.summary, (c.facts||[]).join(' ')].join(' ');
  const hits = themeHits(text);
  const primary = c.primaryTheme;
  const fitRaw = share[primary] || 0;                 // 历年该主题占比
  const fit = fitRaw / totalShare;                    // 归一化契合度 0~1
  const diversity = 1 - (fitRaw / Math.max(...Object.values(share))); // 占比越低多样性越高
  const year = parseInt((c.date||'2026').slice(0,4), 10);
  const recency = year >= 2026 ? 1 : (year === 2025 ? 0.7 : 0.4);
  // 去重：主主题是否已在现有题库高频出现（如 AI、renewable 等）
  const overlapThemeCount = existingFingerprints.filter(fp => fp.split('|')[0] === primary.split('/')[0]).length;
  const overlap = Math.min(1, overlapThemeCount / 12); // 超过12处同主题视为强重叠
  const score = +(0.45*fit + 0.25*diversity + 0.20*recency + 0.10*(1-overlap)).toFixed(3);
  return { ...c, hits, fit:+fit.toFixed(3), diversity:+diversity.toFixed(3), recency, overlap:+overlap.toFixed(3), score };
});

// 排序
results.sort((a, b) => b.score - a.score);

// 多样性裁剪：每主主题最多保留 1 个（优先高分），保证选题不扎堆
const MAX_PER_THEME = 1;
const chosen = [];
const perTheme = {};
for (const r of results) {
  const key = r.primaryTheme;
  if ((perTheme[key] || 0) < MAX_PER_THEME) {
    chosen.push(r);
    perTheme[key] = (perTheme[key] || 0) + 1;
  }
  if (chosen.length >= 6) break; // 最多选 6 个主题，覆盖足够题型
}

const out = {
  screenedAt: new Date().toISOString().slice(0, 10),
  selectionRule: '每主主题最多1个，综合分=0.45契合+0.25多样+0.20时效+0.10(1-重叠)',
  selected: chosen,
  rankedAll: results.map(r => ({ id: r.id, theme: r.primaryTheme, score: r.score, fit: r.fit, diversity: r.diversity, overlap: r.overlap }))
};
fs.writeFileSync(path.join(DIR, 'topics.selected.json'), JSON.stringify(out, null, 2), 'utf8');

console.log('=== 候选话题筛选 / 比对 / 去重 ===');
console.log('候选总数:', results.length, ' → 精选:', chosen.length);
console.log('\n全部候选得分（按综合分排序）：');
console.log('排名  主题            综合分  契合  多样  重叠  时效');
results.forEach((r, i) => {
  console.log(
    String(i+1).padEnd(4),
    r.primaryTheme.padEnd(14),
    String(r.score).padEnd(6),
    String(r.fit).padEnd(5),
    String(r.diversity).padEnd(5),
    String(r.overlap).padEnd(5),
    r.recency
  );
});
console.log('\n入选主题：', chosen.map(c => c.primaryTheme + '(' + c.title.slice(0,12) + ')').join(' / '));
console.log('已写出 topics.selected.json');
