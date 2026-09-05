/* 教材数据（一单元一条，key = 教材:单元序号）。
   结构：unit/title/subtitle/question/summary/lessons[].lines|drill、words、grammar、patterns、exercises、tips
   lessons[].lines = [说话人, 英文, 中文, 备注?]；缺失字段会自动跳过对应区块，
   因此旧数据（只有 words/grammar/patterns/tips）可继续用，无需改动。 */
window.NOTES = {
 "NCE1:1": {
   "unit": "Lesson 1 & 2",
   "title": "Excuse me! / Is this your …?",
   "subtitle": "打扰一下！/ 这是你的……吗？",
   "question": "Whose handbag is it?（这是谁的手提包？）",
   "summary": "入门第一关，核心只有一句：Is this your …?（这是你的……吗？）。第 1 课在一段 7 句的短对话里学会用 Excuse me 引起注意、用 Pardon 请对方重说；第 2 课把 10 个日常名词依次填进这个句型反复操练。整课语法只有一点：be 动词提前构成一般疑问句，回答时用 it 简略作答。",
   "lessons": [
     {
       "no": "1",
       "title": "Excuse me!",
       "kind": "课文 · 对话",
       "lines": [
         ["A", "Excuse me!", "打扰一下！", "引起陌生人注意，读升调"],
         ["B", "Yes?", "嗯？/ 什么事？", "读升调，表示“我在听，请说”"],
         ["A", "Is this your handbag?", "这是你的手提包吗？", "本课核心句型"],
         ["B", "Pardon?", "请再说一遍？", "没听清时用，读升调"],
         ["A", "Is this your handbag?", "这是你的手提包吗？", "照原句重复一遍"],
         ["B", "Yes, it is.", "是的，是我的。", "简略回答：用 it 指代 this"],
         ["A", "Thank you very much.", "非常感谢。", "very much 放句末表程度"]
       ]
     },
     {
       "no": "2",
       "title": "Is this your …?",
       "kind": "句型操练 · 无课文",
       "drill": {
         "q": "Is this your ___?",
         "zh": "这是你的……吗？（把下面的词挨个填进横线，问一遍、答一遍）",
         "slots": [
           ["pen", "钢笔"], ["pencil", "铅笔"], ["book", "书"], ["watch", "手表"],
           ["coat", "外衣"], ["dress", "连衣裙"], ["skirt", "裙子"], ["shirt", "衬衣"],
           ["car", "小汽车"], ["house", "房子"]
         ],
         "answers": ["Yes, it is.", "No, it isn't."]
       }
     }
   ],
   "words": [
     ["excuse", "原谅（Excuse me! 打扰一下）"],
     ["me", "我（宾格：Excuse me 原谅我 / 打扰一下）"],
     ["yes", "是的，嗯（读升调时表示“什么事？”）"],
     ["is", "是（be 动词，第三人称单数）"],
     ["this", "这，这个（指近处；远处用 that）"],
     ["your", "你的，你们的"],
     ["handbag", "手提包（女士用的手袋）"],
     ["pardon", "原谅；请再说一遍（Pardon?）"],
     ["it", "它（回答时用来指代 this / that）"],
     ["thank you", "谢谢你（= thanks）"],
     ["very much", "非常地（放句末：Thank you very much.）"],
     ["pen", "钢笔"],
     ["pencil", "铅笔"],
     ["book", "书"],
     ["watch", "手表"],
     ["coat", "上衣，外衣"],
     ["dress", "连衣裙"],
     ["skirt", "裙子"],
     ["shirt", "衬衣"],
     ["car", "小汽车"],
     ["house", "房子"]
   ],
   "grammar": [
     { "k": "一般疑问句：be 动词直接提到句首", "f": "This is your handbag. → Is this your handbag?", "d": "含 be 动词（am / is / are）的句子变疑问句不用助动词，把 be 动词移到主语前面，句末改成问号并读升调。" },
     { "k": "简略回答：用 it 指代 this / that", "f": "Yes, it is. / No, it isn't. (= is not)", "d": "回答 Is this …? 时主语改用 it，不再重复名词；否定用缩略式 isn't，读降调。" },
     { "k": "Pardon? 请对方重说", "f": "Pardon? = I beg your pardon?", "d": "没听清、请对方再说一遍时用，读升调。注意它和 Sorry 不同——Sorry 是“道歉”，Pardon 是“没听清”。" },
     { "k": "Excuse me 的三种典型用法", "f": "Excuse me!", "d": "①引起陌生人注意（本课用法）②请人让路 / 借过 ③礼貌地打断别人。都不属于道歉，道歉要说 Sorry。" }
   ],
   "patterns": [
     ["Excuse me!", "打扰一下！（引起注意 / 借过）"],
     ["Is this your handbag?", "这是你的手提包吗？"],
     ["Pardon?", "请再说一遍？（没听清时用）"],
     ["Yes, it is.", "是的，它是。（简略回答，不重复 handbag）"],
     ["Thank you very much.", "非常感谢。"],
     ["Is this your pen?", "这是你的钢笔吗？（Lesson 2 句型）"]
   ],
   "exercises": [
     { "q": "把 This is my handbag. 改成一般疑问句。", "a": "Is this your handbag?", "n": "be 动词 is 提到句首；问对方时 my 换成 your。" },
     { "q": "回答：Is this your watch?（肯定）", "a": "Yes, it is.", "n": "用 it 指代 this，不要写成 Yes, this is." },
     { "q": "回答：Is this your car?（否定）", "a": "No, it isn't.", "n": "isn't = is not，口语一律用缩略式。" },
     { "q": "汉译英：这是你的铅笔吗？", "a": "Is this your pencil?", "n": "pencil 铅笔；pen 钢笔，别混。" },
     { "q": "想从人群中挤过去，该说什么？", "a": "Excuse me!", "n": "借过、引起注意都用 Excuse me；道歉才用 Sorry。" }
   ],
   "tips": "练法建议：把 Lesson 2 的 10 个名词挨个填进 Is this your ___? 问一遍、答一遍，肯定否定各来一次，形成肌肉记忆。听写时注意三个连读点：Is this 连读、your 弱读、it is 连读成 /ɪtɪz/。另外 this 指近处、that 指远处，但回答一律用 it，这是中国学生最容易错的地方。"
 },
 "NCE2:1": {
   "title": "A Private Conversation 一课讲义",
   "summary": "课文讲的是：作者上周去看戏，身后两个人一直大声交谈、扰人，作者忍无可忍，转过身说“我一个字也听不见”——结果对方回答“这不关你的事，这是我们之间的私人谈话”。课文其实是个幽默误会：\"private conversation\" 是关键词。",
   "words": [
     ["private", "私人的；私下的（a private conversation 私下交谈）"],
     ["conversation", "谈话；会话（have a conversation with sb 与某人交谈）"],
     ["theatre", "剧院（go to the theatre 去看戏）"],
     ["angry", "生气的（angry with sb 对某人生气）"],
     ["attention", "注意（pay attention to 注意…）"],
     ["bear", "忍受（can't bear 无法忍受，课文用 couldn't bear）"],
     ["business", "事；生意（It's none of your business. 不关你的事）"],
     ["rudely", "粗鲁地（rude 粗鲁的 + -ly）"]
   ],
   "grammar": [
     { "k": "一般过去时（动作发生在过去）", "f": "went / had / was / could / turned / said", "d": "叙述过去发生的事，动词用过去式。不规则：go→went, have→had, say→said, can→could, bear→bore。" },
     { "k": "句型 It's none of your business.", "f": "It's none of your + 名词", "d": "“这不关你的事”，口语高频表达；business 在此不是“生意”，而是“事、事务”。" },
     { "k": "turn round / turn around", "f": "turn round and + 动词", "d": "“转过身来”。方向/动作连贯用 and 连接。" }
   ],
   "patterns": [
     ["I couldn't bear it.", "我再也忍不了了（couldn't = 过去式否定）"],
     ["It's none of your business.", "不关你的事。"],
     ["This is a private conversation!", "这是我们之间的私人谈话！"]
   ],
   "tips": "结尾是幽默反转：你以为对方会道歉，结果他们说“这跟你无关”。记单词时把 three 组搭配一起背：go to the theatre / pay attention / none of your business。"
 }
};
