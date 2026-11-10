import assert from 'node:assert/strict';
import { buildSteps, makeWords, gradeSentence, norm, targetOf, wordsFor, groupWords, roleSegments, patternOf, charRoles } from '../shared/typing.js';

// 比对：忽略大小写、撇号和首尾标点
assert.equal(norm("I'm,"), 'im');
assert.equal(norm('Hello!'), 'hello');
assert.equal(targetOf('I run. / I am running.'), 'I run.');

const card = {
  zh: '我把两片面包烤了。', en: 'I toasted two slices of bread.',
  steps: [{ en: 'two slices of bread', zh: '两片面包' }, { en: 'I toasted two slices of bread.', zh: '整句' }, { en: '  ', zh: 'x' }],
  parts: [{ r: 'S', t: 'I' }, { r: 'V', t: 'toasted' }, { r: 'O', t: 'two slices of bread' }],
  pos: [{ t: 'I', p: '代' }, { t: 'toasted', p: '动' }, { t: 'two', p: '数' }, { t: 'slices', p: '名' }, { t: 'of', p: '介' }, { t: 'bread', p: '名' }],
};

// 步骤：由短到长，重复的整句和空步骤被去掉，最后一步永远是整句
const steps = buildSteps(card);
assert.deepEqual(steps.map((s) => s.en), ['two slices of bread', 'I toasted two slices of bread.']);
assert.equal(buildSteps({ zh: 'z', en: 'Hi there' }).length, 1);

// 整句：有主语和谓语 → 句子成分；短语 → 词性
const full = makeWords(card, steps[1]);
assert.deepEqual(full.map((w) => w.roles?.[0]), ['S', 'V', 'O', 'O', 'O', 'O']);
const phrase = makeWords(card, steps[0]);
assert.equal(phrase[0].roles, null);
assert.deepEqual(phrase.map((w) => w.pos), ['数', '名', '介', '名']);
assert.ok(full.every((w) => w.done === false && w.hinted === false));

// 纯标点的词不用输入
assert.equal(makeWords({ zh: 'z', en: 'Hi - there' }, { en: 'Hi - there' })[1].done, true);

// 分组：同一成分的连续词合成一组，缩写拆开
const groups = groupWords(wordsFor(card, targetOf(card.en).split(/\s+/)));
assert.deepEqual(groups.map((g) => [g.r, g.text]), [['S', 'I'], ['V', 'toasted'], ['O', 'two slices of bread.']]);
assert.deepEqual(roleSegments("I'm", ['S', 'V', 'V']).map((g) => [g.r, g.text]), [['S', 'I'], ['V', "'m"]]);
assert.deepEqual(roleSegments('plain', null), [{ r: null, text: 'plain' }]);
assert.equal(patternOf(card.parts), '主谓宾');
assert.equal(charRoles({ ...card, parts: [{ r: 'S', t: 'wrong' }] }), null);

// 评分
assert.equal(gradeSentence(0, 0), 'perfect');
assert.equal(gradeSentence(2, 0), 'good');
assert.equal(gradeSentence(3, 0), 'again');
assert.equal(gradeSentence(0, 1), 'again');

console.log('PASS: typing logic: matching, steps short→long, roles/pos, groups, grading');
