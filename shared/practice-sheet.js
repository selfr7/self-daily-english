// 练习单解析器：本地 Next.js 应用和 Claude Artifact 共用同一份代码。
// 只用纯 JavaScript、不依赖 node 或浏览器 API，这样两边可以直接拿去用。
// 支持：
//   1. 固定格式「#练习单 v1」（见 IMPORT_PLAN.md）
//   2. 旧格式：错误与正确表达 / 重点词汇 / 词组与固定搭配 / 语法 / 完整英文段落
// 构建 artifact 时，scripts/build-artifact.mjs 会把本文件内联进页面（去掉 export 关键字），
// 所以这里只写顶层 function / const，不要写 import。

export const SHEET_VERSION = 'practice-sheet-v1';

const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿]/;
const CJK_ALL = /[぀-ヿ㐀-鿿豈-﫿]/g;

const SECTION_NAMES = {
  correction: ['纠错', '错误与正确表达', '改错', '错误纠正', '纠正'],
  vocab: ['词汇', '重点词汇', '单词', '生词'],
  phrase: ['词组', '词组与固定搭配', '短语', '词组与搭配'],
  collocation: ['固定搭配', '搭配', '常用搭配'],
  sentence: ['句子', '例句', '好句', '常用句子', '实用句子'],
  grammar: ['语法', '语法点', '语法要点'],
  paragraph: ['段落', '完整英文段落', '全文', '英文段落', '完整段落'],
  topic: ['对话主题', '话题'],
};
const LEGACY_HEADERS = new Set(Object.values(SECTION_NAMES).flat());
const CORRECTION_TABLE_HEADERS = new Set(['我说的', '正确表达', '原句', '正确说法', '我的说法', '改正']);

/** 32 位 FNV-1a 哈希，转成 base36。两边算出来一样，用来生成稳定的 id。 */
export function stableHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** 把各种日期写法统一成 YYYY-MM-DD；认不出返回 undefined。 */
export function sheetDate(s) {
  if (typeof s !== 'string') return undefined;
  const m = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined;
}

function sectionOf(name) {
  const n = name.replace(/\s+/g, '');
  for (const [kind, names] of Object.entries(SECTION_NAMES)) if (names.includes(n)) return kind;
  return undefined;
}

/** 一行是不是段标题：【纠错】 [纠错] ## 纠错，或旧格式里单独一行的「重点词汇」。 */
function headerOf(line) {
  const m = line.match(/^(?:【\s*(.+?)\s*】|\[\s*(.+?)\s*\]|#{1,6}\s+(.+?))\s*[:：]?$/);
  if (m) return sectionOf(m[1] || m[2] || m[3]) ?? (m[1] || m[2] ? 'unknown' : undefined);
  const bare = line.replace(/[:：]$/, '').trim();
  return LEGACY_HEADERS.has(bare) ? sectionOf(bare) : undefined;
}

/** 文本是不是练习单（新格式或旧格式）。 */
export function looksLikePracticeSheet(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  if (/^#\s*练习单/.test(lines[0])) return true;
  let hits = 0;
  for (const l of lines) {
    const bare = l.replace(/^【|】$|[:：]$/g, '').trim();
    if (LEGACY_HEADERS.has(bare)) hits++;
  }
  return hits >= 2;
}

const stripBullet = (s) => s.replace(/^(?:[•·●▪◦*\-–—]|\d{1,3}[.、)）])\s*/, '').trim();
const cjkCount = (s) => (s.match(CJK_ALL) ?? []).length;

/** 「英文 | 中文」「英文：中文」「英文 - 中文」拆成 {en, zh}；拆不开返回 null。 */
function splitTerm(line) {
  const s = stripBullet(line);
  for (const sep of ['|', '｜', '：', ':', ' - ', ' — ', ' – ', '\t', '=']) {
    const i = s.indexOf(sep);
    if (i <= 0) continue;
    const a = s.slice(0, i).trim(), b = s.slice(i + sep.length).trim();
    if (!a || !b) continue;
    // 英文那一边汉字更少
    return cjkCount(a) <= cjkCount(b) ? { en: a, zh: b } : { en: b, zh: a };
  }
  return null;
}

/** 句子成分代码：S 主语、V 谓语、O 宾语、C 表语、K 补语、A 状语、J 连接词 */
export const ROLE_CODES = { '主': 'S', '主语': 'S', '谓': 'V', '谓语': 'V', '系': 'V', '宾': 'O', '宾语': 'O', '表': 'C', '表语': 'C', '补': 'K', '补语': 'K', '宾补': 'K', '状': 'A', '状语': 'A', '连': 'J', '连词': 'J', S: 'S', V: 'V', O: 'O', C: 'C', K: 'K', A: 'A', J: 'J' };

/** 只保留字母、数字、撇号，用来比对成分和原句 */
export function normChars(s) {
  return String(s).toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9']/g, '');
}

function parseParts(body) {
  const parts = [];
  for (const seg of body.split(/\s*[|｜]\s*/)) {
    if (!seg.trim()) continue;
    const m = seg.match(/^\s*([^:：\s]+)\s*[:：]\s*(.+)$/);
    const r = m && ROLE_CODES[m[1].trim()];
    if (!r) return null;
    parts.push({ r, t: m[2].trim() });
  }
  return parts.length ? parts : null;
}

/** 词性：句子下面以 ~ 开头的行，~ two:数 | slices:名 | of:介 | bread:名 */
export const POS_CODES = { '名': '名', '名词': '名', n: '名', '动': '动', '动词': '动', v: '动', '形': '形', '形容词': '形', adj: '形', '副': '副', '副词': '副', adv: '副', '介': '介', '介词': '介', prep: '介', '冠': '冠', '冠词': '冠', art: '冠', '代': '代', '代词': '代', pron: '代', '数': '数', '数词': '数', num: '数', '连': '连', '连词': '连', conj: '连', '助': '助', '助词': '助', '助动': '助', aux: '助', '感': '感', '感叹词': '感', int: '感' };

function parsePos(body) {
  const pos = [];
  for (const seg of body.split(/\s*[|｜]\s*/)) {
    if (!seg.trim()) continue;
    const m = seg.match(/^\s*(.+?)\s*[:：]\s*([^:：\s]+)\s*$/);
    const p = m && POS_CODES[m[2].trim().toLowerCase().replace(/\.$/, '')];
    if (!p) return null;
    pos.push({ t: m[1].trim(), p });
  }
  return pos.length ? pos : null;
}

/** 各成分拼起来必须正好是原句（不管空格、大小写、标点） */
export function partsMatch(parts, en) {
  const target = normChars(String(en).split(/\s+\/\s+/)[0]);
  return !!target && parts.map((p) => normChars(p.t)).join('') === target;
}

function splitBar(line) {
  const s = stripBullet(line);
  const i = Math.max(s.lastIndexOf('|'), s.lastIndexOf('｜'));
  if (i <= 0) return null;
  const a = s.slice(0, i).trim(), b = s.slice(i + 1).trim();
  if (!a || !b) return null;
  return cjkCount(a) <= cjkCount(b) ? { en: a, zh: b } : { en: b, zh: a };
}

/**
 * 解析练习单。不是练习单返回 null（调用方改用通用导入）。
 * @param {string} text
 * @param {{today: string, now: number}} opts today 用北京时间的 YYYY-MM-DD
 * @returns {{lessons: object[], warnings: string[]} | null}
 */
export function parsePracticeSheet(text, opts) {
  if (!looksLikePracticeSheet(text)) return null;
  const warnings = [];
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  let date, topic = '', section;
  const topicLines = [], grammar = [], paragraph = [], corrections = [], cards = [];
  let pendingSaid = null; // 旧格式：错句和正确说法各占一行
  let skipped = 0;

  // 纠错只存进记录（全文里只显示正确说法），不做成卡片：卡片只练词汇、词组、固定搭配，不反复看错句。
  const addCorrection = (said, corrected, zh, note) => {
    said = said.trim(); corrected = corrected.trim();
    if (!said || !corrected) { skipped++; return; }
    corrections.push({ original: said, corrected, ...(zh?.trim() ? { meaning: zh.trim() } : {}), ...(note?.trim() ? { explanation: note.trim() } : {}) });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { if (section === 'paragraph' && paragraph.length && paragraph[paragraph.length - 1] !== '') paragraph.push(''); continue; }
    if (/^#\s*练习单/.test(line)) continue;

    const meta = line.match(/^(日期|date|主题|topic)\s*[:：]\s*(.+)$/i);
    if (meta && section !== 'paragraph') {
      if (/^(日期|date)$/i.test(meta[1])) {
        const d = sheetDate(meta[2]);
        if (d) date = d; else warnings.push(`日期「${meta[2]}」认不出，已用今天`);
      } else topic = meta[2].trim();
      continue;
    }

    const h = headerOf(line);
    if (h) {
      if (pendingSaid) { warnings.push(`纠错「${pendingSaid}」后面缺少正确说法，已跳过`); pendingSaid = null; }
      section = h === 'unknown' ? undefined : h;
      if (h === 'unknown') warnings.push(`不认识的段「${line}」，这一段已跳过`);
      continue;
    }

    if (!section) {
      // 标题行，比如「英语口语练习 2026-11-06」
      if (!date) { const d = sheetDate(line); if (d) { date = d; continue; } }
      continue;
    }

    switch (section) {
      case 'topic':
        topicLines.push(stripBullet(line));
        break;
      case 'correction': {
        const s = stripBullet(line);
        if (CORRECTION_TABLE_HEADERS.has(s)) break;
        const arrow = s.match(/^(.+?)\s*(?:=>|⇒|→|->)\s*(.+)$/);
        if (arrow) {
          if (pendingSaid) { warnings.push(`纠错「${pendingSaid}」后面缺少正确说法，已跳过`); pendingSaid = null; }
          const [corrected, zh, note] = arrow[2].split(/\s*\|\|\s*/);
          addCorrection(arrow[1], corrected ?? '', zh, note);
        } else if (pendingSaid === null) {
          pendingSaid = s;
        } else {
          addCorrection(pendingSaid, s);
          pendingSaid = null;
        }
        break;
      }
      case 'vocab':
      case 'phrase':
      case 'collocation':
      case 'sentence': {
        // 句子下面以 = 开头的行是句子成分：= 主:I | 谓:toasted | 宾:two slices of bread
        if (section === 'sentence' && /^[=＝]/.test(line)) {
          const last = cards[cards.length - 1];
          if (!last || last.kind !== 'sentence') { skipped++; break; }
          const parts = parseParts(line.replace(/^[=＝]\s*/, ''));
          if (parts && partsMatch(parts, last.en)) last.parts = parts;
          else warnings.push(`「${last.en}」的句子成分和原句对不上，已忽略`);
          break;
        }
        // 句子下面以 ~ 开头的行是每个词的词性：~ I:代 | toasted:动 | two:数 | slices:名 | of:介 | bread:名
        if (section === 'sentence' && /^[~～]/.test(line)) {
          const last = cards[cards.length - 1];
          if (!last || last.kind !== 'sentence') { skipped++; break; }
          const pos = parsePos(line.replace(/^[~～]\s*/, ''));
          if (pos && partsMatch(pos, last.en)) last.pos = pos;
          else warnings.push(`「${last.en}」的词性和原句对不上，已忽略`);
          break;
        }
        // 句子下面以 > 开头的行是拆分步骤（由短到长），中文可省略
        if (section === 'sentence' && /^[>＞]/.test(line)) {
          const last = cards[cards.length - 1];
          const body = line.replace(/^[>＞]\s*/, '');
          const st = splitBar(body) ?? (CJK_RE.test(body) ? null : { en: body.trim(), zh: '' });
          if (!last || last.kind !== 'sentence' || !st?.en) { skipped++; break; }
          if (st.en.toLowerCase() !== last.en.toLowerCase()) (last.steps ??= []).push(st.zh ? { en: st.en, zh: st.zh } : { en: st.en });
          break;
        }
        // 句子里常有冒号、破折号，只按 | 切
        const t = section === 'sentence' ? splitBar(line) : splitTerm(line);
        if (t) cards.push({ kind: section, zh: t.zh, en: t.en, due: opts.now, interval: 0 });
        else skipped++;
        break;
      }
      case 'grammar': {
        const g = stripBullet(line);
        if (g) grammar.push(g);
        break;
      }
      case 'paragraph':
        paragraph.push(raw.trim());
        break;
    }
  }
  if (pendingSaid) warnings.push(`纠错「${pendingSaid}」后面缺少正确说法，已跳过`);
  if (skipped) warnings.push(`有 ${skipped} 行看不出两面，已跳过`);

  if (!topic && topicLines.length) topic = topicLines.join('、');
  topic = topic || '口语练习';
  date = date || opts.today;
  while (paragraph.length && paragraph[paragraph.length - 1] === '') paragraph.pop();

  if (!cards.length) {
    warnings.unshift('这份练习单里没有识别到词汇、词组、固定搭配或句子');
    return { lessons: [], warnings };
  }
  const lesson = {
    id: `ps-${date}-${stableHash(topic)}`,
    date,
    topic,
    paragraph: paragraph.join('\n'),
    cards,
    source: SHEET_VERSION,
  };
  if (grammar.length) lesson.grammar = grammar;
  if (corrections.length) lesson.corrections = corrections;
  return { lessons: [lesson], warnings };
}

/** 卡片在同一份记录里的身份：同样的原话 + 同样的英文算同一张。 */
export function cardKey(card) {
  const n = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n(card.said) + '\u0001' + n(card.en);
}

/**
 * 同一份记录再导入一次时合并：已有卡片保留复习进度（只更新文字），新卡片追加在后面，
 * 不删除旧卡片，所以卡片的序号不会变。返回 {lesson, added}。
 */
export function mergeLesson(old, incoming) {
  const cards = old.cards.map((c) => ({ ...c }));
  const index = new Map(cards.map((c, i) => [cardKey(c), i]));
  let added = 0;
  for (const c of incoming.cards) {
    const i = index.get(cardKey(c));
    if (i === undefined) { index.set(cardKey(c), cards.length); cards.push(c); added++; continue; }
    const keep = cards[i];
    cards[i] = { ...keep, zh: c.zh || keep.zh, ...(c.note ? { note: c.note } : {}), ...(c.kind ? { kind: c.kind } : {}), ...(c.steps?.length ? { steps: c.steps } : {}), ...(c.parts?.length ? { parts: c.parts } : {}), ...(c.pos?.length ? { pos: c.pos } : {}) };
  }
  const lesson = { ...old, ...incoming, id: old.id, cards };
  if (!incoming.paragraph) lesson.paragraph = old.paragraph ?? '';
  if (!incoming.grammar?.length && old.grammar) lesson.grammar = old.grammar;
  if (!incoming.corrections?.length && old.corrections) lesson.corrections = old.corrections;
  return { lesson, added };
}

/** 发给 AI 的固定格式说明，页面上有「复制」按钮。 */
export const SHEET_PROMPT = `每次英语口语练习结束、我说「总结」时，用下面的固定格式输出，并且整段放在一个代码块里，方便我一键复制。不要改格式，不要加其它说明。
重点是【词汇】【词组】【固定搭配】【句子】：把这次对话里我用到的、我想说却不会说的、你建议我用的都列出来，每行一条，英文在前，中文在后，用 | 隔开。
【句子】只写正确、自然、值得记住的完整句子（包括纠错后的正确说法），不写我说错的原句。每个句子下面先用一行 = 标出句子成分：按原句顺序把整句切成几段，每段写成「成分:英文」，用 | 隔开，成分只用 主、谓、宾、表、补、状、连（连接两个分句的词，如 and、because），各段拼起来必须正好是原句。接着用一行 ~ 标出每个词的词性：按原句顺序每个词写成「英文:词性」，用 | 隔开，词性只用 名、动、形、副、介、冠、代、数、连、助、感（to do 里的 to 记作 介），缩写拆开写（I'm 写成 I:代 | 'm:动），各词拼起来必须正好是原句。然后用 > 开头的行写 2～4 个拆分步骤：从句子里取出由短到长的片段，每个片段都要是原句里连续的一段，并配上中文；最后的整句不用重复写。

#练习单 v1
日期: YYYY-MM-DD
主题: 这次聊了什么（8 个字以内，比如「早餐与睡眠」）

【词汇】
英文 | 中文

【词组】
英文 | 中文

【固定搭配】
英文 | 中文

【句子】
I want to learn more about my ego. | 我想更多了解我的自我。
= 主:I | 谓:want | 宾:to learn more about my ego
~ I:代 | want:动 | to:介 | learn:动 | more:副 | about:介 | my:代 | ego:名
> my ego | 我的自我
> learn more about my ego | 更多了解我的自我

【纠错】
我原话 => 正确表达

【语法】
- 一条语法说明

【段落】
把我今天说的内容整理成自然的英文段落，可以分几段。`;
