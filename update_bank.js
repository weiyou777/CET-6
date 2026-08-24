#!/usr/bin/env node
/**
 * update_bank.js —— 题库更新流水线（最终写入环节）
 *
 * 完整自动化流水线（"在线爬取 → 大数据筛选比对 → 组合生成 → 写入"）：
 *   1) node analyze_style.js  从现有题库挖掘"历年命题风格模型" → style_model.json
 *   2) 助手续用 WebSearch 实时爬取当前时事热点 → topics.raw.json
 *   3) node screen_topics.js  按 style_model 做契合度/多样性/时效性/去重打分 → topics.selected.json
 *   4) 助手依据 topics.selected.json 的真实事实 + 历年风格，组合生成新题（见下方 NEWS）
 *   5) node update_bank.js    将 NEWS 写出 data_news.js + data_news.json，并打印统计
 *
 * 之后 app.js 的 integrateNews() 会在启动时自动把这些 news 题并入各科题库。
 *
 * 用法：
 *   node update_bank.js            # 写出 data_news.js / data_news.json 并打印统计
 *   node update_bank.js --pipeline # 依次执行 analyze → screen → build
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

// ============================================================
// NEWS：依据 topics.selected.json 的 6 个精选真实话题组合生成
// 全部事实来自 2026-08-07 实时爬取（WAIC2026 / 十五五碳达峰 / 毕业生就业 /
// 非遗消夏购物月 / 上半年外贸 / 长护险），题型结构对齐历年真题。
// ============================================================
const NEWS = {
  writing: [
    { y:"2026·时事", c:"科技", t:"人工智能时代，大学生应如何为未来职业做准备", type:"议论文",
      tip:"三段式：AI 带来的机遇与冲击→个人如何提升不可替代的能力（批判思维/创造力/人机协作）→总结。可用数据：新发校招 AI 岗同比+47.3%，AI 工程师需供比 3.08。" },
    { y:"2026·时事", c:"环境", t:"绿色低碳转型：每个人都能贡献的力量", type:"议论文",
      tip:"从'十五五'碳达峰行动方案切入：国家目标（2030 非化石能源占比 25%）→个人绿色生活方式→总结，避免空喊口号，落到行动。" },
    { y:"2026·时事", c:"文化", t:"传统文化'出圈'对增强文化自信的启示", type:"议论文",
      tip:"现象（非遗消夏购物月 1200 余场、演出票房 304 亿）→意义（文化自信、产业新动能）→青年如何参与。" }
  ],
  translation: [
    { y:"2026·时事", s:"1", t:"“十五五”碳达峰行动方案", c:"环境",
      zh:"2026年7月，国务院印发《“十五五”碳达峰行动方案》。方案提出，到2030年，我国单位国内生产总值二氧化碳排放比2025年降低17%，非化石能源消费占比达到25%。中国将大力推进风电、太阳能等新能源开发，建设一批大型清洁能源基地，加快经济社会发展全面绿色转型。",
      en:"In July 2026, the State Council issued the '15th Five-Year Plan for Carbon Peak Action'. The plan proposes that by 2030, China's carbon dioxide emissions per unit of GDP will be reduced by 17% compared with 2025, and the share of non-fossil energy consumption will reach 25%. China will vigorously develop new energy such as wind and solar power, build a number of large clean-energy bases, and accelerate the comprehensive green transition of economic and social development.",
      k:["carbon peak","non-fossil energy","clean-energy bases","green transition"] },
    { y:"2026·时事", s:"2", t:"高校毕业生就业与“慢就业”", c:"社会",
      zh:"2026届全国普通高校毕业生规模预计达1270万人，再创历史新高。面对激烈的就业竞争，越来越多毕业生选择“慢就业”，用一段时间提升技能、明确方向。与此同时，人工智能、新能源等新质生产力领域人才紧缺，数字化技能成为就业市场的新刚需。",
      en:"The number of ordinary college graduates in the 2026 cohort is expected to reach 12.7 million, hitting a record high again. Facing fierce employment competition, a growing number of graduates choose to 'slow down employment', using a period of time to upgrade their skills and clarify their direction. Meanwhile, new-quality productive sectors such as artificial intelligence and new energy face a severe talent shortage, and digital skills have become a new rigid demand in the job market.",
      k:["college graduates","slow down employment","new-quality productive forces","digital skills"] },
    { y:"2026·时事", s:"3", t:"非遗“国潮焕新”与文旅消费", c:"文化",
      zh:"今年夏天，传统文化持续释放吸引力。2026“非遗好物 国潮焕新”非遗消夏购物月在全国推出1200余场活动。从沉浸式市集到手作体验，传统文化不再局限于展馆，而是融入日常消费，为文旅市场注入新动能，也成为增强文化自信的生动实践。",
      en:"This summer, traditional culture continues to exert its appeal. The 2026 'Intangible Cultural Heritage Treasures · Guochao Renewal' summer shopping month launched more than 1,200 events nationwide. From immersive bazaars to hands-on experiences, traditional culture is no longer confined to exhibition halls but integrated into daily consumption, injecting new momentum into the cultural tourism market and becoming a vivid practice of strengthening cultural confidence.",
      k:["intangible cultural heritage","Guochao","cultural tourism","cultural confidence"] }
  ],
  reading: [
    { src:"时事", y:"2026·时事", title:"国产 AI 算力与产业落地", skillNote:"时事阅读：细节定位+数字+观点，素材来自 2026 世界人工智能大会",
      passage:"Artificial intelligence is no longer a distant concept but a practical force reshaping daily life and industry. At the 2026 World Artificial Intelligence Conference in Shanghai, more than 1,100 companies showcased over 4,000 exhibits, with over 300 making their global debut. The event attracted over 400,000 visitors and was expected to generate about 20.36 billion yuan in intended purchases, up 25% year on year. Behind these eye-catching numbers lies a quieter revolution: domestic computing power. Huawei's Ascend 950 super node, packing 1,024 AI chips, made its first public appearance as the largest super node ever displayed. Sugon's 'Dengfeng' cluster, China's first fully domestic 100,000-card AI supercluster, has been connected to the national supercomputing internet, serving scientific research and industry. Meanwhile, Chinese open-source models are reaching the frontier: Kimi K3, with 2.8 trillion parameters, is the world's largest open-source model. Experts note that the real value of AI lies not in replacing humans but in empowering thousands of industries, from drug discovery to smart pharmacies that now operate in Shanghai around the clock. As one researcher put it, the goal is to make intelligent convenience tangible to ordinary people.",
      questions:[
        { q:"What can be learned about the 2026 World Artificial Intelligence Conference?", opts:["It was held in Beijing with 300 exhibitors.","Over 300 exhibits made their global debut out of 4,000-plus.","Intended purchases fell by 25% year on year.","Only domestic companies participated."], a:1, skill:"细节-数字", ex:"原文指出 1100 余家企业展出 4000 余款展品，其中超 300 款全球首发，选B。", ref:["more than 1,100 companies showcased over 4,000 exhibits, with over 300 making their global debut"] },
        { q:"What is notable about Huawei's Ascend 950 super node?", opts:["It is the smallest AI chip ever made.","It packs 1,024 AI chips as the largest super node displayed.","It was developed by a foreign company.","It replaced all human workers."], a:1, skill:"细节-特征", ex:"原文说昇腾950集成1024张算力卡，为展示过的最大超节点，选B。", ref:["packing 1,024 AI chips, made its first public appearance as the largest super node ever displayed"] },
        { q:"What is Sugon's 'Dengfeng' cluster?", opts:["A small research lab.","China's first fully domestic 100,000-card AI supercluster.","A foreign-built computing center.","A smartphone operating system."], a:1, skill:"细节-定义", ex:"原文明确其为全国产十万卡 AI 超集群并接入国家超算互联网，选B。", ref:["China's first fully domestic 100,000-card AI supercluster, has been connected to the national supercomputing internet"] },
        { q:"Why is Kimi K3 significant?", opts:["It is the cheapest model.","It has 2.8 trillion parameters as the world's largest open-source model.","It replaced human researchers.","It only works in China."], a:1, skill:"细节-数字", ex:"原文指出 Kimi K3 参数 2.8 万亿，为全球最大开源模型，选B。", ref:["Kimi K3, with 2.8 trillion parameters, is the world's largest open-source model"] },
        { q:"According to experts, what is the real value of AI?", opts:["Replacing humans entirely.","Empowering thousands of industries rather than replacing humans.","Ending all human jobs.","Only playing games."], a:1, skill:"态度-观点", ex:"专家强调 AI 的价值在于赋能各行各业而非取代人类，选B。", ref:["the real value of AI lies not in replacing humans but in empowering thousands of industries"] }
      ] },
    { src:"时事", y:"2026·时事", title:"非遗“出圈”与文旅消费提质", skillNote:"时事阅读：细节+推理+主旨，素材来自 2026 非遗消夏购物月",
      passage:"Cultural consumption is lighting up everyday life this summer. During the 2026 'Intangible Cultural Heritage Treasures · Guochao Renewal' summer shopping month, localities across China launched more than 1,200 events, ranging from product fairs and immersive performances to hands-on workshops. The numbers tell a strong story: in the first half of the year, cultural enterprises achieved operating revenue of 7.2 trillion yuan, up 4.6% year on year, while ticket sales for commercial performances reached 30.4 billion yuan, up 9.4%. Even more striking, the 16 subsectors with distinctive new cultural formats reported revenue of 3.5 trillion yuan, growing 9.6%, outpacing the broader cultural industry. Behind the growth is a shift in how people spend: travelers increasingly prefer 'deep experience' over mere sightseeing. Young consumers flock to costume photo shoots in ancient towns, try their hand at tie-dyeing, or bring home a self-made ink stick. Traditional skills, once confined to museums, now open up new consumer scenes within scenic areas. Experts argue that the key challenge is moving from 'internet fame' to 'daily consumption'—embedding culture into bookstores, cafes and markets so that it becomes a routine part of life. When cultural supply meets upgraded demand, the result is both economic vitality and a stronger cultural confidence.",
      questions:[
        { q:"How many events did the heritage shopping month launch?", opts:["About 300.","More than 1,200.","Exactly 2,000.","Less than 100."], a:1, skill:"细节-数字", ex:"原文说全国推出 1200 余场活动，选B。", ref:["launched more than 1,200 events"] },
        { q:"What does the passage say about new cultural formats?", opts:["They declined by 9.6%.","Their revenue grew 9.6%, outpacing the broader industry.","They replaced traditional culture.","They only exist online."], a:1, skill:"细节-数字", ex:"16 个文化新业态小类营收增长 9.6%，快于整体文化产业，选B。", ref:["the 16 subsectors with distinctive new cultural formats reported revenue of 3.5 trillion yuan, growing 9.6%, outpacing the broader cultural industry"] },
        { q:"What shift in consumer behavior is mentioned?", opts:["People prefer deep experience over mere sightseeing.","Everyone stays at home.","Tourists avoid ancient towns.","Spending is shrinking."], a:0, skill:"细节-同义替换", ex:"原文 travelers increasingly prefer 'deep experience' over mere sightseeing，选A。", ref:["travelers increasingly prefer 'deep experience' over mere sightseeing"] },
        { q:"What challenge do experts point out?", opts:["Culture should stay in museums.","Moving from 'internet fame' to 'daily consumption'.","Tourism should be banned.","Young people reject tradition."], a:1, skill:"主旨-态度", ex:"专家指出的关键挑战是从网红打卡转向日常消费，选B。", ref:["the key challenge is moving from 'internet fame' to 'daily consumption'"] }
      ] }
  ],
  listening: [
    { src:"时事", y:"2026·时事", title:"新闻综述：养老 / 双碳 / 外贸（原文跟读+自测）",
      note:"说明：六级听力需配合音频训练，此处提供时事新闻原文供跟读与题目自测；点击“显示参考答案与解析”核对。素材来自 2026-07 至 2026-08 公开报道。",
      transcript:"Good evening. Here is a roundup of today's major news. First, in elderly care, China is moving faster to build a long-term care insurance system. By the end of 2025, the program had covered nearly 300 million people and benefited over 3.3 million disabled seniors, cutting their annual personal burden by about 12,000 yuan on average. A consumer subsidy for moderately and severely disabled elders has reached about 2 million beneficiaries, with 6.5 billion yuan in vouchers redeemed. Second, on climate, the State Council has issued the '15th Five-Year Plan for Carbon Peak Action', aiming to cut carbon intensity by 17% by 2030 and raise the share of non-fossil energy to 25%. Wind and solar capacity is targeted to exceed 2.8 billion kilowatts. Finally, on trade, China's goods imports and exports hit 25.5 trillion yuan in the first half of the year, up 16.9% and a record for the period. Electric vehicle exports surged 68.7%, while high-tech product exports grew 39%. That is the news. Good night.",
      questions:[
        { q:"How many people does the long-term care insurance program cover?", opts:["About 3.3 million.","Nearly 300 million.","Around 2 million.","Over 6.5 billion."], a:1, skill:"细节-数字", ex:"新闻说长护险已覆盖近 3 亿人，选B。", ref:["the program had covered nearly 300 million people and benefited over 3.3 million disabled seniors"] },
        { q:"What is the 2030 target for the share of non-fossil energy?", opts:["17%.","25%.","2.8 billion kilowatts.","68.7%."], a:1, skill:"细节-数字", ex:"双碳方案目标 2030 年非化石能源占比达 25%，选B。", ref:["raise the share of non-fossil energy to 25%"] },
        { q:"What was China's goods trade volume in the first half of the year?", opts:["25.5 trillion yuan, up 16.9%.","6.5 billion yuan.","3.3 million people.","30.4 billion yuan."], a:0, skill:"细节-数字", ex:"上半年货物进出口 25.5 万亿元，同比+16.9%，选A。", ref:["China's goods imports and exports hit 25.5 trillion yuan in the first half of the year, up 16.9%"] },
        { q:"By how much did electric vehicle exports grow?", opts:["39%.","17%.","68.7%.","25%."], a:2, skill:"细节-数字", ex:"新闻指出电动汽车出口增长 68.7%，选C。", ref:["Electric vehicle exports surged 68.7%"] }
      ] }
  ]
};

// ---------- 写出 ----------
function build() {
  const js = "window.BANK = window.BANK || {};\nwindow.BANK.news = " + JSON.stringify(NEWS, null, 2) + ";\n";
  fs.writeFileSync(path.join(DIR, 'data_news.js'), js, 'utf8');
  fs.writeFileSync(path.join(DIR, 'data_news.json'), JSON.stringify(NEWS, null, 2), 'utf8');
  const w = NEWS.writing.length, t = NEWS.translation.length;
  const r = NEWS.reading.reduce((a, p) => a + p.questions.length, 0);
  const l = NEWS.listening.reduce((a, s) => a + s.questions.length, 0);
  console.log('=== 题库更新写入完成 ===');
  console.log('写作:', w, ' 翻译:', t, ' 阅读:', r, '题', ' 听力:', l, '题', ' 合计:', (w + t + r + l));
  console.log('已写出 data_news.js 与 data_news.json（app.js 启动时自动并入题库并标记 news:true）');
}

if (process.argv.includes('--pipeline')) {
  const { execSync } = require('child_process');
  console.log('>>> 步骤1：提取历年命题风格模型'); execSync('node analyze_style.js', { cwd: DIR, stdio: 'inherit' });
  console.log('>>> 步骤2：筛选比对候选话题（需先有 topics.raw.json）'); execSync('node screen_topics.js', { cwd: DIR, stdio: 'inherit' });
}
build();
