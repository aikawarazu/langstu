/* 学习助手原型 · 演示数据（PROTOTYPE — 全部为示例内容，非真实教材数据） */
window.DATA = {
  meta: { lessons: 144, unitSize: 24, done: 22, current: 23 },
  units: [
    { n: 1, range: [1, 24], title: '问候 · 请求 · 日常对话' },
    { n: 2, range: [25, 48], title: '时态起步 · 问路 · 购物' },
    { n: 3, range: [49, 72], title: '过去进行 · 打算 · 描述' },
    { n: 4, range: [73, 96], title: '完成时 · 比较 · 建议' },
    { n: 5, range: [97, 120], title: '被动 · 定语从句入门' },
    { n: 6, range: [121, 144], title: '综合运用 · 长句拆解' }
  ],
  weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  weekMin: [35, 60, 50, 50, 0, 65, 45],
  lesson: {
    id: 23,
    title: 'Which glasses?',
    zh: '哪几个玻璃杯？',
    unit: 'Unit 1 · L23–24',
    audioSec: 32,
    lines: [
      { en: 'Give me some glasses, please, Jane.', zh: '请给我几个玻璃杯，简。', dur: 4 },
      { en: 'Which glasses?', zh: '哪几个玻璃杯？', dur: 2.5 },
      { en: 'These?', zh: '这些吗？', dur: 1.8 },
      { en: 'No, not those. The ones on the shelf.', zh: '不，不是那些。是架子上的那些。', dur: 5 },
      { en: 'These?', zh: '这些吗？', dur: 1.8 },
      { en: 'Yes, please.', zh: '好的，谢谢。', dur: 2.5 }
    ],
    vocab: [
      { w: 'glasses', ipa: '/ˈɡlɑːsɪz/', pos: 'n.', zh: '眼镜；玻璃杯（复数）', tag: '新', ex: 'Give me some glasses, please.', exzh: '请给我几个玻璃杯。', note: 'a pair of glasses 一副眼镜' },
      { w: 'which', ipa: '/wɪtʃ/', pos: 'det./pron.', zh: '哪一个；哪些', tag: '新', ex: 'Which glasses?', exzh: '哪几个玻璃杯？', note: 'Which…？用于限定范围内的选择疑问' },
      { w: 'these', ipa: '/ðiːz/', pos: 'pron.', zh: '这些（this 的复数）', tag: '新', ex: 'These?', exzh: '这些吗？', note: '近指复数；与 those 相对' },
      { w: 'those', ipa: '/ðəʊz/', pos: 'pron.', zh: '那些（that 的复数）', tag: '新', ex: 'No, not those.', exzh: '不，不是那些。', note: '远指复数' },
      { w: 'one', ipa: '/wʌn/', pos: 'pron.', zh: '一个；用来代替上文名词', tag: '已见', ex: 'The ones on the shelf.', exzh: '架子上的那些。', note: 'one(s) 避免重复：The red one, please.' },
      { w: 'shelf', ipa: '/ʃelf/', pos: 'n.', zh: '架子，搁板', tag: '已见', ex: 'The ones on the shelf.', exzh: '架子上的那些。', note: '复数 shelves' },
      { w: 'give', ipa: '/ɡɪv/', pos: 'v.', zh: '给', tag: '已见', ex: 'Give me some glasses.', exzh: '给我几个玻璃杯。', note: 'give sb. sth. = give sth. to sb.' },
      { w: 'some', ipa: '/sʌm/', pos: 'det.', zh: '一些；某些', tag: '已见', ex: 'Give me some glasses, please.', exzh: '请给我几个玻璃杯。', note: '请求时用 some 语气更客气' }
    ],
    grammar: [
      {
        key: '指示代词', title: 'this/these · that/those（近指 / 远指）',
        rule: 'this（这个）/ these（这些）指离说话人近的人或物；that（那个）/ those（那些）指较远的人或物。',
        formula: '单数：This/That is + n.     复数：These/Those are + n.',
        ex: [ { en: 'These glasses?', zh: '这些吗？', note: '近处的东西' }, { en: 'No, not those.', zh: '不，不是那些。', note: '远处的那些' } ],
        warn: 'this 后不能直接跟复数名词：This glasses 是错的，要说 These glasses。',
        relate: [{ l: 9, t: 'this/that 单数用法（首次接触）' }, { l: 37, t: '将来还会再次见到' }]
      },
      {
        key: 'some', title: '不定限定词 some（请求时更客气）',
        rule: 'some 表示“一些”，常用于肯定句与礼貌的请求；请求时用 some 比 any 更显得期待得到肯定答复。',
        formula: 'Give me some + 复数名词，please.',
        ex: [ { en: 'Give me some glasses, please.', zh: '请给我几个玻璃杯。', note: '礼貌请求' }, { en: 'Would you like some tea?', zh: '要来点茶吗？', note: '招待用语' } ],
        warn: 'some 后接可数名词时用复数（some glasses），接不可数名词用单数（some tea）。',
        relate: [{ l: 41, t: 'some/any 的疑问与否定辨析' }]
      }
    ],
    bind: {
      text: { name: 'nce.ichochy.com · L23 课文点读', desc: '逐句音频 · 倍速 · 显示/隐藏释义' },
      jx: { name: '胶学精讲 · Lesson 23', desc: 'B 站合集对应课时 · 约 18 分钟' },
      podcast: { name: 'Coffee Break English · Season 2 泛听', desc: '本周可选补充 · 约 16 分钟' }
    }
  },
  steps: [
    { id: 'read', n: 1, t: '课文精听', min: 4, desc: '盲听 → 对照文本' },
    { id: 'vocab', n: 2, t: '生词过卡', min: 6, desc: '8 个词 · 3 个新词' },
    { id: 'grammar', n: 3, t: '语法讲解', min: 5, desc: '2 个语法点 · 句型公式' },
    { id: 'listen', n: 4, t: '跟读录音', min: 4, desc: '逐句跟读 · 自评' },
    { id: 'dict', n: 5, t: '听写检验', min: 5, desc: '隐藏字幕 · 听写关键句' }
  ],
  today: {
    date: '9月3日 · 周四', nickname: '小易', streak: 12,
    groups: [
      { key: 'am', label: '早间 · 先复习', min: 12, items: [
        { t: '复习到期卡片', sub: '生词 10 · 句型 3 · 语法 2' },
        { t: '错词快看：cupboard · mirror', sub: '来自昨日的错词本' }
      ]},
      { key: 'pm', label: '主课 · 新概念 L23', min: 36, items: [
        { t: 'Which glasses? 完成 5 步学习', sub: '精听 → 生词 → 语法 → 跟读 → 听写' },
        { t: '胶学精讲视频 L23', sub: '选看 · 约 18 分钟' }
      ]},
      { key: 'flex', label: '灵活补足（可选）', min: 10, items: [
        { t: 'Coffee Break English 泛听一集', sub: '本周积累语料' }
      ]}
    ]
  },
  messages: [
    { id: 1, at: '今晨 07:30', tag: '晨间来信', title: '今天 48 分钟就能拿下 L23', read: true,
      body: '早上好。今天只安排两件事：先把到期的 15 张卡片复习掉（约 12 分钟）——昨天 those/these 你犹豫过，今天我把它们都放进去了。再学新课文 L23 Which glasses?，五步走约 36 分钟。语法点（指示代词）L9 见过一次，今天是正式见面。晚上睡前我来检查打卡。',
      cta: '进入今日清单', ctaGo: '#/today' },
    { id: 2, at: '昨晚 21:02', tag: '晚督促', title: 'L22 的打卡我还在等一个句号', read: true,
      body: '九点多了，今日听写还没打卡。我们压缩成 8 分钟：复习 6 张 + 通读一遍 L22 课文，就算完成今日任务。偶尔的短，比中断好。',
      cta: '去完成今日任务', ctaGo: '#/today' },
    { id: 3, at: '周一 20:00', tag: '里程碑', title: '连续打卡 10 天，拿下“坚持勋章”', read: true,
      body: '连续打卡满 10 天：完成 7 课、复习 412 张卡片，正确率从 68% 涨到 81%。本周复盘日我们只复习，不学新课。',
      cta: '查看学情报告', ctaGo: '#/report' },
    { id: 4, at: '上周日 18:30', tag: '周报', title: '本周“现在进行时”错了 3 次，我们回炉', read: false,
      body: '周报发现：现在进行时 ing 拼写（writing / running 这类 double 辅音）错了 3 次。下周一安排 8 分钟专项回炉，错词加入复习池。',
      cta: '预览复习计划', ctaGo: '#/today' }
  ],
  review: [
    { type: '生词', f: 'these', b: '这些（this 的复数，近指）\n例句：These are my books.' },
    { type: '生词', f: 'shelf', b: '架子，搁板（复数 shelves）\n例句：The ones on the shelf.' },
    { type: '句型', f: 'Give me ____ on the shelf.（用 one/ones）', b: 'Give me the ones on the shelf.\n（ones 代替 glasses，避免重复）' },
    { type: '语法', f: 'these 和 those 的区别？', b: 'these 近指；those 远指。' },
    { type: '生词', f: 'cupboard', b: '橱柜 /ˈkʌbəd/\nPut the cups in the cupboard.' },
    { type: '生词', f: 'one', b: '一个；one(s) 代替刚提过的可数名词\nThe red one, please.' }
  ],
  report: {
    daily: { date: '昨日 9月2日', min: '55 / 60', cards: 24, acc: 79, words: 8 },
    weekly: { done: 5, total: 7, minutes: '305 分钟', cards: 138, acc: 82, words: 32 },
    mastery: [ { k: '词汇', v: 74 }, { k: '句型', v: 66 }, { k: '语法', v: 58 }, { k: '听写', v: 41 } ],
    wrong: [ { t: 'cupboard（拼写）', n: 3 }, { t: 'these / those（易混）', n: 2 }, { t: '现在进行时 ing（语法）', n: 3 }, { t: 'mirror（拼写）', n: 2 } ],
    insight: '“冠词 a / the”连续 5 日错 3 次，建议安排一次 L17 前后语法回炉。'
  },
  settings: { nickname: '小易', budget: 60, budgetOpts: [15, 30, 45, 60], amTime: '07:30', pmTime: '20:00' },
  tabs: [
    { id: 'today', label: '今天', icon: 'home' },
    { id: 'map', label: '课程', icon: 'book' },
    { id: 'review', label: '复习', icon: 'repeat' },
    { id: 'report', label: '报告', icon: 'chart' },
    { id: 'me', label: '我的', icon: 'user' }
  ],
  themes: [
    { key: 'warm', name: '温暖陪伴', desc: '奶油底 · 大圆角 · 班主任风格' },
    { key: 'clean', name: '清爽效率', desc: '白底主色 · 数据卡片 · 多邻国感' },
    { key: 'dark', name: '深色专注', desc: '深色夜间友好 · 晚间复习' },
    { key: 'retro', name: '复古笔记', desc: '纸张质感 · 衬线标题 · 课本注解' }
  ]
};
