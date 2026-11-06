import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePracticeSheet, mergeLesson, looksLikePracticeSheet } from '../shared/practice-sheet.js';
import { parseImport } from '../app/import-normalize.ts';

const now = Date.parse('2026-11-06T12:00:00Z'), opts = { today: '2026-11-06', now };

// 1. 旧格式示例（虚构内容）：纠错只进记录，不做卡片
const legacy = readFileSync(new URL('./fixtures/legacy-2026-11-06.txt', import.meta.url), 'utf8');
let r = parsePracticeSheet(legacy, opts);
assert.equal(r.lessons.length, 1);
let l = r.lessons[0];
assert.equal(l.date, '2026-11-06');
assert.match(l.topic, /^周末/);
const kinds = (k) => l.cards.filter((c) => c.kind === k);
assert.equal(kinds('correction').length, 0);
assert.equal(kinds('vocab').length, 10);
assert.equal(kinds('phrase').length, 6);
assert.equal(l.cards.length, 16);
assert.ok(l.cards.every((c) => !('said' in c)));
assert.equal(l.corrections.length, 8);
assert.deepEqual(l.corrections[0], { original: 'I go to park with my friend last Saturday.', corrected: 'I went to the park with my friend last Saturday.' });
assert.equal(l.grammar.length, 4);
assert.equal(l.paragraph.split('\n').length, 3);
assert.deepEqual(kinds('vocab').find((c) => c.en === 'sandwich'), { kind: 'vocab', zh: '三明治（可数）', en: 'sandwich', due: now, interval: 0 });
assert.equal(kinds('phrase')[0].en, 'go for a picnic');
assert.deepEqual(r.warnings, []);

// 2. 新格式 v1：词汇 / 词组 / 固定搭配三种卡片
const v1 = `#练习单 v1
日期: 2026-11-07
主题: 咖啡

【词汇】
slice | 片

【词组】
heat up | 加热

【固定搭配】
a slice of bread | 一片面包

【句子】
- It's healthier to go to bed at ten: really. | 十点睡觉更健康。
= 主:It | 谓:'s | 表:healthier | 主:to go to bed | 状:at ten | 状:really
> go to bed | 睡觉
> go to bed at ten
> It's healthier to go to bed at ten: really. | 十点睡觉更健康。

【纠错】
I toast two bread. => I toasted two slices of bread. || 我烤了两片面包。 || bread 不可数

【语法】
- 一般过去时

【段落】
This morning I had a latte.

It woke me up.`;
r = parsePracticeSheet(v1, opts);
l = r.lessons[0];
assert.equal(l.date, '2026-11-07');
assert.equal(l.topic, '咖啡');
assert.deepEqual(l.cards.map((c) => c.kind), ['vocab', 'phrase', 'collocation', 'sentence']);
assert.deepEqual(l.cards[2], { kind: 'collocation', zh: '一片面包', en: 'a slice of bread', due: now, interval: 0 });
assert.deepEqual(l.cards[3], { kind: 'sentence', zh: '十点睡觉更健康。', en: "It's healthier to go to bed at ten: really.", due: now, interval: 0, steps: [{ en: 'go to bed', zh: '睡觉' }, { en: 'go to bed at ten' }],
  parts: [{ r: 'S', t: 'It' }, { r: 'V', t: "'s" }, { r: 'C', t: 'healthier' }, { r: 'S', t: 'to go to bed' }, { r: 'A', t: 'at ten' }, { r: 'A', t: 'really' }] });
// 词性行
r = parsePracticeSheet("#练习单 v1\n【句子】\nI'm two. | 我两岁。\n~ I:代 | 'm:动 | two:数\n= 主:I | 谓:'m | 表:two", opts);
assert.deepEqual(r.lessons[0].cards[0].pos, [{ t: 'I', p: '代' }, { t: "'m", p: '动' }, { t: 'two', p: '数' }]);
assert.equal(r.lessons[0].cards[0].parts.length, 3);
assert.deepEqual(r.warnings, []);
r = parsePracticeSheet('#练习单 v1\n【句子】\nI like it. | 我喜欢。\n~ I:代 | like:动', opts);
assert.equal(r.lessons[0].cards[0].pos, undefined);
assert.match(r.warnings[0], /词性/);
assert.deepEqual(parseImport(JSON.stringify([{ id: 'x', date: '2026-11-06', topic: 't', cards: [{ zh: '我', en: 'I', due: 0, interval: 0, kind: 'sentence', pos: [{ t: 'I', p: '代' }] }] }]), { today: '2026-11-06', now, topic: '' }).lessons[0].cards[0].pos, [{ t: 'I', p: '代' }]);
// 成分和原句对不上 → 忽略并提示
r = parsePracticeSheet('#练习单 v1\n【句子】\nI like it. | 我喜欢。\n= 主:I | 谓:love | 宾:it', opts);
assert.equal(r.lessons[0].cards[0].parts, undefined);
assert.match(r.warnings[0], /对不上/);
r = parsePracticeSheet(v1, opts);
assert.deepEqual(l.corrections[0], { original: 'I toast two bread.', corrected: 'I toasted two slices of bread.', meaning: '我烤了两片面包。', explanation: 'bread 不可数' });
assert.equal(l.paragraph, 'This morning I had a latte.\n\nIt woke me up.');
assert.deepEqual(l.grammar, ['一般过去时']);
assert.deepEqual(r.warnings, []);
// 同一天同一主题：id 稳定
assert.equal(parsePracticeSheet(v1 + '\nMore.', opts).lessons[0].id, l.id);

// 3. 合并：旧卡片保留进度，新卡片追加
const reviewed = { ...l, cards: l.cards.map((c, i) => (i === 0 ? { ...c, due: 999, interval: 3, reviewHistory: [{ id: 'r1', at: 1, rating: 'good', due: 999 }] } : c)) };
const again = parsePracticeSheet(v1.replace('slice | 片', 'slice | 片\nloaf | 一整个面包'), opts).lessons[0];
const m = mergeLesson(reviewed, again);
assert.equal(m.added, 1);
assert.equal(m.lesson.cards.length, 5);
assert.equal(m.lesson.cards[0].due, 999);
assert.equal(m.lesson.cards[0].reviewHistory.length, 1);
assert.equal(m.lesson.cards[4].en, 'loaf');

// 4. 只有纠错、没有词汇 → 不生成记录并给出提示
r = parsePracticeSheet('#练习单 v1\n【纠错】\na => b', opts);
assert.equal(r.lessons.length, 0);
assert.match(r.warnings[0], /词汇/);

// 5. 不是练习单 → null；通用导入仍然工作
assert.equal(looksLikePracticeSheet('拿铁 | Latte'), false);
assert.equal(parsePracticeSheet('拿铁 | Latte', opts), null);

// 6. 本地导入入口走练习单；从 artifact 导出的 JSON 再导入本地，字段不丢
const viaImport = parseImport(v1, { today: '2026-11-06', now, topic: '' });
assert.equal(viaImport.lessons[0].id, l.id);
assert.equal(viaImport.lessons[0].cards[2].kind, 'collocation');
const sent = parseImport(JSON.stringify([{ ...l, cards: [l.cards[3]] }]), { today: '2026-11-06', now, topic: '' }).lessons[0];
assert.deepEqual(sent.cards[0].steps, [{ en: 'go to bed', zh: '睡觉' }, { en: 'go to bed at ten' }]);
assert.equal(sent.cards[0].parts.length, 6);
const exported = JSON.stringify([{ ...l, cards: [{ ...l.cards[2], note: '可数', memory: { dueAt: '2026-11-08T00:00:00.000Z', lastReviewAt: null }, scheduler: 'fsrs-6' }] }]);
const back = parseImport(exported, { today: '2026-11-06', now, topic: '' }).lessons[0];
assert.equal(back.cards[0].kind, 'collocation');
assert.equal(back.cards[0].note, '可数');
assert.equal(back.cards[0].memory.dueAt, '2026-11-08T00:00:00.000Z');

console.log('PASS: legacy sheet without correction cards, v1 vocab/phrase/collocation, stable id, merge keeps progress, fallback, local import keeps fields');
