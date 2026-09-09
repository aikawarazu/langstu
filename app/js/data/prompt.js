/* ===== 数据制作指引：提示词 + 示例（页面「导入说明」里直接展示、可复制）=====
   用途：把任意 plain txt / html / OCR 出来的教材原文，交给大模型生成符合 course-package-spec 的 JSON。 */
window.LS_PROMPT = (function () {

  var SAMPLE = {
    "schemaVersion": 1,
    "specVersion": "1.0",
    "version": "1.0.0",
    "id": "demo-cafe",
    "kind": "series",
    "title": "咖啡馆英语 · 入门三课",
    "subtitle": "自创示例（可放心公开）",
    "lang": { "from": "en", "to": "zh" },
    "level": "A1",
    "tags": ["英语", "示例"],
    "source": { "text": "自创", "license": "CC0 / 可自由使用" },
    "units": [
      {
        "id": "u001", "index": 1, "title": "A Cup of Coffee", "lessons": [1],
        "lessonLabel": "Lesson 1",
        "content": {
          "schemaVersion": 1, "unitId": "u001", "title": "A Cup of Coffee", "subtitle": "一杯咖啡",
          "lead": {
            "question": "点单时你想先说哪一句？",
            "warmup": "先别看课文：想象你走进咖啡馆，店员问你要什么。",
            "goals": ["能用 I'd like… 点单", "能听懂 How much is it?"],
            "summary": "核心句型 I'd like a …, please.",
            "tips": "把 drinks 里的词挨个填进句型练一遍。"
          },
          "questions": [
            { "kind": "listen", "q": "What does the customer order?", "zh": "顾客点了什么？", "a": "A large coffee.", "aZh": "一大杯咖啡。", "hint": "听 I'd like 后面的词。" },
            { "kind": "detail", "q": "How much is it?", "zh": "多少钱？", "a": "Three dollars.", "aZh": "三美元。", "hint": "听问句 How much 的回答。" }
          ],
          "text": [
            {
              "lesson": 1, "title": "A Cup of Coffee", "kind": "课文 · 对话",
              "lines": [
                { "speaker": "A", "en": "Good morning! What can I get you?", "zh": "早上好！需要点什么？", "note": "店员常用语" },
                { "speaker": "B", "en": "I'd like a large coffee, please.", "zh": "我要一大杯咖啡，谢谢。", "note": "I'd like = I would like，比 I want 礼貌" },
                { "speaker": "A", "en": "Sure. That's three dollars.", "zh": "好的，三美元。", "note": "" }
              ]
            }
          ],
          "words": [
            { "word": "coffee", "phonetic": "/ˈkɒfi/", "meanings": [{ "pos": "noun", "meaning": "咖啡" }],
              "examples": [{ "en": "I'd like a large coffee.", "zh": "我要一大杯咖啡。" }] }
          ],
          "phrases": [{ "phrase": "I'd like …", "usage": "礼貌点单/表达想要某物", "examples": [{ "en": "I'd like a coffee, please.", "zh": "我想要一杯咖啡，谢谢。" }] }],
          "grammar": [{ "title": "would like 的用法", "definition": "礼貌表达「想要」", "structure": "I'd like + 名词", "usage": "点单、请求", "examples": [{ "en": "I'd like a coffee.", "zh": "我想要一杯咖啡。" }] }],
          "patterns": [{ "pattern": "I'd like + 名词", "original": { "en": "I'd like a large coffee.", "zh": "我要一大杯咖啡。" }, "imitations": [{ "en": "I'd like a tea.", "zh": "我要一杯茶。" }] }],
          "exercises": [{ "q": "把 I want a coffee. 改成更礼貌的说法。", "a": "I'd like a coffee, please.", "note": "点单场景用 would like 更自然" }],
          "quiz": [{ "q": "点咖啡最礼貌的说法是 ____", "options": ["I want coffee.", "I'd like a coffee, please.", "Give me coffee."], "answer": 1, "note": "would like + please 最礼貌" }]
        }
      }
    ]
  };

  var MIN = {
    "schemaVersion": 1, "specVersion": "1.0", "id": "my-lesson-1", "kind": "single", "title": "我的第一课",
    "content": {
      "schemaVersion": 1, "unitId": "u1", "title": "Hello",
      "text": [{ "lesson": 1, "lines": [{ "en": "Hello, world!", "zh": "你好，世界！" }] }],
      "words": [{ "word": "hello", "meanings": [{ "pos": "int.", "meaning": "你好" }] }]
    }
  };

  var MAIN = [
    '# 角色',
    '你是一名英语教材数据工程师。请把「原始材料」转换成 Langstu 课程包标准 JSON（schemaVersion=1, specVersion="1.0"）。',
    '',
    '# 输入',
    '我会给你一段教材原文（plain txt / 从 HTML 复制的文本 / OCR 结果），可能是多课连排、夹杂生词表、译文、语法讲解、练习答案。',
    '',
    '# 输出要求（硬性）',
    '1. 只输出一个 JSON 对象；不要解释、不要 Markdown 代码围栏、不要注释。',
    '2. 顶层字段：schemaVersion(1)、specVersion("1.0")、version("1.0.0")、id(英文小写，只允许 a-z 0-9 - _)、kind("series"|"single")、title、subtitle?、lang{from:"en",to:"zh"}、level?、tags?、source{text,license}、groups?、units[]。',
    '3. units[]：每课一个对象 {id:"u001", index:1, title, lessons:[课号], lessonLabel:"Lesson 1 & 2", audio?, video?, contentRef?|content{}}。id 从 u001 顺序编号；多单元时把课文内容放 contentRef 指向的外链，或内联进 content 也行。',
    '4. content 结构（全部区块可选，缺哪块前端就少渲染哪块）：',
    '   - lead{question,warmup,goals[],summary,tips}：导学',
    '   - questions[]：{kind:"listen"|"detail"|"think"|"drill", q, zh?, a?, aZh?, hint?}。每课必须有提问：listen×1（抓主旨）、detail×2-3（扣细节）、think×1（开放）。hint 不能直接写出答案。',
    '   - text[]：{lesson, title, kind, lines:[{speaker?,en,zh,note?}], drill?{q,zh,slots:[{en,zh}],answers[]}}',
    '   - words[]：{word, phonetic?, meanings:[{pos?,meaning,usage?}], examples?:[{en,zh}]}（只收单词，不要短语）',
    '   - phrases[]：{phrase, usage?, examples:[{en,zh}]}',
    '   - grammar[]：{title, definition?, structure?, usage?, examples:[{en,zh}]}',
    '   - patterns[]：{pattern, original?:{en,zh}, imitations:[{en,zh}]}',
    '   - exercises[]：{q, a, note?}（动笔题）',
    '   - quiz[]：{q, zh?, options:[3-4 项], answer:0 起下标, note?}（干扰项要来自本课真实易错点）',
    '5. 英文用教材原拼写与标点，中文译文简洁准确，不要机翻腔。',
    '6. 遇到缺失信息就省略该字段，不要编造；更不要整段复制超出原文的内容。',
    '',
    '# 质量自检（输出前逐条确认）',
    '□ id 合法且唯一；units 顺序 = 学习顺序；每课都有 questions',
    '□ text.lines 的 en 与原文一致；zh 不是空字符串就尽量填',
    '□ quiz.answer 是 options 的下标（0 起），且指向唯一正确项',
    '□ words 只放单词，固定搭配进 phrases',
    '□ 输出能被 JSON.parse 解析（无尾逗号、无注释、无 NaN/undefined）',
    '',
    '# 输出示例（结构与语气照这个来，尺寸可缩放）',
    JSON.stringify(SAMPLE, null, 2),
    '',
    '# 现在处理下面的原始材料：',
    '（把你的 txt / html 内容粘贴在这里）'
  ].join('\n');

  return { MAIN: MAIN, SAMPLE: SAMPLE, MIN: MIN };
})();
